/*
 * Supabase store — the real thing. One `responses` table (see
 * backend/supabase/schema.sql) with flat columns for the headline numbers
 * and the whole SessionRecord as jsonb. Writes are upserts on session_id; a
 * BEFORE UPDATE trigger in the database ignores stale writes (lower seq) and
 * keeps the original created_at.
 *
 * Uses the service-role / secret key, which bypasses row level security, so
 * it must only ever run on the server.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SessionRecord } from "@preflight/shared/types";
import type { ResponseStore } from "./types";

export const TABLE = "responses";

/** Rows per request. PostgREST caps a response at 1,000 rows by default, so listing pages through. */
export const PAGE_SIZE = 1000;
const MAX_PAGES = 500;

/** Postgres `integer` upper bound (dashboard_active_ms). */
const INT4_MAX = 2_147_483_647;

export interface SupabaseConfig {
  url: string;
  /** Service-role or secret (sb_secret_…) key — never the anon/publishable key. */
  key: string;
}

function firstSet(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** Read fresh on every call so tests (and a restarted process) see the current environment. */
export function supabaseConfig(): SupabaseConfig | null {
  // Only the project origin ("https://<ref>.supabase.co"): a pasted "/rest/v1/" or any other
  // path would be doubled by the client and fail with PGRST125.
  const url = projectOrigin(firstSet(process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL));
  const key = firstSet(process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.SUPABASE_SECRET_KEY);
  return url && key ? { url, key } : null;
}

let cached: { id: string; client: SupabaseClient } | null = null;

function projectOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value.trim()).origin;
  } catch {
    return value.trim();
  }
}

/** One client per (url, key); a server-side client keeps no session and refreshes no token. */
export function getClient(config: SupabaseConfig): SupabaseClient {
  const id = `${config.url}\n${config.key}`;
  if (!cached || cached.id !== id) {
    cached = {
      id,
      client: createClient(config.url, config.key, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    };
  }
  return cached.client;
}

/** The columns we write. `updated_at` and the generated delta_* columns are the database's job. */
export interface ResponseRow {
  session_id: string;
  seq: number;
  created_at: string;
  completed_at: string | null;
  step: string;
  variant: string;
  variant_source: string;
  is_test: boolean;
  device_type: string;
  pre_anxiety: number | null;
  pre_control: number | null;
  pre_predictability: number | null;
  post_anxiety: number | null;
  post_control: number | null;
  post_predictability: number | null;
  smoothness_score: number | null;
  dashboard_active_ms: number | null;
  sections_opened: number | null;
  alert_tapped: boolean | null;
  check_frequency: string | null;
  email: string | null;
  record: SessionRecord;
}

export function recordToRow(record: SessionRecord): ResponseRow {
  const dashboard = record.dashboard;
  const sectionsOpened = dashboard
    ? Object.values(dashboard.sections).filter((stats) => stats !== undefined && stats.opens > 0).length
    : null;
  return {
    session_id: record.sessionId,
    seq: record.seq,
    created_at: record.createdAt,
    completed_at: record.completedAt,
    step: record.step,
    variant: record.variant,
    variant_source: record.variantSource,
    is_test: record.isTest,
    device_type: record.device.type,
    pre_anxiety: record.pre.anxiety,
    pre_control: record.pre.control,
    pre_predictability: record.pre.predictability,
    post_anxiety: record.post.anxiety,
    post_control: record.post.control,
    post_predictability: record.post.predictability,
    smoothness_score: record.flight ? Math.round(record.flight.smoothnessScore) : null,
    dashboard_active_ms: dashboard ? Math.min(INT4_MAX, Math.round(dashboard.activeMs)) : null,
    sections_opened: sectionsOpened,
    alert_tapped: dashboard ? dashboard.alert.tapped : null,
    check_frequency: record.post.checkFrequency,
    email: record.email || null,
    record,
  };
}

/** The full record lives in the jsonb column; the flat columns are only for quick queries. */
export function rowToRecord(row: unknown): SessionRecord {
  if (typeof row !== "object" || row === null || !("record" in row)) {
    throw new Error("Unexpected row from Supabase: no record column");
  }
  let record: unknown = (row as { record: unknown }).record;
  if (typeof record === "string") record = JSON.parse(record);
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error("Unexpected row from Supabase: record is not an object");
  }
  return record as SessionRecord;
}

function describe(error: { message: string; code?: string; details?: string | null; hint?: string | null }): string {
  const parts = [error.message];
  if (error.code) parts.push(`code ${error.code}`);
  if (error.details) parts.push(error.details);
  if (error.hint) parts.push(`hint: ${error.hint}`);
  return parts.join(" — ");
}

export function createSupabaseStore(config: SupabaseConfig): ResponseStore {
  const client = getClient(config);
  return {
    async upsert(record) {
      const { error } = await client.from(TABLE).upsert(recordToRow(record), { onConflict: "session_id" });
      if (error) throw new Error(`Supabase upsert failed: ${describe(error)}`);
    },

    async list() {
      const records: SessionRecord[] = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const from = page * PAGE_SIZE;
        const { data, error } = await client
          .from(TABLE)
          .select("record")
          .order("created_at", { ascending: false })
          .order("session_id", { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw new Error(`Supabase list failed: ${describe(error)}`);
        const rows: unknown[] = data ?? [];
        for (const row of rows) records.push(rowToRecord(row));
        if (rows.length < PAGE_SIZE) break;
      }
      return records;
    },
  };
}
