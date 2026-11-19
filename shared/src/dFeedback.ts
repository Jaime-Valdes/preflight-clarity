/*
 * Version D's Flight Day Pack test (docs/FLIGHT_DAY_PACK.md): validation of the
 * d_feedback rows the browser sends (the answers after "Add", after "No thanks",
 * the pricing questions and the general feedback), and the team CSV. Pure: no
 * clock, no randomness.
 *
 * Strict where the shape is concerned: a known kind and placement, the answer
 * keys that kind has and no others, known option keys, dollar amounts that are
 * finite numbers from 0 to 500. Lenient with text only in the way the sign-up
 * parser is: control characters go and an answer is cut at MAX_ANSWER_CHARS,
 * so an answer is never lost over its length. The result is rebuilt from
 * literal keys.
 */
import { CSV_BOM, csvCell } from "./csv";
import { cleanLine, cleanText, isObject, isUuid, parseTimestamp } from "./record";
import { MAX_UTM_CHARS, PRICE_ARMS } from "./signup";
import type {
  DFeedback,
  DFeedbackKind,
  DFeedbackPlacement,
  DismissReason,
  EasierAnswer,
  PackItem,
  PlanChoice,
} from "./types";

/** Longest free-text answer kept. */
export const MAX_ANSWER_CHARS = 1000;
/** Highest dollar amount accepted for a pricing question. */
export const MAX_PRICE_USD = 500;

export const D_FEEDBACK_KINDS: readonly DFeedbackKind[] = ["addon_join", "addon_dismiss", "pricing", "general"];
export const D_FEEDBACK_PLACEMENTS: readonly DFeedbackPlacement[] = ["after_pick", "results", "flight", "compare"];
export const PACK_ITEMS: readonly PackItem[] = ["walkthrough", "forecast_alerts", "landed_text", "none"];
export const DISMISS_REASONS: readonly DismissReason[] = ["too_expensive", "wouldnt_use", "not_sure", "something_else", "prefer_not"];
export const PLAN_CHOICES: readonly PlanChoice[] = ["per_trip", "yearly", "neither", "not_sure"];
export const EASIER_ANSWERS: readonly EasierAnswer[] = ["yes", "a_little", "no", "none"];

/** The placements each kind can be asked at: the offer's two, or the two pages with the feedback link. */
const KIND_PLACEMENTS: Record<DFeedbackKind, readonly DFeedbackPlacement[]> = {
  addon_join: ["after_pick", "results"],
  addon_dismiss: ["after_pick", "results"],
  pricing: ["after_pick", "results"],
  general: ["flight", "compare"],
};

/** The answer keys of each kind, exactly. */
const ANSWER_KEYS: Record<DFeedbackKind, readonly string[]> = {
  addon_join: ["items", "worthIt"],
  addon_dismiss: ["reason", "anythingElse"],
  pricing: ["tooCheap", "bargain", "gettingExpensive", "tooExpensive", "plan"],
  general: ["easier", "moreUseful"],
};

export type ParsedDFeedback = { ok: true; feedback: DFeedback } | { ok: false; error: string };

class Invalid extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

function fail(code: string): never {
  throw new Invalid(code);
}

/** A free-text answer: "" when absent; anything but a string is refused. */
function answerText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") fail("invalid_answers");
  return cleanText(value, MAX_ANSWER_CHARS);
}

/** One option key of `values`, or null when unanswered; anything else is refused. */
function option<T extends string>(value: unknown, values: readonly T[]): T | null {
  if (value === undefined || value === null) return null;
  const found = values.find((v) => v === value);
  return found ?? fail("invalid_answers");
}

/** A dollar amount from 0 to MAX_PRICE_USD, rounded to cents; null when unanswered. */
function dollars(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > MAX_PRICE_USD) fail("invalid_price");
  return Math.round(value * 100) / 100;
}

/** The ticked items: known keys, no repeats, in the form's order; "none" never with another item. */
function items(value: unknown): PackItem[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail("invalid_answers");
  const picked = new Set<PackItem>();
  for (const entry of value) picked.add(option(entry, PACK_ITEMS) ?? fail("invalid_answers"));
  if (picked.has("none") && picked.size > 1) fail("invalid_answers");
  return PACK_ITEMS.filter((item) => picked.has(item));
}

function answersFor(kind: DFeedbackKind, input: Record<string, unknown>): DFeedback["answers"] {
  for (const key of Object.keys(input)) if (!ANSWER_KEYS[kind].includes(key)) fail("invalid_answers");
  switch (kind) {
    case "addon_join":
      return { items: items(input.items), worthIt: answerText(input.worthIt) };
    case "addon_dismiss":
      return { reason: option(input.reason, DISMISS_REASONS), anythingElse: answerText(input.anythingElse) };
    case "pricing":
      return {
        tooCheap: dollars(input.tooCheap),
        bargain: dollars(input.bargain),
        gettingExpensive: dollars(input.gettingExpensive),
        tooExpensive: dollars(input.tooExpensive),
        plan: option(input.plan, PLAN_CHOICES),
      };
    case "general":
      return { easier: option(input.easier, EASIER_ANSWERS), moreUseful: answerText(input.moreUseful) };
  }
}

/** Whether a row answers anything at all (the browser saves no row otherwise; the API refuses an empty one). */
export function hasAnswer(feedback: Pick<DFeedback, "kind" | "answers">): boolean {
  const a = feedback.answers as unknown as Record<string, unknown>;
  return Object.values(a).some((v) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v !== "" : v !== null && v !== undefined));
}

/**
 * Validates and sanitizes one d_feedback row from the browser. Short error
 * codes, like parseSignup: missing_id, invalid_created_at, missing_session_id,
 * invalid_kind, invalid_placement, invalid_price_arm, invalid_answers,
 * invalid_price, empty_answers.
 */
export function parseDFeedback(input: unknown): ParsedDFeedback {
  if (!isObject(input)) return { ok: false, error: "invalid_body" };
  if (input.schemaVersion !== undefined && input.schemaVersion !== 1) return { ok: false, error: "unsupported_schema_version" };
  const id = typeof input.id === "string" ? input.id.trim() : "";
  if (!isUuid(id)) return { ok: false, error: "missing_id" };
  const createdAt = parseTimestamp(input.createdAt);
  if (!createdAt) return { ok: false, error: "invalid_created_at" };
  const sessionId = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
  if (!isUuid(sessionId)) return { ok: false, error: "missing_session_id" };
  const kind = D_FEEDBACK_KINDS.find((k) => k === input.kind);
  if (!kind) return { ok: false, error: "invalid_kind" };
  const placement = KIND_PLACEMENTS[kind].find((p) => p === input.placement);
  if (!placement) return { ok: false, error: "invalid_placement" };
  const priceArm = PRICE_ARMS.find((a) => a === input.priceArm);
  if (!priceArm) return { ok: false, error: "invalid_price_arm" };
  if (!isObject(input.answers)) return { ok: false, error: "invalid_answers" };
  let answers: DFeedback["answers"];
  try {
    answers = answersFor(kind, input.answers);
  } catch (err) {
    if (err instanceof Invalid) return { ok: false, error: err.code };
    throw err;
  }
  const feedback = {
    schemaVersion: 1,
    id: id.toLowerCase(),
    createdAt,
    sessionId: sessionId.toLowerCase(),
    priceArm,
    armForced: input.armForced === true,
    placement,
    kind,
    answers,
    utmSource: cleanLine(input.utmSource, MAX_UTM_CHARS),
    utmMedium: cleanLine(input.utmMedium, MAX_UTM_CHARS),
    utmCampaign: cleanLine(input.utmCampaign, MAX_UTM_CHARS),
    isTest: input.isTest === true,
  } as DFeedback;
  if (!hasAnswer(feedback)) return { ok: false, error: "empty_answers" };
  return { ok: true, feedback };
}

/** Newest first; id breaks ties so the order is stable. */
export function sortDFeedbackNewestFirst(rows: readonly DFeedback[]): DFeedback[] {
  const time = (iso: string) => {
    const ms = Date.parse(iso);
    return Number.isFinite(ms) ? ms : 0;
  };
  return [...rows].sort((a, b) => time(b.createdAt) - time(a.createdAt) || a.id.localeCompare(b.id));
}

// ── CSV ─────────────────────────────────────────────────────────────────────

/** One row per d_feedback row, `answers` flattened: a kind's own columns are filled, the others left blank. */
export const D_FEEDBACK_CSV_COLUMNS = [
  "id",
  "created_at",
  "session_id",
  "kind",
  "placement",
  "price_arm",
  "price_usd",
  "arm_forced",
  "is_test",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "item_walkthrough",
  "item_forecast_alerts",
  "item_landed_text",
  "item_none",
  "worth_it",
  "dismiss_reason",
  "anything_else",
  "price_too_cheap",
  "price_bargain",
  "price_getting_expensive",
  "price_too_expensive",
  "plan",
  "easier",
  "more_useful",
] as const;

/** The price each arm showed, in dollars. */
export const ARM_PRICE_USD: Record<DFeedback["priceArm"], number> = { p499: 4.99, p1499: 14.99 };

type Cell = string | number | boolean | null | undefined;

function answerCells(row: DFeedback): Cell[] {
  const blank = (n: number): Cell[] => Array.from({ length: n }, () => null);
  switch (row.kind) {
    case "addon_join": {
      const has = (item: PackItem) => row.answers.items.includes(item);
      return [has("walkthrough"), has("forecast_alerts"), has("landed_text"), has("none"), row.answers.worthIt, ...blank(9)];
    }
    case "addon_dismiss":
      return [...blank(5), row.answers.reason, row.answers.anythingElse, ...blank(7)];
    case "pricing":
      return [
        ...blank(7),
        row.answers.tooCheap,
        row.answers.bargain,
        row.answers.gettingExpensive,
        row.answers.tooExpensive,
        row.answers.plan,
        ...blank(2),
      ];
    case "general":
      return [...blank(12), row.answers.easier, row.answers.moreUseful];
  }
}

/** The team CSV, in the order given. Same conventions as the other exports: BOM, CRLF, formula-safe cells. */
export function dFeedbackToCsv(rows: readonly DFeedback[]): string {
  const lines = [D_FEEDBACK_CSV_COLUMNS.map(csvCell).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.createdAt,
        r.sessionId,
        r.kind,
        r.placement,
        r.priceArm,
        ARM_PRICE_USD[r.priceArm],
        r.armForced,
        r.isTest,
        r.utmSource,
        r.utmMedium,
        r.utmCampaign,
        ...answerCells(r),
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}
