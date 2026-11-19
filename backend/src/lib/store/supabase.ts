/*
 * Supabase store — the real thing. Two tables (see backend/supabase/schema.sql),
 * each with flat columns for quick queries and the whole object as jsonb:
 *
 *   responses — one SessionRecord per session, upserted on session_id. A BEFORE
 *               UPDATE trigger in the database ignores stale writes (lower seq)
 *               and keeps the original created_at.
 *   signups   — one product-interest Signup per email per source
 *               (docs/INTEREST.md), upserted on (email_key, source); its trigger
 *               keeps the original created_at.
 *   d_feedback — version D's Flight Day Pack answers (docs/FLIGHT_DAY_PACK.md),
 *               one row per answered step, upserted on id.
 *
 * Uses the service-role / secret key, which bypasses row level security, so
 * it must only ever run on the server.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DFeedback, SessionRecord, Signup } from "@preflight/shared/types";
import type { ResponseStore } from "./types";

export const TABLE = "responses";
export const SIGNUPS_TABLE = "signups";
export const D_FEEDBACK_TABLE = "d_feedback";

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
  // The Flight Day Pack's columns (docs/FLIGHT_DAY_PACK.md, 2026-11-18): only on a row whose sign-up carries them,
  // so every other sign-up writes exactly the columns it did before, and a repeat without them leaves them alone.
  price_arm?: string;
  arm_forced?: boolean;
  offer_placement?: string;
  flight_date?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

/** The signups columns schema.sql added for the Flight Day Pack test. */
export const NEWER_SIGNUP_COLUMNS = [
  "price_arm",
  "arm_forced",
  "offer_placement",
  "flight_date",
  "utm_source",
  "utm_medium",
  "utm_campaign",
] as const;

export function signupToRow(signup: Signup): SignupRow {
  const pack: Partial<SignupRow> = {};
  if (signup.priceArm) pack.price_arm = signup.priceArm;
  if (signup.armForced) pack.arm_forced = true;
  if (signup.offerPlacement) pack.offer_placement = signup.offerPlacement;
  if (signup.flightDate) pack.flight_date = signup.flightDate;
  if (signup.utmSource) pack.utm_source = signup.utmSource;
  if (signup.utmMedium) pack.utm_medium = signup.utmMedium;
  if (signup.utmCampaign) pack.utm_campaign = signup.utmCampaign;
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
    ...pack,
  };
}

/** The sign-up row without the Flight Day Pack columns, for a table that doesn't have them yet. */
export function withoutNewerSignupColumns(row: SignupRow): SignupRow {
  const rest: Record<string, unknown> = { ...row };
  for (const column of NEWER_SIGNUP_COLUMNS) delete rest[column];
  return rest as unknown as SignupRow;
}

// ── d_feedback ──────────────────────────────────────────────────────────────

/** The columns we write; the answers stay one jsonb object, the full row in `record`. */
export interface DFeedbackRow {
  id: string;
  created_at: string;
  session_id: string;
  price_arm: string;
  arm_forced: boolean;
  placement: string;
  kind: string;
  answers: DFeedback["answers"];
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  is_test: boolean;
  record: DFeedback;
}

export function dFeedbackToRow(feedback: DFeedback): DFeedbackRow {
  return {
    id: feedback.id,
    created_at: feedback.createdAt,
    session_id: feedback.sessionId,
    price_arm: feedback.priceArm,
    arm_forced: feedback.armForced,
    placement: feedback.placement,
    kind: feedback.kind,
    answers: feedback.answers,
    utm_source: feedback.utmSource || null,
    utm_medium: feedback.utmMedium || null,
    utm_campaign: feedback.utmCampaign || null,
    is_test: feedback.isTest,
    record: feedback,
  };
}

export function rowToDFeedback(row: unknown): DFeedback {
  return recordColumn(row) as DFeedback;
}

/** The full sign-up lives in the jsonb column, with the original createdAt kept by the trigger. */
export function rowToSignup(row: unknown): Signup {
  return recordColumn(row) as Signup;
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
      const row = signupToRow(signup);
      const { error } = await client.from(SIGNUPS_TABLE).upsert(row, { onConflict: "email_key,source" });
      if (!error) return;
      // Only a Flight Day Pack sign-up writes the newer columns: before the migration is applied, keep the
      // lead (its fields are in the jsonb record regardless) rather than lose it, like the responses' fallback.
      if (isMissingColumn(error) && NEWER_SIGNUP_COLUMNS.some((c) => c in row)) {
        console.warn(`signups: ${describe(error)} — saving without the newer columns; apply backend/supabase/schema.sql`);
        const retry = await client.from(SIGNUPS_TABLE).upsert(withoutNewerSignupColumns(row), { onConflict: "email_key,source" });
        if (!retry.error) return;
        throw new Error(`Supabase upsert (${SIGNUPS_TABLE}) failed: ${describe(retry.error)}`);
      }
      throw new Error(`Supabase upsert (${SIGNUPS_TABLE}) failed: ${describe(error)}`);
    },

    listSignups() {
      return listAll(client, SIGNUPS_TABLE, "id", rowToSignup);
    },

    async upsertDFeedback(feedback) {
      // By id: a repeat of the same save replaces it; the trigger keeps the original created_at.
      const { error } = await client.from(D_FEEDBACK_TABLE).upsert(dFeedbackToRow(feedback), { onConflict: "id" });
      if (error) throw new Error(`Supabase upsert (${D_FEEDBACK_TABLE}) failed: ${describe(error)}`);
    },

    listDFeedback() {
      return listAll(client, D_FEEDBACK_TABLE, "id", rowToDFeedback);
    },
  };
}
