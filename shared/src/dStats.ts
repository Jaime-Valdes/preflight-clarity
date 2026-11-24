/*
 * Version D's results (the results page's "Version D" tab): the Flight Day Pack price test and D's
 * sign-ups, summarised from the stored rows the page already loads (the `signups` and `d_feedback`
 * tables). Pure: no clock, no randomness. Offer views and clicks are PostHog events and never reach
 * these tables, so nothing here is a rate per view.
 */
import { DISMISS_REASONS, EASIER_ANSWERS, PACK_ITEMS, PLAN_CHOICES, ARM_PRICE_USD } from "./dFeedback";
import { PRICE_ARMS, emailKey } from "./signup";
import type {
  DFeedback,
  DismissReason,
  EasierAnswer,
  LegacyPackItem,
  OfferPlacement,
  PackItem,
  PlanChoice,
  PriceArm,
  PricingAnswers,
  Signup,
  SignupPlacement,
} from "./types";

export type OfferVersionFilter = "all" | "v1" | "v2";

export interface DFilters {
  /** Team tests (?test=1). */
  includeTest: boolean;
  /** Prices forced with ?arm= (team previews). */
  includeForced: boolean;
  /** Which iteration of the offer: v1 (2026-11-18) or v2 (2026-11-19 on), or both. */
  offerVersion: OfferVersionFilter;
}

export const DEFAULT_D_FILTERS: DFilters = { includeTest: false, includeForced: false, offerVersion: "all" };

export interface DSlice {
  /** Every version D sign-up (any placement) that passes the test/forced filters. */
  signups: Signup[];
  /** The Flight Day Pack's own sign-ups ("Get it free at launch"), also filtered by offer version. */
  joins: Signup[];
  /** d_feedback rows that pass every filter. */
  feedback: DFeedback[];
}

function versionOf(row: { offerVersion?: "v2" }): "v1" | "v2" {
  return row.offerVersion === "v2" ? "v2" : "v1";
}

/** The rows the tab shows. The offer-version filter applies to the offer's rows only (joins and d_feedback). */
export function dSlice(signups: readonly Signup[], feedback: readonly DFeedback[], filters: DFilters): DSlice {
  const keepVersion = (row: { offerVersion?: "v2" }) => filters.offerVersion === "all" || versionOf(row) === filters.offerVersion;
  const d = signups.filter(
    (s) => s.source === "d" && (filters.includeTest || !s.isTest) && (filters.includeForced || s.armForced !== true),
  );
  return {
    signups: d,
    joins: d.filter((s) => s.placement === "d_addon" && keepVersion(s)),
    feedback: feedback.filter(
      (f) => (filters.includeTest || !f.isTest) && (filters.includeForced || !f.armForced) && keepVersion(f),
    ),
  };
}

// ── The price test ──────────────────────────────────────────────────────────

export interface ArmSummary {
  arm: PriceArm;
  priceUsd: number;
  /** Flight Day Pack sign-ups ("Add", then the email form). */
  joins: number;
  /** "No thanks" with a reason or a note (a decline with no answer saves no row). */
  declines: number;
  /** joins × price: what the joins would have paid. */
  wouldBeRevenue: number;
  /** joins / (joins + declines), or null with neither. */
  joinShare: number | null;
  byPlacement: Record<OfferPlacement, { joins: number; declines: number }>;
}

function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** Joins and declines by price, and by where the offer showed. */
export function armSummaries(slice: DSlice): ArmSummary[] {
  return PRICE_ARMS.map((arm) => {
    const byPlacement: ArmSummary["byPlacement"] = { results: { joins: 0, declines: 0 }, after_pick: { joins: 0, declines: 0 } };
    let joins = 0;
    for (const s of slice.joins) {
      if (s.priceArm !== arm) continue;
      joins += 1;
      if (s.offerPlacement) byPlacement[s.offerPlacement].joins += 1;
    }
    let declines = 0;
    for (const f of slice.feedback) {
      if (f.kind !== "addon_dismiss" || f.priceArm !== arm) continue;
      declines += 1;
      if (f.placement === "results" || f.placement === "after_pick") byPlacement[f.placement].declines += 1;
    }
    const priceUsd = ARM_PRICE_USD[arm];
    return {
      arm,
      priceUsd,
      joins,
      declines,
      wouldBeRevenue: Math.round(joins * priceUsd * 100) / 100,
      joinShare: share(joins, joins + declines),
      byPlacement,
    };
  });
}

/** A count per option, overall and per price. */
export interface Tally<K extends string> {
  total: number;
  rows: Array<{ key: K; count: number; byArm: Record<PriceArm, number> }>;
  /** Answers per price (the denominators). */
  answersByArm: Record<PriceArm, number>;
}

function tally<K extends string>(keys: readonly K[], answers: ReadonlyArray<{ arm: PriceArm; keys: readonly K[] }>): Tally<K> {
  const rows = keys.map((key) => ({ key, count: 0, byArm: { p499: 0, p1499: 0 } as Record<PriceArm, number> }));
  const index = new Map(keys.map((k, i) => [k, i]));
  const answersByArm: Record<PriceArm, number> = { p499: 0, p1499: 0 };
  for (const a of answers) {
    answersByArm[a.arm] += 1;
    for (const k of new Set(a.keys)) {
      const i = index.get(k);
      if (i === undefined) continue;
      rows[i].count += 1;
      rows[i].byArm[a.arm] += 1;
    }
  }
  return { total: answers.length, rows, answersByArm };
}

/** "Which of these would you actually use?" (people who joined). Iteration 1's "airline" item is its own row. */
export function itemTally(slice: DSlice): Tally<PackItem | LegacyPackItem> {
  const answers = slice.feedback.flatMap((f) =>
    f.kind === "addon_join" && f.answers.items.length > 0 ? [{ arm: f.priceArm, keys: f.answers.items }] : [],
  );
  const hasLegacy = answers.some((a) => a.keys.includes("airline"));
  const keys: Array<PackItem | LegacyPackItem> = hasLegacy ? [...PACK_ITEMS.slice(0, 3), "airline", "none"] : [...PACK_ITEMS];
  return tally(keys, answers);
}

/** Why people said "No thanks" (a reason tapped). */
export function reasonTally(slice: DSlice): Tally<DismissReason> {
  const answers = slice.feedback.flatMap((f) =>
    f.kind === "addon_dismiss" && f.answers.reason ? [{ arm: f.priceArm, keys: [f.answers.reason] }] : [],
  );
  return tally(DISMISS_REASONS, answers);
}

/** "Per trip, or $29.99 a year for every trip?" */
export function planTally(slice: DSlice): Tally<PlanChoice> {
  const answers = slice.feedback.flatMap((f) => (f.kind === "pricing" && f.answers.plan ? [{ arm: f.priceArm, keys: [f.answers.plan] }] : []));
  return tally(PLAN_CHOICES, answers);
}

/** "Did Cloud9 make choosing a flight feel easier?" */
export function easierTally(slice: DSlice): Tally<EasierAnswer> {
  const answers = slice.feedback.flatMap((f) =>
    f.kind === "general" && f.answers.easier ? [{ arm: f.priceArm, keys: [f.answers.easier] }] : [],
  );
  return tally(EASIER_ANSWERS, answers);
}

// ── Van Westendorp ──────────────────────────────────────────────────────────

export type PriceQuestion = Exclude<keyof PricingAnswers, "plan">;
export const PRICE_QUESTION_KEYS: readonly PriceQuestion[] = ["tooCheap", "bargain", "gettingExpensive", "tooExpensive"];

export interface PriceSpread {
  n: number;
  median: number | null;
  /** 25th and 75th percentiles (the middle half of the answers). */
  p25: number | null;
  p75: number | null;
  values: number[];
}

/** Linear-interpolated quantile of sorted values. */
function quantile(sorted: readonly number[], q: number): number | null {
  if (sorted.length === 0) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round((sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)) * 100) / 100;
}

function spread(values: number[]): PriceSpread {
  const sorted = [...values].sort((a, b) => a - b);
  return { n: sorted.length, median: quantile(sorted, 0.5), p25: quantile(sorted, 0.25), p75: quantile(sorted, 0.75), values: sorted };
}

export interface PriceAnswers {
  /** Visitors who answered at least one of the four. */
  respondents: number;
  overall: Record<PriceQuestion, PriceSpread>;
  byArm: Record<PriceArm, Record<PriceQuestion, PriceSpread>>;
}

/** The four price questions: the spread of answers, overall and by the price the visitor had been shown. */
export function priceAnswers(slice: DSlice): PriceAnswers {
  const rows = slice.feedback.filter((f): f is Extract<DFeedback, { kind: "pricing" }> => f.kind === "pricing");
  const answered = rows.filter((r) => PRICE_QUESTION_KEYS.some((k) => typeof r.answers[k] === "number"));
  const build = (subset: typeof rows) =>
    Object.fromEntries(
      PRICE_QUESTION_KEYS.map((k) => [k, spread(subset.flatMap((r) => (typeof r.answers[k] === "number" ? [r.answers[k] as number] : [])))]),
    ) as Record<PriceQuestion, PriceSpread>;
  return {
    respondents: answered.length,
    overall: build(answered),
    byArm: { p499: build(answered.filter((r) => r.priceArm === "p499")), p1499: build(answered.filter((r) => r.priceArm === "p1499")) },
  };
}

// ── Words ───────────────────────────────────────────────────────────────────

export interface DTextAnswer {
  id: string;
  text: string;
  createdAt: string;
  arm: PriceArm;
  isTest: boolean;
}

export interface DTexts {
  /** "What would make this worth it for you?" (joined) */
  worthIt: DTextAnswer[];
  /** "Anything else?" (said no thanks) */
  anythingElse: DTextAnswer[];
  /** "What would make Cloud9 more useful before your next flight?" */
  moreUseful: DTextAnswer[];
}

/** The typed answers, newest first, quoted as typed. */
export function dTexts(slice: DSlice): DTexts {
  const out: DTexts = { worthIt: [], anythingElse: [], moreUseful: [] };
  const sorted = [...slice.feedback].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
  for (const f of sorted) {
    const base = { id: f.id, createdAt: f.createdAt, arm: f.priceArm, isTest: f.isTest };
    const text =
      f.kind === "addon_join" ? f.answers.worthIt : f.kind === "addon_dismiss" ? f.answers.anythingElse : f.kind === "general" ? f.answers.moreUseful : "";
    if (!text || !text.trim()) continue;
    const list = f.kind === "addon_join" ? out.worthIt : f.kind === "addon_dismiss" ? out.anythingElse : out.moreUseful;
    list.push({ ...base, text: text.trim() });
  }
  return out;
}

// ── Sign-ups ────────────────────────────────────────────────────────────────

export const D_SIGNUP_PLACEMENTS: readonly SignupPlacement[] = ["d_home", "d_results", "d_flight", "d_compare", "d_popup", "d_addon"];

export interface DSignupStats {
  total: number;
  uniqueEmails: number;
  interview: number;
  /** With a "When?" flight date (Flight Day Pack sign-ups only). */
  withFlightDate: number;
  byPlacement: Array<{ key: SignupPlacement; count: number }>;
  /** First-touch utm_source of the Flight Day Pack sign-ups ("" = none). Other D sign-ups don't store it. */
  joinsBySource: Array<{ key: string; count: number }>;
}

export function dSignupStats(slice: DSlice): DSignupStats {
  const emails = new Set(slice.signups.map((s) => emailKey(s.email)));
  const sources = new Map<string, number>();
  for (const s of slice.joins) {
    const key = (s.utmSource ?? "").trim().toLowerCase();
    sources.set(key, (sources.get(key) ?? 0) + 1);
  }
  return {
    total: slice.signups.length,
    uniqueEmails: emails.size,
    interview: slice.signups.filter((s) => s.interview).length,
    withFlightDate: slice.joins.filter((s) => Boolean(s.flightDate)).length,
    byPlacement: D_SIGNUP_PLACEMENTS.map((key) => ({ key, count: slice.signups.filter((s) => s.placement === key).length })),
    joinsBySource: [...sources.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key)),
  };
}

/** Answers per price below this are flagged as early signals. */
export const D_SMALL_SAMPLE = 30;
