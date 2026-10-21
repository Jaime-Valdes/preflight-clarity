/*
 * Product-interest sign-ups (docs/INTEREST.md): validation of what the browser
 * sends, the team CSV, and the headline numbers for the results page.
 * Pure: no clock, no randomness.
 */
import type { SessionRecord, Signup, SignupPlacement, SignupSource, Variant } from "./types";

export const MAX_FIRST_NAME_CHARS = 60;
export const MAX_EMAIL_CHARS = 254;
export const MAX_CONTEXT_CHARS = 120;
export const MAX_PAGE_CHARS = 200;
export const MAX_PARTICIPANT_CHARS = 40;

export const SIGNUP_SOURCES: readonly SignupSource[] = ["study", "c"];
export const SIGNUP_PLACEMENTS: readonly SignupPlacement[] = ["debrief", "c_home", "c_results", "c_flight", "c_compare"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL_CHARS, "").trim();
  return cleaned.length <= max ? cleaned : Array.from(cleaned).slice(0, max).join("").trim();
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type ParsedSignup = { ok: true; signup: Signup } | { ok: false; error: string };

/**
 * Validates and sanitizes a sign-up from the browser. Rejects anything without
 * a UUID id, a plausible email and a known source/placement; everything else is
 * cleaned to a safe default. Unknown keys are dropped.
 */
export function parseSignup(input: unknown): ParsedSignup {
  if (!isObject(input)) return { ok: false, error: "invalid_body" };
  const id = typeof input.id === "string" ? input.id.trim().toLowerCase() : "";
  if (!UUID.test(id)) return { ok: false, error: "missing_id" };
  const email = text(input.email, MAX_EMAIL_CHARS + 1);
  if (email.length > MAX_EMAIL_CHARS || !EMAIL.test(email)) return { ok: false, error: "invalid_email" };
  const source = SIGNUP_SOURCES.find((s) => s === input.source);
  if (!source) return { ok: false, error: "invalid_source" };
  const placement = SIGNUP_PLACEMENTS.find((p) => p === input.placement);
  if (!placement) return { ok: false, error: "invalid_placement" };
  const createdMs = typeof input.createdAt === "string" ? Date.parse(input.createdAt) : NaN;
  if (!Number.isFinite(createdMs)) return { ok: false, error: "invalid_created_at" };
  const sessionId = typeof input.sessionId === "string" && UUID.test(input.sessionId.trim()) ? input.sessionId.trim().toLowerCase() : null;
  const variant: Variant | null = input.variant === "A" || input.variant === "B" ? input.variant : null;
  return {
    ok: true,
    signup: {
      schemaVersion: 1,
      id,
      createdAt: new Date(createdMs).toISOString(),
      source,
      placement,
      email,
      firstName: text(input.firstName, MAX_FIRST_NAME_CHARS),
      waitlist: input.waitlist !== false,
      interview: input.interview === true,
      sessionId,
      variant,
      isTest: input.isTest === true,
      participant: text(input.participant, MAX_PARTICIPANT_CHARS),
      context: text(input.context, MAX_CONTEXT_CHARS),
      page: text(input.page, MAX_PAGE_CHARS),
    },
  };
}

/** Newest first; id breaks ties so the order is stable. */
export function sortSignupsNewestFirst(signups: readonly Signup[]): Signup[] {
  const time = (iso: string) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : 0;
  };
  return [...signups].sort((a, b) => time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id));
}

// ── CSV ─────────────────────────────────────────────────────────────────────

export const SIGNUP_CSV_COLUMNS = [
  "id",
  "created_at",
  "source",
  "placement",
  "first_name",
  "email",
  "waitlist",
  "interview",
  "session_id",
  "variant",
  "is_test",
  "participant",
  "context",
  "page",
] as const;

function cell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  // A leading formula character is quoted and prefixed so spreadsheets never evaluate it.
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function signupsToCsv(signups: readonly Signup[]): string {
  const rows = signups.map((s) =>
    [s.id, s.createdAt, s.source, s.placement, s.firstName, s.email, s.waitlist, s.interview, s.sessionId ?? "", s.variant ?? "", s.isTest, s.participant, s.context, s.page]
      .map(cell)
      .join(","),
  );
  return [SIGNUP_CSV_COLUMNS.join(","), ...rows].join("\r\n") + "\r\n";
}

// ── Stats ───────────────────────────────────────────────────────────────────

export interface SignupRate {
  /** Sign-ups from real (non-test) sessions that reached the debrief. */
  signups: number;
  /** Real sessions that reached the debrief (the people who saw the form). */
  reachedDebrief: number;
  /** 0–100, or null when nobody reached the debrief. */
  pct: number | null;
}

export interface SignupStats {
  total: number;
  /** Distinct emails across every source (case-insensitive). */
  uniqueEmails: number;
  interview: number;
  bySource: Record<SignupSource, number>;
  byPlacement: Partial<Record<SignupPlacement, number>>;
  /** Study sign-up rate overall and per variant, real sessions only. */
  study: { all: SignupRate; A: SignupRate; B: SignupRate };
}

function rate(signups: number, reachedDebrief: number): SignupRate {
  return { signups, reachedDebrief, pct: reachedDebrief > 0 ? Math.round((100 * signups) / reachedDebrief) : null };
}

/**
 * Headline numbers. `records` are the study sessions (to count who reached the
 * debrief); a study sign-up counts toward a variant through its sessionId when
 * the record is known, else through the sign-up's own variant.
 */
export function signupStats(signups: readonly Signup[], records: readonly SessionRecord[]): SignupStats {
  const bySource: Record<SignupSource, number> = { study: 0, c: 0 };
  const byPlacement: Partial<Record<SignupPlacement, number>> = {};
  const emails = new Set<string>();
  let interview = 0;
  for (const s of signups) {
    bySource[s.source] += 1;
    byPlacement[s.placement] = (byPlacement[s.placement] ?? 0) + 1;
    emails.add(s.email.trim().toLowerCase());
    if (s.interview) interview += 1;
  }

  const variantOf = new Map<string, Variant>();
  const reached = { A: 0, B: 0 };
  for (const r of records) {
    if (r.isTest) continue;
    variantOf.set(r.sessionId, r.variant);
    if (r.step === "debrief" || r.completedAt) reached[r.variant] += 1;
  }
  const signedUp = { A: new Set<string>(), B: new Set<string>() };
  for (const s of signups) {
    if (s.source !== "study" || s.isTest) continue;
    const variant = (s.sessionId && variantOf.get(s.sessionId)) || s.variant;
    if (variant) signedUp[variant].add(s.sessionId ?? s.id);
  }
  return {
    total: signups.length,
    uniqueEmails: emails.size,
    interview,
    bySource,
    byPlacement,
    study: {
      all: rate(signedUp.A.size + signedUp.B.size, reached.A + reached.B),
      A: rate(signedUp.A.size, reached.A),
      B: rate(signedUp.B.size, reached.B),
    },
  };
}
