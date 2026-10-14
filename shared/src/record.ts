/*
 * Validation and sanitization of an untrusted session record — the JSON the
 * browser POSTs to /responses. Pure TypeScript (relative imports only), so
 * the backend validates with it and the frontend could too.
 *
 * Policy
 *  - Identity and study-design fields (sessionId, schemaVersion, seq, the
 *    timestamps, step, variant, variantSource) and the shape of every nested
 *    object are strict: anything implausible rejects the whole record with a
 *    short error code. Those values drive the analysis, so a wrong one is
 *    worse than a missing record (the browser keeps its own copy anyway).
 *  - Free-form values are sanitized instead: strings are trimmed and capped,
 *    arrays are filtered to known values, nullable enums fall back to null,
 *    numbers are clamped to a sane range, an email is kept only if it looks
 *    like one.
 *  - The result is rebuilt field by field from literal keys, so unknown keys
 *    (and prototype tricks such as "__proto__") never get through, and the
 *    output is always a well-formed SessionRecord.
 */
import { isISODate } from "./dates";
import { isDashboardPart, isSectionId, SECTION_IDS } from "./sections";
import type {
  BodyType,
  CheckFrequency,
  DashboardEvent,
  DashboardMetrics,
  DashboardPart,
  DeviceInfo,
  DeviceType,
  FlightInput,
  FlightSummary,
  FlightsPerYear,
  ForecastMode,
  Intensity,
  PostSurvey,
  PreSurvey,
  ReplaceOption,
  SectionId,
  SectionStats,
  SessionRecord,
  Step,
  Timeframe,
  Variant,
  VariantSource,
} from "./types";

export type ParseResult = { ok: true; record: SessionRecord } | { ok: false; error: string };

// ── Limits ──────────────────────────────────────────────────────────────────

/** Free-text answers (characters, counted by code point). */
export const MAX_TEXT_CHARS = 2000;
/** Labels, codes, names, routes. */
export const MAX_SHORT_CHARS = 120;
export const MAX_EMAIL_CHARS = 254;
export const MAX_USER_AGENT_CHARS = 512;
/** Mirrors MAX_EVENTS in frontend/lib/tracking.ts. */
export const MAX_EVENTS = 300;
export const MAX_EVENT_TYPE_CHARS = 40;
export const MAX_EVENT_DETAIL_CHARS = 120;
/** Largest accepted duration, ms (about 24 days; fits a Postgres integer). */
const MAX_MS = 2_147_483_647;
const MAX_SEQ = 1_000_000;
const MAX_COUNT = 1_000_000;
const MAX_LIST_ITEMS = 50;
const MAX_VIEWPORT_PX = 100_000;

// ── Enumerations (kept in sync with ./types) ────────────────────────────────

const STEPS: readonly Step[] = ["welcome", "pre", "setup", "dashboard", "post", "debrief"];
const VARIANTS: readonly Variant[] = ["A", "B"];
const VARIANT_SOURCES: readonly VariantSource[] = ["random", "forced"];
const DEVICE_TYPES: readonly DeviceType[] = ["mobile", "tablet", "desktop"];
const TIMEFRAMES: readonly Timeframe[] = ["lt1w", "1to4w", "1to3m", "3mplus"];
const FLIGHTS_PER_YEAR: readonly FlightsPerYear[] = ["0to1", "2to3", "4to6", "7to12", "13plus"];
const CHECK_FREQUENCIES: readonly CheckFrequency[] = ["never", "once", "weekly", "daily", "multiple_daily"];
const REPLACE_OPTIONS: readonly ReplaceOption[] = [
  "medication",
  "videos",
  "turbulence_apps",
  "choosing_flights",
  "nothing",
];
const BODY_TYPES: readonly BodyType[] = ["narrow", "wide"];
const INTENSITIES: readonly Intensity[] = ["none", "light", "moderate"];
const FORECAST_MODES: readonly ForecastMode[] = ["history", "outlook", "forecast"];

// ── Primitives ──────────────────────────────────────────────────────────────

class ParseError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ParseError";
  }
}

/** Abort parsing with a short error code (declared `never` so TypeScript narrows after it). */
function fail(code: string): never {
  throw new ParseError(code);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** C0/C1 control characters except tab, newline and carriage return. Postgres jsonb refuses NUL. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

/** Trimmed, control-free string cut to `max` code points. Non-strings become "". */
function text(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  const cleaned = value.replace(CONTROL_CHARS, "").trim();
  if (cleaned.length <= max) return cleaned;
  return Array.from(cleaned).slice(0, max).join("").trim();
}

function enumValue<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return typeof value === "string" && (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

/** Finite number clamped to [min, max]; undefined for anything that isn't a finite number. */
function num(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, value));
}

/** Like `num`, rounded to an integer. */
function int(value: unknown, min: number, max: number): number | undefined {
  const n = num(value, min, max);
  return n === undefined ? undefined : Math.round(n);
}

/** A survey rating: an integer 0–10, or null/undefined for "not answered". Anything else is implausible. */
function rating(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 10) return value;
  return fail("invalid_rating");
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** An ISO 8601 timestamp with a zone, normalized to UTC ("2026-10-13T18:04:05.000Z"). */
function timestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !ISO_TIMESTAMP.test(value)) return undefined;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return undefined;
  const year = new Date(ms).getUTCFullYear();
  if (year < 2000 || year > 2100) return undefined;
  return new Date(ms).toISOString();
}

/** A nullable ISO timestamp; rejects with `code` when present but malformed. */
function optionalTimestamp(value: unknown, code: string): string | null {
  if (value === null || value === undefined) return null;
  return timestamp(value) ?? fail(code);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Kept only when it plausibly is an email address and fits the column; otherwise "". */
function email(value: unknown): string {
  const cleaned = text(value, MAX_EMAIL_CHARS + 1);
  return cleaned.length <= MAX_EMAIL_CHARS && EMAIL.test(cleaned) ? cleaned : "";
}

/** Known values from an untrusted list, de-duplicated, in their original order. */
function knownValues<T>(value: unknown, pick: (item: unknown) => T | undefined): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const item of value.slice(0, MAX_LIST_ITEMS)) {
    const known = pick(item);
    if (known !== undefined && !out.includes(known)) out.push(known);
  }
  return out;
}

// ── Nested objects ──────────────────────────────────────────────────────────

function parseDevice(value: unknown): DeviceInfo {
  if (!isObject(value)) fail("invalid_device");
  return {
    type: enumValue(value.type, DEVICE_TYPES) ?? fail("invalid_device"),
    userAgent: text(value.userAgent, MAX_USER_AGENT_CHARS),
    viewportW: int(value.viewportW, 0, MAX_VIEWPORT_PX) ?? 0,
    viewportH: int(value.viewportH, 0, MAX_VIEWPORT_PX) ?? 0,
    touch: value.touch === true,
  };
}

function parsePre(value: unknown): PreSurvey {
  if (!isObject(value)) fail("invalid_pre");
  return {
    anxiety: rating(value.anxiety),
    control: rating(value.control),
    predictability: rating(value.predictability),
    routeOrigin: text(value.routeOrigin, MAX_SHORT_CHARS),
    routeDestination: text(value.routeDestination, MAX_SHORT_CHARS),
    timeframe: enumValue(value.timeframe, TIMEFRAMES) ?? null,
    flightsPerYear: enumValue(value.flightsPerYear, FLIGHTS_PER_YEAR) ?? null,
  };
}

function dashboardParts(value: unknown): Array<DashboardPart | "none"> {
  return knownValues(value, (item) => (item === "none" ? "none" : isDashboardPart(item) ? item : undefined));
}

function parsePost(value: unknown): PostSurvey {
  if (!isObject(value)) fail("invalid_post");
  return {
    anxiety: rating(value.anxiety),
    control: rating(value.control),
    predictability: rating(value.predictability),
    feltBetter: dashboardParts(value.feltBetter),
    feltWorse: dashboardParts(value.feltWorse),
    feltWorseText: text(value.feltWorseText, MAX_TEXT_CHARS),
    checkFrequency: enumValue(value.checkFrequency, CHECK_FREQUENCIES) ?? null,
    wouldReplace: knownValues(value.wouldReplace, (item) => enumValue(item, REPLACE_OPTIONS)),
    wouldReplaceText: text(value.wouldReplaceText, MAX_TEXT_CHARS),
    stillScaredOf: text(value.stillScaredOf, MAX_TEXT_CHARS),
  };
}

function parseFlightInput(value: unknown): FlightInput | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) fail("invalid_flight_input");
  const origin = text(value.origin, MAX_SHORT_CHARS);
  const destination = text(value.destination, MAX_SHORT_CHARS);
  const date = typeof value.date === "string" && isISODate(value.date) ? value.date : undefined;
  if (!origin || !destination || !date) fail("invalid_flight_input");
  return { origin, destination, date };
}

function parseFlight(value: unknown): FlightSummary | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) fail("invalid_flight");
  return {
    flightId: text(value.flightId, MAX_SHORT_CHARS),
    flightNumber: text(value.flightNumber, MAX_SHORT_CHARS),
    airline: text(value.airline, MAX_SHORT_CHARS),
    route: text(value.route, MAX_SHORT_CHARS),
    aircraft: text(value.aircraft, MAX_SHORT_CHARS),
    bodyType: enumValue(value.bodyType, BODY_TYPES) ?? fail("invalid_flight"),
    airborneMin: num(value.airborneMin, 0, 10_000) ?? fail("invalid_flight"),
    smoothnessScore: num(value.smoothnessScore, 0, 100) ?? fail("invalid_flight"),
    maxIntensity: enumValue(value.maxIntensity, INTENSITIES) ?? fail("invalid_flight"),
    daysUntil: int(value.daysUntil, -100_000, 100_000) ?? fail("invalid_flight"),
    forecastMode: enumValue(value.forecastMode, FORECAST_MODES) ?? fail("invalid_flight"),
  };
}

function parseSectionStats(value: unknown): SectionStats {
  if (!isObject(value)) fail("invalid_dashboard");
  return {
    opens: int(value.opens, 0, MAX_COUNT) ?? fail("invalid_dashboard"),
    openMs: int(value.openMs, 0, MAX_MS) ?? fail("invalid_dashboard"),
    firstOpenAtMs:
      value.firstOpenAtMs === null || value.firstOpenAtMs === undefined
        ? null
        : (int(value.firstOpenAtMs, 0, MAX_MS) ?? fail("invalid_dashboard")),
  };
}

function parseEvents(value: unknown): DashboardEvent[] {
  if (!Array.isArray(value)) return [];
  const out: DashboardEvent[] = [];
  for (const item of value) {
    if (out.length >= MAX_EVENTS) break;
    if (!isObject(item)) continue;
    const t = int(item.t, 0, MAX_MS);
    const type = text(item.type, MAX_EVENT_TYPE_CHARS);
    if (t === undefined || !type) continue;
    const event: DashboardEvent = { t, type };
    if (isSectionId(item.section)) event.section = item.section;
    const detail = text(item.detail, MAX_EVENT_DETAIL_CHARS);
    if (detail) event.detail = detail;
    out.push(event);
  }
  return out;
}

function parseDashboard(value: unknown): DashboardMetrics | null {
  if (value === null || value === undefined) return null;
  if (!isObject(value)) fail("invalid_dashboard");

  const sections: Partial<Record<SectionId, SectionStats>> = {};
  if (value.sections !== undefined) {
    if (!isObject(value.sections)) fail("invalid_dashboard");
    for (const id of SECTION_IDS) {
      const stats = value.sections[id];
      if (stats !== undefined) sections[id] = parseSectionStats(stats);
    }
  }

  const alert = isObject(value.alert) ? value.alert : {};

  return {
    startedAt: timestamp(value.startedAt) ?? fail("invalid_dashboard"),
    endedAt: optionalTimestamp(value.endedAt, "invalid_dashboard"),
    totalMs: int(value.totalMs, 0, MAX_MS) ?? fail("invalid_dashboard"),
    activeMs: int(value.activeMs, 0, MAX_MS) ?? fail("invalid_dashboard"),
    sectionOrder: knownValues(value.sectionOrder, (item) => (isSectionId(item) ? item : undefined)),
    sections,
    alert: {
      tapped: alert.tapped === true,
      taps: int(alert.taps, 0, MAX_COUNT) ?? 0,
      finalOn: alert.finalOn === true,
    },
    events: parseEvents(value.events),
    maxScrollPct: int(value.maxScrollPct, 0, 100) ?? 0,
    resumed: value.resumed === true,
  };
}

// ── Record ──────────────────────────────────────────────────────────────────

function build(input: unknown): SessionRecord {
  if (!isObject(input)) fail("not_an_object");

  if (input.sessionId === undefined || input.sessionId === null || input.sessionId === "") {
    fail("missing_session_id");
  }
  if (typeof input.sessionId !== "string" || !UUID.test(input.sessionId)) fail("invalid_session_id");
  if (input.schemaVersion !== 1) fail("unsupported_schema_version");

  const seq = input.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0 || seq > MAX_SEQ) fail("invalid_seq");

  return {
    schemaVersion: 1,
    sessionId: input.sessionId.toLowerCase(),
    seq,
    createdAt: timestamp(input.createdAt) ?? fail("invalid_timestamp"),
    updatedAt: timestamp(input.updatedAt) ?? fail("invalid_timestamp"),
    completedAt: optionalTimestamp(input.completedAt, "invalid_timestamp"),
    step: enumValue(input.step, STEPS) ?? fail("invalid_step"),
    variant: enumValue(input.variant, VARIANTS) ?? fail("invalid_variant"),
    variantSource: enumValue(input.variantSource, VARIANT_SOURCES) ?? fail("invalid_variant"),
    isTest: input.isTest === true,
    device: parseDevice(input.device),
    pre: parsePre(input.pre),
    flightInput: parseFlightInput(input.flightInput),
    flight: parseFlight(input.flight),
    dashboard: parseDashboard(input.dashboard),
    post: parsePost(input.post),
    email: email(input.email),
  };
}

/**
 * Defensive validation and sanitization of an untrusted client payload.
 * Rejects anything that isn't a plausible SessionRecord (with a short error
 * code such as "invalid_session_id" or "invalid_rating"); drops unknown keys;
 * trims and caps free text; filters arrays to known values; normalizes
 * timestamps to UTC and the session id to lower case.
 */
export function parseSessionRecord(input: unknown): ParseResult {
  try {
    return { ok: true, record: build(input) };
  } catch (err) {
    if (err instanceof ParseError) return { ok: false, error: err.code };
    throw err;
  }
}
