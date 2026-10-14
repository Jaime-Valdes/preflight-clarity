/*
 * Pure statistics over session records for the team results page and the
 * CSV export. No React, no DOM, no Node — everything here is a plain function
 * of `SessionRecord[]`, so it is testable with tsx and safe to run on the
 * server or in the browser.
 *
 * Conventions:
 * - Rates and shares are fractions (0–1); callers format them as percentages.
 * - Anything that cannot be computed (no data) is `null`, never NaN, and the
 *   format helpers render `null` as "—".
 * - Every "by variant" breakdown uses the same shape as the overall figure.
 */
import { PART_LABELS, SECTIONS, SECTION_IDS, VARIANT_SECTIONS } from "./sections";
import type {
  CheckFrequency,
  DashboardPart,
  DeviceType,
  FlightsPerYear,
  ReplaceOption,
  SectionId,
  SessionRecord,
  Step,
  Timeframe,
  Variant,
} from "./types";

// ── Vocabulary ──────────────────────────────────────────────────────────────

export const MEASURES = ["anxiety", "control", "predictability"] as const;
export type Measure = (typeof MEASURES)[number];

export const MEASURE_LABELS: Record<Measure, string> = {
  anxiety: "Anxiety",
  control: "Control",
  predictability: "Predictability",
};

export const VARIANTS: readonly Variant[] = ["A", "B"];

export const VARIANT_LABELS: Record<Variant, string> = {
  A: "Variant A · Full dashboard",
  B: "Variant B · Minimal",
};

export const VARIANT_SHORT_LABELS: Record<Variant, string> = { A: "A · Full", B: "B · Minimal" };

export const DEVICE_TYPES: readonly DeviceType[] = ["mobile", "tablet", "desktop"];

export const DEVICE_LABELS: Record<DeviceType, string> = {
  mobile: "Phone",
  tablet: "Tablet",
  desktop: "Desktop",
};

export const STEPS: readonly Step[] = ["welcome", "pre", "setup", "dashboard", "post", "debrief"];

export const STEP_LABELS: Record<Step, string> = {
  welcome: "Welcome",
  pre: "Pre-survey",
  setup: "Flight setup",
  dashboard: "Dashboard",
  post: "Post-survey",
  debrief: "Debrief",
};

export const CHECK_FREQUENCIES: readonly CheckFrequency[] = ["never", "once", "weekly", "daily", "multiple_daily"];

export const CHECK_FREQUENCY_LABELS: Record<CheckFrequency, string> = {
  never: "Never",
  once: "Once",
  weekly: "Weekly",
  daily: "Daily",
  multiple_daily: "Multiple times a day",
};

export const REPLACE_OPTIONS: readonly ReplaceOption[] = [
  "medication",
  "videos",
  "turbulence_apps",
  "choosing_flights",
  "nothing",
];

export const REPLACE_LABELS: Record<ReplaceOption, string> = {
  medication: "Medication",
  videos: "Videos",
  turbulence_apps: "Turbulence apps",
  choosing_flights: "Choosing flights carefully",
  nothing: "Nothing",
};

export const TIMEFRAMES: readonly Timeframe[] = ["lt1w", "1to4w", "1to3m", "3mplus"];

export const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  lt1w: "Less than a week away",
  "1to4w": "1–4 weeks away",
  "1to3m": "1–3 months away",
  "3mplus": "3+ months away",
};

export const FLIGHTS_PER_YEAR: readonly FlightsPerYear[] = ["0to1", "2to3", "4to6", "7to12", "13plus"];

export const FLIGHTS_PER_YEAR_LABELS: Record<FlightsPerYear, string> = {
  "0to1": "0–1 flights a year",
  "2to3": "2–3 flights a year",
  "4to6": "4–6 flights a year",
  "7to12": "7–12 flights a year",
  "13plus": "13+ flights a year",
};

/** Parts a participant can name in the post-survey, in dashboard order, plus the explicit "none". */
export type FeedbackPart = DashboardPart | "none";

export const FEEDBACK_PARTS: readonly FeedbackPart[] = ["summary", ...SECTION_IDS, "none"];

export const FEEDBACK_PART_LABELS: Record<FeedbackPart, string> = { ...PART_LABELS, none: "None of these" };

// ── Filters ─────────────────────────────────────────────────────────────────

export interface StatsFilters {
  /** Only sessions whose post-survey was submitted. */
  completedOnly: boolean;
  /** Include sessions started from a `?test=1` link. */
  includeTest: boolean;
  /** Include sessions whose variant was forced with `?v=`. */
  includeForced: boolean;
}

export const DEFAULT_FILTERS: StatsFilters = {
  completedOnly: true,
  includeTest: false,
  includeForced: true,
};

export function isCompleted(record: SessionRecord): boolean {
  return record.completedAt !== null;
}

/**
 * Cheap shape check so one malformed record (an old schema in localStorage,
 * a hand-edited file store) cannot crash the whole results page.
 */
export function isPlausibleRecord(value: unknown): value is SessionRecord {
  if (!value || typeof value !== "object") return false;
  const r = value as Partial<SessionRecord>;
  return (
    typeof r.sessionId === "string" &&
    (r.variant === "A" || r.variant === "B") &&
    typeof r.createdAt === "string" &&
    !!r.pre &&
    typeof r.pre === "object" &&
    !!r.post &&
    typeof r.post === "object" &&
    Array.isArray(r.post.feltBetter) &&
    Array.isArray(r.post.feltWorse) &&
    Array.isArray(r.post.wouldReplace)
  );
}

export function matchesFilters(record: SessionRecord, filters: StatsFilters): boolean {
  if (filters.completedOnly && !isCompleted(record)) return false;
  if (!filters.includeTest && record.isTest) return false;
  if (!filters.includeForced && record.variantSource === "forced") return false;
  return true;
}

export function applyFilters(records: readonly SessionRecord[], filters: StatsFilters): SessionRecord[] {
  return records.filter((r) => matchesFilters(r, filters));
}

function timestamp(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

/** Newest session first (by `createdAt`, then `updatedAt`). Returns a new array. */
export function sortNewestFirst(records: readonly SessionRecord[]): SessionRecord[] {
  return [...records].sort(
    (a, b) => timestamp(b.createdAt) - timestamp(a.createdAt) || timestamp(b.updatedAt) - timestamp(a.updatedAt),
  );
}

// ── Small numeric helpers ───────────────────────────────────────────────────

export function mean(values: readonly number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return null;
  return clean.reduce((sum, v) => sum + v, 0) / clean.length;
}

export function median(values: readonly number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  const n = clean.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 1 ? clean[mid] : (clean[mid - 1] + clean[mid]) / 2;
}

/** `part / whole` as a fraction, or null when the denominator is 0. */
export function share(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

function byVariant<T>(records: readonly SessionRecord[], compute: (subset: SessionRecord[]) => T): Record<Variant, T> {
  return {
    A: compute(records.filter((r) => r.variant === "A")),
    B: compute(records.filter((r) => r.variant === "B")),
  };
}

// ── Per-session helpers (also used by the table and the CSV) ───────────────

/** Post minus pre for one measure; null unless both answers exist. */
export function ratingChange(record: SessionRecord, measure: Measure): number | null {
  const pre = record.pre[measure];
  const post = record.post[measure];
  if (pre === null || post === null) return null;
  return post - pre;
}

export function hasPairedRatings(record: SessionRecord, measure: Measure): boolean {
  return record.pre[measure] !== null && record.post[measure] !== null;
}

/** Sections the participant's dashboard actually displayed (falls back to the variant's list). */
export function sectionsShown(record: SessionRecord): SectionId[] {
  const order = record.dashboard?.sectionOrder;
  if (order && order.length > 0) return [...order];
  return [...VARIANT_SECTIONS[record.variant]];
}

/** Dashboard parts the participant saw (summary card + displayed sections). */
export function partsSeen(record: SessionRecord): DashboardPart[] {
  return ["summary", ...sectionsShown(record)];
}

/** How many of the displayed sections were expanded at least once. Null before the dashboard. */
export function sectionsOpened(record: SessionRecord): { opened: number; shown: number } | null {
  const dashboard = record.dashboard;
  if (!dashboard) return null;
  const shown = sectionsShown(record);
  const opened = shown.filter((id) => (dashboard.sections[id]?.opens ?? 0) > 0).length;
  return { opened, shown: shown.length };
}

export function dashboardActiveMs(record: SessionRecord): number | null {
  return record.dashboard ? record.dashboard.activeMs : null;
}

/** Did the participant answer the post-survey questions beyond the sliders? */
export function answeredPost(record: SessionRecord): boolean {
  const post = record.post;
  return (
    record.completedAt !== null ||
    post.feltBetter.length > 0 ||
    post.feltWorse.length > 0 ||
    post.checkFrequency !== null ||
    post.wouldReplace.length > 0
  );
}

// ── Counts ──────────────────────────────────────────────────────────────────

export interface CompletionCounts {
  started: number;
  completed: number;
  /** completed / started, or null when nothing started. */
  completionRate: number | null;
}

export interface SessionCounts extends CompletionCounts {
  byVariant: Record<Variant, CompletionCounts>;
  byDevice: Record<DeviceType, number>;
  /** Furthest step reached, for sessions that did not complete. */
  stoppedAt: Record<Step, number>;
  test: number;
  forced: number;
}

function completionCounts(records: readonly SessionRecord[]): CompletionCounts {
  const started = records.length;
  const completed = records.filter(isCompleted).length;
  return { started, completed, completionRate: share(completed, started) };
}

/**
 * Session counts. Pass the set filtered by test/forced flags but NOT by
 * completion, otherwise the completion rate is trivially 100%.
 */
export function countSessions(records: readonly SessionRecord[]): SessionCounts {
  const byDevice: Record<DeviceType, number> = { mobile: 0, tablet: 0, desktop: 0 };
  const stoppedAt: Record<Step, number> = { welcome: 0, pre: 0, setup: 0, dashboard: 0, post: 0, debrief: 0 };
  let test = 0;
  let forced = 0;
  for (const r of records) {
    if (r.device && r.device.type in byDevice) byDevice[r.device.type] += 1;
    if (!isCompleted(r) && r.step in stoppedAt) stoppedAt[r.step] += 1;
    if (r.isTest) test += 1;
    if (r.variantSource === "forced") forced += 1;
  }
  return {
    ...completionCounts(records),
    byVariant: byVariant(records, completionCounts),
    byDevice,
    stoppedAt,
    test,
    forced,
  };
}

// ── Pre vs post ─────────────────────────────────────────────────────────────

export interface MeasureSummary {
  measure: Measure;
  /** Paired sessions: both the pre and the post answer exist. */
  n: number;
  meanPre: number | null;
  meanPost: number | null;
  /** Mean of the per-session (post − pre) differences. */
  meanChange: number | null;
}

export interface MeasureReport {
  measure: Measure;
  overall: MeasureSummary;
  byVariant: Record<Variant, MeasureSummary>;
}

function summarizePaired(records: readonly SessionRecord[], measure: Measure): MeasureSummary {
  const paired = records.filter((r) => hasPairedRatings(r, measure));
  const pre = paired.map((r) => r.pre[measure] as number);
  const post = paired.map((r) => r.post[measure] as number);
  return {
    measure,
    n: paired.length,
    meanPre: mean(pre),
    meanPost: mean(post),
    meanChange: mean(paired.map((r) => ratingChange(r, measure) as number)),
  };
}

export function summarizeMeasure(records: readonly SessionRecord[], measure: Measure): MeasureReport {
  return {
    measure,
    overall: summarizePaired(records, measure),
    byVariant: byVariant(records, (subset) => summarizePaired(subset, measure)),
  };
}

/** One report per measure, in `MEASURES` order. */
export function summarizeMeasures(records: readonly SessionRecord[]): MeasureReport[] {
  return MEASURES.map((m) => summarizeMeasure(records, m));
}

// ── Dropped / same / rose ───────────────────────────────────────────────────

export interface ChangeBreakdown {
  measure: Measure;
  n: number;
  dropped: number;
  same: number;
  rose: number;
  droppedPct: number | null;
  samePct: number | null;
  rosePct: number | null;
}

export interface ChangeReport {
  measure: Measure;
  overall: ChangeBreakdown;
  byVariant: Record<Variant, ChangeBreakdown>;
}

function breakdown(records: readonly SessionRecord[], measure: Measure): ChangeBreakdown {
  let dropped = 0;
  let same = 0;
  let rose = 0;
  for (const r of records) {
    const change = ratingChange(r, measure);
    if (change === null) continue;
    if (change < 0) dropped += 1;
    else if (change > 0) rose += 1;
    else same += 1;
  }
  const n = dropped + same + rose;
  return {
    measure,
    n,
    dropped,
    same,
    rose,
    droppedPct: share(dropped, n),
    samePct: share(same, n),
    rosePct: share(rose, n),
  };
}

export function changeBreakdown(records: readonly SessionRecord[], measure: Measure): ChangeReport {
  return {
    measure,
    overall: breakdown(records, measure),
    byVariant: byVariant(records, (subset) => breakdown(subset, measure)),
  };
}

// ── What helped vs. what made it worse ─────────────────────────────────────

export interface PartFeedback {
  part: FeedbackPart;
  label: string;
  /** Post-survey respondents who saw this part (everyone, for "none"). */
  saw: number;
  better: number;
  worse: number;
  betterPct: number | null;
  worsePct: number | null;
}

/**
 * Calming vs. anxiety-inducing mentions per dashboard part. The denominator
 * for each part is the number of post-survey respondents who actually saw it
 * (variant B participants never saw the pilot section, for example).
 */
export function partFeedback(records: readonly SessionRecord[]): PartFeedback[] {
  const respondents = records.filter(answeredPost);
  return FEEDBACK_PARTS.map((part) => {
    const sawIt = part === "none" ? respondents : respondents.filter((r) => partsSeen(r).includes(part));
    const better = sawIt.filter((r) => r.post.feltBetter.includes(part)).length;
    const worse = sawIt.filter((r) => r.post.feltWorse.includes(part)).length;
    return {
      part,
      label: FEEDBACK_PART_LABELS[part],
      saw: sawIt.length,
      better,
      worse,
      betterPct: share(better, sawIt.length),
      worsePct: share(worse, sawIt.length),
    };
  });
}

// ── Engagement ──────────────────────────────────────────────────────────────

export interface SectionEngagement {
  id: SectionId;
  title: string;
  /** Sessions whose dashboard displayed this section. */
  shown: number;
  /** …of which expanded it at least once. */
  opened: number;
  openRate: number | null;
  /** Median time expanded (ms) among sessions that opened it. */
  medianOpenMs: number | null;
  meanOpenMs: number | null;
  /** Median ms from dashboard start to the first expand, among sessions that opened it. */
  medianFirstOpenMs: number | null;
}

export interface EngagementReport {
  overall: SectionEngagement[];
  byVariant: Record<Variant, SectionEngagement[]>;
}

function engagementFor(records: readonly SessionRecord[]): SectionEngagement[] {
  return SECTIONS.map(({ id, title }) => {
    const shown = records.filter((r) => r.dashboard !== null && sectionsShown(r).includes(id));
    const opened = shown.filter((r) => (r.dashboard?.sections[id]?.opens ?? 0) > 0);
    const openMs = opened.map((r) => r.dashboard?.sections[id]?.openMs ?? 0);
    const firstOpen = opened
      .map((r) => r.dashboard?.sections[id]?.firstOpenAtMs ?? null)
      .filter((v): v is number => v !== null);
    return {
      id,
      title,
      shown: shown.length,
      opened: opened.length,
      openRate: share(opened.length, shown.length),
      medianOpenMs: median(openMs),
      meanOpenMs: mean(openMs),
      medianFirstOpenMs: median(firstOpen),
    };
  });
}

export function sectionEngagement(records: readonly SessionRecord[]): EngagementReport {
  return { overall: engagementFor(records), byVariant: byVariant(records, engagementFor) };
}

export interface DashboardTime {
  /** Sessions that reached the dashboard. */
  n: number;
  medianActiveMs: number | null;
  meanActiveMs: number | null;
  medianTotalMs: number | null;
  meanTotalMs: number | null;
  medianScrollPct: number | null;
}

function dashboardTimeFor(records: readonly SessionRecord[]): DashboardTime {
  const dashboards = records.flatMap((r) => (r.dashboard ? [r.dashboard] : []));
  const active = dashboards.map((d) => d.activeMs);
  const total = dashboards.map((d) => d.totalMs);
  return {
    n: dashboards.length,
    medianActiveMs: median(active),
    meanActiveMs: mean(active),
    medianTotalMs: median(total),
    meanTotalMs: mean(total),
    medianScrollPct: median(dashboards.map((d) => d.maxScrollPct)),
  };
}

export function dashboardTime(records: readonly SessionRecord[]): {
  overall: DashboardTime;
  byVariant: Record<Variant, DashboardTime>;
} {
  return { overall: dashboardTimeFor(records), byVariant: byVariant(records, dashboardTimeFor) };
}

export interface AlertStats {
  /** Sessions whose dashboard included the alerts section. */
  shown: number;
  tapped: number;
  tapRate: number | null;
  /** …of which left the toggle on. */
  leftOn: number;
}

function alertStatsFor(records: readonly SessionRecord[]): AlertStats {
  const shown = records.filter((r) => r.dashboard !== null && sectionsShown(r).includes("alerts"));
  const tapped = shown.filter((r) => r.dashboard?.alert.tapped);
  return {
    shown: shown.length,
    tapped: tapped.length,
    tapRate: share(tapped.length, shown.length),
    leftOn: tapped.filter((r) => r.dashboard?.alert.finalOn).length,
  };
}

export function alertStats(records: readonly SessionRecord[]): {
  overall: AlertStats;
  byVariant: Record<Variant, AlertStats>;
} {
  return { overall: alertStatsFor(records), byVariant: byVariant(records, alertStatsFor) };
}

// ── Distributions ───────────────────────────────────────────────────────────

export interface DistributionBucket<T extends string = string> {
  value: T;
  label: string;
  count: number;
  /** count / n, or null when nobody answered. */
  pct: number | null;
}

export interface Distribution<T extends string = string> {
  /** Respondents the percentages are based on. */
  n: number;
  buckets: DistributionBucket<T>[];
}

function singleChoice<T extends string>(
  records: readonly SessionRecord[],
  options: readonly T[],
  labels: Record<T, string>,
  pick: (record: SessionRecord) => T | null,
): Distribution<T> {
  const answers = records.map(pick).filter((v): v is T => v !== null);
  const n = answers.length;
  return {
    n,
    buckets: options.map((value) => {
      const count = answers.filter((a) => a === value).length;
      return { value, label: labels[value], count, pct: share(count, n) };
    }),
  };
}

/** "How often would you check it?" — single choice. */
export function checkFrequencyDistribution(records: readonly SessionRecord[]): Distribution<CheckFrequency> {
  return singleChoice(records, CHECK_FREQUENCIES, CHECK_FREQUENCY_LABELS, (r) => r.post.checkFrequency);
}

/**
 * "Would this replace anything you do today?" — multi-select, so the shares
 * are per respondent (someone who picked two options counts in both) and do
 * not add up to 100%.
 */
export function wouldReplaceDistribution(records: readonly SessionRecord[]): Distribution<ReplaceOption> {
  const respondents = records.filter((r) => answeredPost(r) && r.post.wouldReplace.length > 0);
  const n = respondents.length;
  return {
    n,
    buckets: REPLACE_OPTIONS.map((value) => {
      const count = respondents.filter((r) => r.post.wouldReplace.includes(value)).length;
      return { value, label: REPLACE_LABELS[value], count, pct: share(count, n) };
    }),
  };
}

/** Pre-survey: how far away the next flight is (optional question). */
export function timeframeDistribution(records: readonly SessionRecord[]): Distribution<Timeframe> {
  return singleChoice(records, TIMEFRAMES, TIMEFRAME_LABELS, (r) => r.pre.timeframe);
}

/** Pre-survey: flights per year (optional question). */
export function flightsPerYearDistribution(records: readonly SessionRecord[]): Distribution<FlightsPerYear> {
  return singleChoice(records, FLIGHTS_PER_YEAR, FLIGHTS_PER_YEAR_LABELS, (r) => r.pre.flightsPerYear);
}

// ── Open text ───────────────────────────────────────────────────────────────

export interface TextAnswer {
  sessionId: string;
  variant: Variant;
  createdAt: string;
  isTest: boolean;
  text: string;
}

export interface OpenTextAnswers {
  stillScaredOf: TextAnswer[];
  feltWorse: TextAnswer[];
  wouldReplace: TextAnswer[];
}

function collectText(records: readonly SessionRecord[], pick: (record: SessionRecord) => string): TextAnswer[] {
  return sortNewestFirst(records).flatMap((r) => {
    const text = (pick(r) ?? "").trim();
    if (!text) return [];
    return [{ sessionId: r.sessionId, variant: r.variant, createdAt: r.createdAt, isTest: r.isTest, text }];
  });
}

/** Non-empty free-text answers, newest first. */
export function openTextAnswers(records: readonly SessionRecord[]): OpenTextAnswers {
  return {
    stillScaredOf: collectText(records, (r) => r.post.stillScaredOf),
    feltWorse: collectText(records, (r) => r.post.feltWorseText),
    wouldReplace: collectText(records, (r) => r.post.wouldReplaceText),
  };
}

// ── Formatting (never NaN, never "null") ───────────────────────────────────

export const EM_DASH = "—";
const MINUS = "−";

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** 7.25 → "7.3"; null → "—". Uses a real minus sign for negatives. */
export function formatNumber(value: number | null | undefined, digits = 1): string {
  if (!isNumber(value)) return EM_DASH;
  const fixed = Math.abs(value).toFixed(digits);
  const isZero = Number(fixed) === 0;
  return value < 0 && !isZero ? `${MINUS}${fixed}` : fixed;
}

/** Signed change: 1.2 → "+1.2", −0.8 → "−0.8", 0 → "0.0"; null → "—". */
export function formatSigned(value: number | null | undefined, digits = 1): string {
  if (!isNumber(value)) return EM_DASH;
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return fixed;
  return value > 0 ? `+${fixed}` : `${MINUS}${fixed}`;
}

/** Fraction → percentage: 0.4167 → "42%"; null → "—". */
export function formatPct(value: number | null | undefined, digits = 0): string {
  if (!isNumber(value)) return EM_DASH;
  return `${(value * 100).toFixed(digits)}%`;
}

/** Milliseconds → "48s", "2m 14s", "1h 05m"; null → "—". */
export function formatMs(ms: number | null | undefined): string {
  if (!isNumber(ms)) return EM_DASH;
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** Integer count with thousands separators; null → "—". */
export function formatCount(value: number | null | undefined): string {
  if (!isNumber(value)) return EM_DASH;
  return Math.round(value).toLocaleString("en-US");
}
