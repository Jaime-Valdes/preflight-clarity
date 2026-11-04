/*
 * Supabase store — the real thing. Three tables (see backend/supabase/schema.sql),
 * each with flat columns for quick queries and the whole object as jsonb:
 *
 *   responses — one SessionRecord per session, upserted on session_id. A BEFORE
 *               UPDATE trigger in the database ignores stale writes (lower seq)
 *               and keeps the original created_at.
 *   signups   — one product-interest Signup per email per source
 *               (docs/INTEREST.md), upserted on (email_key, source); its trigger
 *               keeps the original created_at.
 *   route_days — version D's cached schedules (lib/flights/cache.ts), one
 *               RouteDaySchedule per route, local date and provider, upserted
 *               on the three; a trigger drops rows fetched over 7 days ago.
 *
 * Uses the service-role / secret key, which bypasses row level security, so
 * it must only ever run on the server.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { RouteDaySchedule } from "@preflight/shared/schedule";
import type { SessionRecord, Signup } from "@preflight/shared/types";
import { ROUTE_DAY_MAX_AGE_MS, routeDayAgeMs, type ProviderName, type RouteDayRecord } from "../flights/types";
import type { ResponseStore } from "./types";

export const TABLE = "responses";
export const SIGNUPS_TABLE = "signups";
export const ROUTE_DAYS_TABLE = "route_days";

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

// ── responses ───────────────────────────────────────────────────────────────

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
  worries_most: string | null;
  anxiety_starts: string | null;
  /** Comma-joined TravelImpact values; null when unanswered. */
  travel_impact: string | null;
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
    worries_most: record.pre.worriesMost ?? null,
    anxiety_starts: record.pre.anxietyStarts ?? null,
    travel_impact: record.post.travelImpact?.length ? record.post.travelImpact.join(",") : null,
    email: record.email || null,
    record,
  };
}

/** The full record lives in the jsonb column; the flat columns are only for quick queries. */
export function rowToRecord(row: unknown): SessionRecord {
  return recordColumn(row) as SessionRecord;
}

// ── signups ─────────────────────────────────────────────────────────────────

/** The columns we write. `email_key` is generated by the database from `email`; `updated_at` is its job too. */
export interface SignupRow {
  id: string;
  created_at: string;
  source: string;
  placement: string;
  email: string;
  first_name: string | null;
  waitlist: boolean;
  interview: boolean;
  session_id: string | null;
  variant: string | null;
  is_test: boolean;
  participant: string | null;
  context: string | null;
  page: string | null;
  record: Signup;
}

export function signupToRow(signup: Signup): SignupRow {
  return {
    id: signup.id,
    created_at: signup.createdAt,
    source: signup.source,
    placement: signup.placement,
    email: signup.email,
    first_name: signup.firstName || null,
    waitlist: signup.waitlist,
    interview: signup.interview,
    session_id: signup.sessionId,
    variant: signup.variant,
    is_test: signup.isTest,
    participant: signup.participant || null,
    context: signup.context || null,
    page: signup.page || null,
    record: signup,
  };
}

/** The full sign-up lives in the jsonb column, with the original createdAt kept by the trigger. */
export function rowToSignup(row: unknown): Signup {
  return recordColumn(row) as Signup;
}

// ── route days ──────────────────────────────────────────────────────────────

/** The columns of `route_days`, all written by the API. `date` is the origin's local day, "YYYY-MM-DD". */
export interface RouteDayRow {
  route: string;
  date: string;
  provider: string;
  fetched_at: string;
  expires_at: string;
  payload: RouteDaySchedule;
}

export function routeDayToRow(record: RouteDayRecord): RouteDayRow {
  return {
    route: record.route,
    date: record.date,
    provider: record.provider,
    fetched_at: record.fetchedAt,
    expires_at: record.expiresAt,
    payload: record.payload,
  };
}

/** A row back to a record. Postgres timestamps ("…+00:00") come back as ISO instants. */
export function rowToRouteDay(row: unknown): RouteDayRecord {
  if (typeof row !== "object" || row === null) throw new Error("Unexpected row from Supabase: not an object");
  const columns = row as Record<string, unknown>;
  const text = (name: string): string => {
    const value = columns[name];
    if (typeof value !== "string" || !value) throw new Error(`Unexpected row from Supabase: ${name} is not a string`);
    return value;
  };
  let payload: unknown = columns.payload;
  if (typeof payload === "string") payload = JSON.parse(payload);
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("Unexpected row from Supabase: payload is not an object");
  }
  return {
    route: text("route"),
    date: text("date").slice(0, 10),
    provider: text("provider") as ProviderName,
    fetchedAt: isoInstant(text("fetched_at")),
    expiresAt: isoInstant(text("expires_at")),
    payload: payload as RouteDaySchedule,
  };
}

function isoInstant(value: string): string {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : value;
}

// ── shared ──────────────────────────────────────────────────────────────────

/** The `record` jsonb column of a row (an object, or a JSON string from some clients). */
function recordColumn(row: unknown): unknown {
  if (typeof row !== "object" || row === null || !("record" in row)) {
    throw new Error("Unexpected row from Supabase: no record column");
  }
  let record: unknown = (row as { record: unknown }).record;
  if (typeof record === "string") record = JSON.parse(record);
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error("Unexpected row from Supabase: record is not an object");
  }
  return record;
}

/** Flat columns added after the table was first created (schema.sql adds them with `add column if not exists`). */
export const NEWER_RESPONSE_COLUMNS = ["worries_most", "anxiety_starts", "travel_impact"] as const;

/** PostgREST "column not in schema cache" (PGRST204) or Postgres "undefined column" (42703). */
export function isMissingColumn(error: { code?: string; message: string }): boolean {
  return error.code === "PGRST204" || error.code === "42703" || /column .* does not exist|Could not find the '.*' column/i.test(error.message);
}

/** The row without the newer flat columns, for a table that doesn't have them yet. */
export function withoutNewerColumns(row: ResponseRow): Omit<ResponseRow, (typeof NEWER_RESPONSE_COLUMNS)[number]> {
  const rest: Record<string, unknown> = { ...row };
  for (const column of NEWER_RESPONSE_COLUMNS) delete rest[column];
  return rest as Omit<ResponseRow, (typeof NEWER_RESPONSE_COLUMNS)[number]>;
}

function describe(error: { message: string; code?: string; details?: string | null; hint?: string | null }): string {
  const parts = [error.message];
  if (error.code) parts.push(`code ${error.code}`);
  if (error.details) parts.push(error.details);
  if (error.hint) parts.push(`hint: ${error.hint}`);
  return parts.join(" — ");
}

/** Every row of `table`, newest first (created_at desc, then `tiebreak` asc), fetched page by page. */
async function listAll<T>(client: SupabaseClient, table: string, tiebreak: string, map: (row: unknown) => T): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await client
      .from(table)
      .select("record")
      .order("created_at", { ascending: false })
      .order(tiebreak, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Supabase list (${table}) failed: ${describe(error)}`);
    const rows: unknown[] = data ?? [];
    for (const row of rows) out.push(map(row));
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

export function createSupabaseStore(config: SupabaseConfig): ResponseStore {
  const client = getClient(config);
  return {
    async upsert(record) {
      const row = recordToRow(record);
      const { error } = await client.from(TABLE).upsert(row, { onConflict: "session_id" });
      if (!error) return;
      // The table predates a column this version writes (schema.sql not re-run yet): the full
      // record is in the jsonb column regardless, so store it without the newer flat columns
      // rather than lose the session. The team should re-run schema.sql to get the columns.
      if (isMissingColumn(error)) {
        console.warn(`responses: ${describe(error)} — saving without the newer columns; re-run backend/supabase/schema.sql`);
        const retry = await client.from(TABLE).upsert(withoutNewerColumns(row), { onConflict: "session_id" });
        if (!retry.error) return;
        throw new Error(`Supabase upsert failed: ${describe(retry.error)}`);
      }
      throw new Error(`Supabase upsert failed: ${describe(error)}`);
    },

    list() {
      return listAll(client, TABLE, "session_id", rowToRecord);
    },

    async upsertSignup(signup) {
      // One row per email per source; the database keeps the original created_at.
      const { error } = await client.from(SIGNUPS_TABLE).upsert(signupToRow(signup), { onConflict: "email_key,source" });
      if (error) throw new Error(`Supabase upsert (${SIGNUPS_TABLE}) failed: ${describe(error)}`);
    },

    listSignups() {
      return listAll(client, SIGNUPS_TABLE, "id", rowToSignup);
    },

    async getRouteDay(route, date, provider) {
      const { data, error } = await client
        .from(ROUTE_DAYS_TABLE)
        .select("route,date,provider,fetched_at,expires_at,payload")
        .eq("route", route)
        .eq("date", date)
        .eq("provider", provider)
        .maybeSingle();
      if (error) throw new Error(`Supabase read (${ROUTE_DAYS_TABLE}) failed: ${describe(error)}`);
      if (!data) return null;
      const record = rowToRouteDay(data);
      // Past AeroDataBox's 7-day cache rule: dropped on sight (the trigger only runs on writes), never served.
      if (routeDayAgeMs(record, Date.now()) > ROUTE_DAY_MAX_AGE_MS) {
        const gone = await client.from(ROUTE_DAYS_TABLE).delete().match({ route, date, provider });
        if (gone.error) console.warn(`Supabase delete (${ROUTE_DAYS_TABLE}) failed: ${describe(gone.error)}`);
        return null;
      }
      return record;
    },

    async putRouteDay(record) {
      // One row per route-day per provider; the trigger in schema.sql drops rows fetched over 7 days ago.
      const { error } = await client.from(ROUTE_DAYS_TABLE).upsert(routeDayToRow(record), { onConflict: "route,date,provider" });
      if (error) throw new Error(`Supabase upsert (${ROUTE_DAYS_TABLE}) failed: ${describe(error)}`);
    },
  };
}
