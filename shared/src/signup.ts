/*
 * Product-interest sign-ups (docs/INTEREST.md): validation of what the browser
 * sends, the dedupe key the stores upsert on, the team CSV, and the headline
 * numbers for the results page. Pure: no clock, no randomness.
 *
 * The cleaners come from ./record, so a sign-up and a session record follow
 * one policy for text, emails, participant labels, timestamps and ids.
 */
import { CSV_BOM, csvCell } from "./csv";
import {
  cleanEmail,
  cleanLine,
  cleanParticipant,
  isObject,
  isUuid,
  MAX_EMAIL_CHARS,
  MAX_FIRST_NAME_CHARS,
  MAX_PARTICIPANT_CHARS,
  parseTimestamp,
} from "./record";
import type { SessionRecord, Signup, SignupPlacement, SignupSource, Step, Variant } from "./types";

export { MAX_EMAIL_CHARS, MAX_FIRST_NAME_CHARS, MAX_PARTICIPANT_CHARS };
export const MAX_CONTEXT_CHARS = 120;
export const MAX_PAGE_CHARS = 200;
/** Longest `page` value looked at before it is reduced to a pathname. */
const MAX_URL_CHARS = 2048;

export const SIGNUP_SOURCES: readonly SignupSource[] = ["study", "c", "d"];
export const SIGNUP_PLACEMENTS: readonly SignupPlacement[] = [
  "debrief",
  "dashboard",
  "c_home",
  "c_results",
  "c_flight",
  "c_compare",
  "d_home",
  "d_results",
  "d_flight",
  "d_compare",
];

export type ParsedSignup = { ok: true; signup: Signup } | { ok: false; error: string };

/**
 * The pathname of the page the form was on ("/c/compare"): a full URL loses its
 * origin, query string and fragment; "" when empty or not a web address.
 */
function pathname(value: unknown): string {
  const raw = cleanLine(value, MAX_URL_CHARS);
  if (!raw) return "";
  try {
    const url = new URL(raw, "http://localhost");
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return cleanLine(url.pathname, MAX_PAGE_CHARS);
  } catch {
    return "";
  }
}

/**
 * Validates and sanitizes a sign-up from the browser. Rejects anything without
 * a UUID id, a plausible email, a known source and placement and an ISO
 * createdAt (short error codes, like parseSessionRecord); every other value is
 * cleaned to a safe default, so a lead is never lost over a detail. The result
 * is rebuilt from literal keys, so unknown keys never get through.
 */
export function parseSignup(input: unknown): ParsedSignup {
  if (!isObject(input)) return { ok: false, error: "invalid_body" };
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) {
    return { ok: false, error: "unsupported_schema_version" };
  }
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!isUuid(id)) return { ok: false, error: "missing_id" };
  const email = cleanEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email" };
  const source = SIGNUP_SOURCES.find((s) => s === input.source);
  if (!source) return { ok: false, error: "invalid_source" };
  const placement = SIGNUP_PLACEMENTS.find((p) => p === input.placement);
  if (!placement) return { ok: false, error: "invalid_placement" };
  const createdAt = parseTimestamp(input.createdAt);
  if (!createdAt) return { ok: false, error: "invalid_created_at" };
  const sessionId = typeof input.sessionId === "string" && isUuid(input.sessionId.trim()) ? input.sessionId.trim().toLowerCase() : null;
  const variant: Variant | null = input.variant === "A" || input.variant === "B" ? input.variant : null;
  return {
    ok: true,
    signup: {
      schemaVersion: 1,
      id: id.toLowerCase(),
      createdAt,
      source,
      placement,
      email,
      firstName: cleanLine(input.firstName, MAX_FIRST_NAME_CHARS),
      // The form's primary action: true unless the browser says otherwise.
      waitlist: input.waitlist !== false,
      interview: input.interview === true,
      sessionId,
      variant,
      isTest: input.isTest === true,
      participant: cleanParticipant(input.participant),
      context: cleanLine(input.context, MAX_CONTEXT_CHARS),
      page: pathname(input.page),
    },
  };
}

// ── Dedupe ──────────────────────────────────────────────────────────────────

/** Case- and whitespace-insensitive form of an email (the `email_key` column). */
export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}

/** One row per email per source: the key the stores upsert on ("email_key|source"). */
export function signupKey(signup: Pick<Signup, "email" | "source">): string {
  return `${emailKey(signup.email)}|${signup.source}`;
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

/** One row per sign-up, in the order given. Same conventions as recordsToCsv: BOM, CRLF, formula-safe cells. */
export function signupsToCsv(signups: readonly Signup[]): string {
  const lines = [SIGNUP_CSV_COLUMNS.map(csvCell).join(",")];
  for (const s of signups) {
    lines.push(
      [s.id, s.createdAt, s.source, s.placement, s.firstName, s.email, s.waitlist, s.interview, s.sessionId, s.variant, s.isTest, s.participant, s.context, s.page]
        .map(csvCell)
        .join(","),
    );
  }
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

// ── Stats ───────────────────────────────────────────────────────────────────

export interface SignupRate {
  /** Sign-ups from real (non-test) sessions that saw the form. */
  signups: number;
  /**
   * Real sessions that saw the form: the briefing's card (step dashboard or
   * later) or the debrief. Before 2026-10-24 the only form was on the debrief.
   */
  sawForm: number;
  /** 0–100, or null when nobody saw the form. */
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

function rate(signups: number, sawForm: number): SignupRate {
  return { signups, sawForm, pct: sawForm > 0 ? Math.round((100 * signups) / sawForm) : null };
}

/** Steps whose screen shows the sign-up form (the briefing's card, then the debrief). */
const FORM_STEPS: ReadonlySet<Step> = new Set<Step>(["dashboard", "post", "debrief"]);

/**
 * Headline numbers over the sign-ups given (filter test sign-ups out first if
 * the totals should exclude them). `records` are the study sessions, to count
 * who saw the form: real sessions that reached the briefing (its sign-up card)
 * or the debrief, whether or not they finished. A real session
 * counts as signed up when its own record says so (`waitlist`): the stores
 * keep one sign-up row per email and source, so when two sessions sign up with
 * the same email only the later one has a row, and a sign-up whose POST never
 * landed (rate limit, offline, schema not applied) still exists in the record.
 * A sign-up row counts toward a variant (once per session) through its session
 * record when that is known, else through its own variant and test flag; a
 * session with a sign-up saw the form by definition, even when its last saved
 * step says otherwise, so the rate never passes 100%.
 */
export function signupStats(signups: readonly Signup[], records: readonly SessionRecord[]): SignupStats {
  const bySource: Record<SignupSource, number> = { study: 0, c: 0, d: 0 };
  const byPlacement: Partial<Record<SignupPlacement, number>> = {};
  const emails = new Set<string>();
  let interview = 0;
  for (const s of signups) {
    bySource[s.source] += 1;
    byPlacement[s.placement] = (byPlacement[s.placement] ?? 0) + 1;
    emails.add(emailKey(s.email));
    if (s.interview) interview += 1;
  }

  const bySession = new Map<string, SessionRecord>();
  const reached = { A: new Set<string>(), B: new Set<string>() };
  const signedUp = { A: new Set<string>(), B: new Set<string>() };
  for (const r of records) {
    bySession.set(r.sessionId, r);
    if (r.isTest) continue;
    if (FORM_STEPS.has(r.step) || r.completedAt) reached[r.variant].add(r.sessionId);
    if (r.waitlist === true) {
      signedUp[r.variant].add(r.sessionId);
      reached[r.variant].add(r.sessionId);
    }
  }
  for (const s of signups) {
    if (s.source !== "study") continue;
    const record = s.sessionId ? bySession.get(s.sessionId) : undefined;
    if (s.isTest || record?.isTest) continue;
    const variant = record?.variant ?? s.variant;
    if (!variant) continue;
    const key = s.sessionId ?? s.id;
    signedUp[variant].add(key);
    reached[variant].add(key);
  }
  return {
    total: signups.length,
    uniqueEmails: emails.size,
    interview,
    bySource,
    byPlacement,
    study: {
      all: rate(signedUp.A.size + signedUp.B.size, reached.A.size + reached.B.size),
      A: rate(signedUp.A.size, reached.A.size),
      B: rate(signedUp.B.size, reached.B.size),
    },
  };
}
