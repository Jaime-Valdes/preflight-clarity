"use client";

import { Download, Info } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { ARM_PRICE_USD, LEGACY_ITEM_LABELS, dFeedbackToCsv, sortDFeedbackNewestFirst } from "@preflight/shared/dFeedback";
import {
  DEFAULT_D_FILTERS,
  D_SMALL_SAMPLE,
  PRICE_QUESTION_KEYS,
  armSummaries,
  dSignupStats,
  dSlice,
  dTexts,
  easierTally,
  itemTally,
  planTally,
  priceAnswers,
  reasonTally,
  type ArmSummary,
  type DFilters,
  type DTextAnswer,
  type OfferVersionFilter,
  type PriceQuestion,
  type PriceSpread,
  type Tally,
} from "@preflight/shared/dStats";
import { signupsToCsv, sortSignupsNewestFirst } from "@preflight/shared/signup";
import { formatCount, formatPct } from "@preflight/shared/stats";
import type { DFeedback, PriceArm, Signup } from "@preflight/shared/types";
import { DISMISS_REASONS, EASIER_OPTIONS, ITEM_LABELS, PLAN_OPTIONS, PRICE_QUESTIONS } from "@/components/d/offer/copy";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { PLACEMENT_LABELS } from "./InterestBlock";
import { FilterChip } from "./ResultsHeader";
import { Block, EmptyNote, HBar, Kpi, Legend, Notice, SERIES, Segmented, Tile, formatDateShort } from "./bits";
import { downloadCsv } from "./download";

/*
 * The results page's "Version D" tab: the Flight Day Pack price test (docs/FLIGHT_DAY_PACK.md) and D's
 * sign-ups, from the stored rows only. The test's own filters live here; the study tab's are separate.
 */

const ARM_COLOR: Record<PriceArm, string> = { p499: SERIES.pre, p1499: SERIES.post };
const ARM_LABEL: Record<PriceArm, string> = { p499: "$4.99", p1499: "$14.99" };
const ARMS: readonly PriceArm[] = ["p499", "p1499"];
const ARM_LEGEND = ARMS.map((arm) => ({ color: ARM_COLOR[arm], label: `Shown ${ARM_LABEL[arm]}` }));

const VERSION_OPTIONS: ReadonlyArray<{ value: OfferVersionFilter; label: string }> = [
  { value: "all", label: "Both offers" },
  { value: "v2", label: "v2 · pop-in" },
  { value: "v1", label: "v1 · in page" },
];

const usd = (n: number | null) =>
  n === null ? "—" : n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 === 0 ? 0 : 2 });

const labelOf = <K extends string>(options: readonly { key: K; label: string }[]) =>
  Object.fromEntries(options.map((o) => [o.key, o.label])) as Record<K, string>;
const REASON_LABELS = labelOf(DISMISS_REASONS);
const PLAN_LABELS = labelOf(PLAN_OPTIONS);
const EASIER_LABELS = labelOf(EASIER_OPTIONS);
const ITEM_ALL_LABELS: Record<string, string> = { ...ITEM_LABELS, ...LEGACY_ITEM_LABELS };
const QUESTION_LABELS = Object.fromEntries(PRICE_QUESTIONS.map((q) => [q.key, `…${q.label}`])) as Record<PriceQuestion, string>;

export interface DResultsTabProps {
  signups: Signup[];
  dFeedback: DFeedback[];
}

export function DResultsTab({ signups, dFeedback }: DResultsTabProps) {
  const [filters, setFilters] = useState<DFilters>(DEFAULT_D_FILTERS);
  const slice = useMemo(() => dSlice(signups, dFeedback, filters), [signups, dFeedback, filters]);
  const arms = useMemo(() => armSummaries(slice), [slice]);
  const items = useMemo(() => itemTally(slice), [slice]);
  const reasons = useMemo(() => reasonTally(slice), [slice]);
  const plans = useMemo(() => planTally(slice), [slice]);
  const easier = useMemo(() => easierTally(slice), [slice]);
  const prices = useMemo(() => priceAnswers(slice), [slice]);
  const texts = useMemo(() => dTexts(slice), [slice]);
  const stats = useMemo(() => dSignupStats(slice), [slice]);

  const toggle = (key: "includeTest" | "includeForced") => setFilters((f) => ({ ...f, [key]: !f[key] }));
  const totalJoins = arms.reduce((n, a) => n + a.joins, 0);
  const totalDeclines = arms.reduce((n, a) => n + a.declines, 0);
  const revenue = arms.reduce((n, a) => n + a.wouldBeRevenue, 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="mt-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Cloud9 · Team</p>
            <h1 className="mt-1 text-[28px] font-bold leading-none text-ink-900 sm:text-[32px]">Version D results</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-500">
              The Flight Day Pack price test: each visitor is shown the pack at $4.99 or $14.99 per trip, at random, and
              always sees that price. “Add” leads to an email form; nothing is ever charged.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="md"
              icon={<Download aria-hidden className="size-4" />}
              onClick={() => downloadCsv(dFeedbackToCsv(sortDFeedbackNewestFirst(slice.feedback)), "preflight-clarity-flight-day-pack")}
              disabled={slice.feedback.length === 0}
            >
              Answers CSV
            </Button>
            <Button
              variant="secondary"
              size="md"
              icon={<Download aria-hidden className="size-4" />}
              onClick={() => downloadCsv(signupsToCsv(sortSignupsNewestFirst(slice.signups)), "preflight-clarity-d-signups")}
              disabled={slice.signups.length === 0}
            >
              D sign-ups CSV
            </Button>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <FilterChip on={filters.includeTest} label="Include test sessions" onToggle={() => toggle("includeTest")} />
          <FilterChip on={filters.includeForced} label="Include forced prices" onToggle={() => toggle("includeForced")} />
          <div className="sm:ml-auto">
            <Segmented
              label="Offer version"
              options={VERSION_OPTIONS}
              value={filters.offerVersion}
              onChange={(offerVersion) => setFilters((f) => ({ ...f, offerVersion }))}
            />
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Pack sign-ups" value={formatCount(totalJoins)} hint={`${arms[0].joins} at $4.99 · ${arms[1].joins} at $14.99`} />
        <Kpi label="Would-be revenue" value={usd(revenue)} hint="Sign-ups × the price they saw" />
        <Kpi label="No thanks, with a reason" value={formatCount(totalDeclines)} hint={`${arms[0].declines} at $4.99 · ${arms[1].declines} at $14.99`} />
        <Kpi label="Answered price questions" value={formatCount(prices.respondents)} hint="The four “at what price…” questions" />
        <Kpi
          label="All D sign-ups"
          value={formatCount(stats.uniqueEmails)}
          hint={`${stats.total} sign-ups · ${stats.interview} open to a chat`}
        />
      </div>

      <InsightsBlock arms={arms} reasons={reasons} items={items} prices={prices} plans={plans} />

      <PriceTestBlock arms={arms} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TallyBlock
          title="What they’d use"
          subtitle="“Which of these would you actually use?”, asked after signing up for the pack. People can tick several."
          tally={items}
          labels={ITEM_ALL_LABELS}
          unit="people"
        />
        <TallyBlock
          title="Why they said no thanks"
          subtitle="One tap after “No thanks”. Leaving without tapping saves nothing here."
          tally={reasons}
          labels={REASON_LABELS}
          unit="answers"
        />
      </div>

      <PriceAnswersBlock prices={prices} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TallyBlock title="Per trip or yearly" subtitle="“Per trip, or $29.99 a year for every trip?”" tally={plans} labels={PLAN_LABELS} unit="answers" />
        <TallyBlock
          title="Did Cloud9 make choosing easier?"
          subtitle="From “Tell us what you think” under the flight and compare pages."
          tally={easier}
          labels={EASIER_LABELS}
          unit="answers"
        />
      </div>

      <Block title="In their own words" subtitle="Typed answers, newest first, quoted exactly as typed.">
        <div className="grid gap-6 lg:grid-cols-3">
          <TextList title="What would make it worth it (signed up)" items={texts.worthIt} />
          <TextList title="Anything else (said no thanks)" items={texts.anythingElse} />
          <TextList title="What would make Cloud9 more useful" items={texts.moreUseful} />
        </div>
      </Block>

      <SignupsBlock stats={stats} />

      <Notice icon={<Info aria-hidden />}>
        Offer views and clicks are counted in PostHog (<code>d_addon_view</code>, <code>d_addon_click</code>), not stored
        here, so this tab has no per-view rates. The offer-version switch applies to the pack’s own rows; D’s other
        sign-ups have no version.
      </Notice>
    </div>
  );
}

// ── Insights: the slice in plain sentences ──────────────────────────────────

/** The most-picked rows of a tally (ties kept), or none when nothing was picked. */
function top<K extends string>(tally: Tally<K>, skip: readonly string[] = []): Array<{ key: K; count: number }> {
  const rows = tally.rows.filter((r) => !skip.includes(r.key) && r.count > 0);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return rows.filter((r) => r.count === max);
}

const listOf = (labels: string[]) => (labels.length <= 1 ? labels.join("") : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`);

function InsightsBlock({
  arms,
  reasons,
  items,
  prices,
  plans,
}: {
  arms: ArmSummary[];
  reasons: Tally<string>;
  items: Tally<string>;
  prices: ReturnType<typeof priceAnswers>;
  plans: Tally<string>;
}) {
  const lines: ReactNode[] = [];
  const [low, high] = arms;
  const answered = (a: ArmSummary) => a.joins + a.declines;
  const perAnswer = (a: ArmSummary) => (answered(a) > 0 ? a.wouldBeRevenue / answered(a) : null);

  if (answered(low) + answered(high) === 0) {
    lines.push("Nobody has signed up for the pack or said why not yet.");
  } else {
    lines.push(
      <>
        <strong>Sign-ups:</strong> at $14.99, {high.joins} of {answered(high)} who answered signed up ({formatPct(high.joinShare)}); at
        $4.99, {low.joins} of {answered(low)} ({formatPct(low.joinShare)}).
      </>,
    );
    const a = perAnswer(high);
    const b = perAnswer(low);
    if (a !== null && b !== null && (a > 0 || b > 0)) {
      const leader = a >= b ? high : low;
      lines.push(
        <>
          <strong>Revenue:</strong> {usd(Math.round((a ?? 0) * 100) / 100)} per person who answered at $14.99 vs{" "}
          {usd(Math.round((b ?? 0) * 100) / 100)} at $4.99, so {ARM_LABEL[leader.arm]} is ahead on would-be revenue so far.
        </>,
      );
    }
  }

  const topReasons = top(reasons);
  if (topReasons.length > 0) {
    const tooExpensive = reasons.rows.find((r) => r.key === "too_expensive");
    const shareAt = (arm: PriceArm) =>
      reasons.answersByArm[arm] > 0 ? formatPct((tooExpensive?.byArm[arm] ?? 0) / reasons.answersByArm[arm]) : "—";
    lines.push(
      <>
        <strong>No thanks:</strong> the most common {topReasons.length > 1 ? "reasons are" : "reason is"}{" "}
        {listOf(topReasons.map((r) => `“${REASON_LABELS[r.key as keyof typeof REASON_LABELS]}”`))} ({topReasons[0].count}
        {topReasons.length > 1 ? " each" : ""} of {reasons.total}). “Too expensive” is {shareAt("p1499")} of reasons at $14.99 and {shareAt("p499")} at $4.99.
      </>,
    );
  }

  const ge = prices.overall.gettingExpensive.median;
  const te = prices.overall.tooExpensive.median;
  if (prices.respondents > 0 && ge !== null && te !== null) {
    const where = 14.99 < ge ? "below both" : 14.99 < te ? "between the two" : "above both";
    lines.push(
      <>
        <strong>Price:</strong> the median answer for “getting expensive” is {usd(ge)} and for “too expensive to consider” {usd(te)}.
        $14.99 sits {where}; $4.99 sits {4.99 < ge ? "below both" : 4.99 < te ? "between the two" : "above both"}.
      </>,
    );
  }

  const topItems = top(items, ["none"]);
  if (topItems.length > 0) {
    const none = items.rows.find((r) => r.key === "none")?.count ?? 0;
    lines.push(
      <>
        <strong>Most wanted:</strong> {listOf(topItems.map((r) => ITEM_ALL_LABELS[r.key] ?? r.key))} ({topItems[0].count}{topItems.length > 1 ? " each" : ""} of {items.total}
        {none > 0 ? `; ${none} picked “None of these”` : ""}).
      </>,
    );
  }

  const topPlans = top(plans);
  if (topPlans.length > 0) {
    lines.push(
      <>
        <strong>Per trip or yearly:</strong> {listOf(topPlans.map((r) => `“${PLAN_LABELS[r.key as keyof typeof PLAN_LABELS]}”`))}{" "}
        {topPlans.length > 1 ? `are tied (${topPlans[0].count} each` : `leads (${topPlans[0].count}`} of {plans.total}).
      </>,
    );
  }

  const small = Math.min(answered(low), answered(high)) < D_SMALL_SAMPLE;
  return (
    <Block
      title="What it says so far"
      subtitle={small ? `Early signals: fewer than ${D_SMALL_SAMPLE} answers at a price, so a single person can move these.` : "Computed from the rows below, with the filters above."}
    >
      <ul className="flex flex-col gap-2.5">
        {lines.map((line, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-700 [&_strong]:font-semibold [&_strong]:text-ink-900">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink-300" />
            <span className="min-w-0">{line}</span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

// ── The price test ──────────────────────────────────────────────────────────

function PriceTestBlock({ arms }: { arms: ArmSummary[] }) {
  const small = arms.some((a) => a.joins + a.declines < D_SMALL_SAMPLE);
  return (
    <Block
      title="By price"
      subtitle="Sign-ups and stated no-thanks for each price. Share = sign-ups out of everyone who did either."
      aside={<Legend items={ARM_LEGEND} />}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {arms.map((a) => (
          <div key={a.arm} className="min-w-0 rounded-2xl p-4 ring-1 ring-inset ring-line/80">
            <div className="flex items-center gap-2">
              <span aria-hidden className="size-3 rounded-[3px]" style={{ background: ARM_COLOR[a.arm] }} />
              <h3 className="text-base font-bold text-ink-900">{ARM_LABEL[a.arm]} per trip</h3>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Tile label="Signed up" value={formatCount(a.joins)} hint={`${a.byPlacement.results.joins} pop-in · ${a.byPlacement.after_pick.joins} after a pick`} />
              <Tile label="No thanks" value={formatCount(a.declines)} hint={`${a.byPlacement.results.declines} pop-in · ${a.byPlacement.after_pick.declines} after a pick`} />
              <Tile label="Share who signed up" value={formatPct(a.joinShare)} hint={`${a.joins} of ${a.joins + a.declines}`} />
              <Tile label="Would-be revenue" value={usd(a.wouldBeRevenue)} hint={`${a.joins} × ${usd(ARM_PRICE_USD[a.arm])}`} />
            </div>
            <div className="mt-3">
              <HBar pct={a.joinShare} color={ARM_COLOR[a.arm]} height="h-2" />
            </div>
          </div>
        ))}
      </div>
      {small ? (
        <p className="text-xs leading-snug text-ink-500">
          Fewer than {D_SMALL_SAMPLE} answers at {arms.every((a) => a.joins + a.declines < D_SMALL_SAMPLE) ? "each price" : "one price"} so far:
          read these as early signals, not a result.
        </p>
      ) : null}
    </Block>
  );
}

// ── Counts per option ───────────────────────────────────────────────────────

function TallyBlock<K extends string>({
  title,
  subtitle,
  tally,
  labels,
  unit,
}: {
  title: string;
  subtitle: string;
  tally: Tally<K>;
  labels: Record<string, string>;
  unit: string;
}) {
  return (
    <Block title={title} subtitle={subtitle} aside={<span className="text-xs text-ink-400 tabular-nums">{formatCount(tally.total)} {unit}</span>}>
      {tally.total === 0 ? (
        <EmptyNote>No answers in this slice yet.</EmptyNote>
      ) : (
        <>
          <div className="divide-y divide-line/60">
            {tally.rows.map((row) => (
              <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 py-2 sm:grid-cols-[minmax(0,13rem)_1fr_auto]">
                <span className="min-w-0 text-sm leading-snug text-ink-700">
                  {labels[row.key] ?? row.key}
                </span>
                <div className="order-last col-span-2 flex flex-col gap-1 sm:order-none sm:col-span-1">
                  {ARMS.map((arm) => (
                    <HBar
                      key={arm}
                      pct={tally.answersByArm[arm] > 0 ? row.byArm[arm] / tally.answersByArm[arm] : 0}
                      color={ARM_COLOR[arm]}
                      height="h-1.5"
                    />
                  ))}
                </div>
                <span className="whitespace-nowrap text-right text-sm tabular-nums text-ink-900">
                  <span className="font-semibold">{formatCount(row.count)}</span>
                  <span className="text-ink-500"> · {row.byArm.p499} / {row.byArm.p1499}</span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Legend items={ARM_LEGEND} />
            <span className="text-xs text-ink-400">
              Bars: share of each price’s {unit} ({tally.answersByArm.p499} / {tally.answersByArm.p1499}) · counts: all · $4.99 / $14.99
            </span>
          </div>
        </>
      )}
    </Block>
  );
}

// ── Van Westendorp ──────────────────────────────────────────────────────────

/** Right edge of the dot strips: the largest answer rounded up to $10, at least $20, at most $100. */
function stripMax(spreads: PriceSpread[]): number {
  const top = Math.max(0, ...spreads.flatMap((s) => s.values));
  return Math.min(100, Math.max(20, Math.ceil(top / 10) * 10));
}

function DotStrip({ spread, max }: { spread: PriceSpread; max: number }) {
  const x = (v: number) => (Math.min(v, max) / max) * 100;
  return (
    <div className="relative h-7" aria-hidden>
      <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
      {[4.99, 14.99].filter((p) => p <= max).map((p) => (
        <div key={p} className="absolute inset-y-0 w-px bg-ink-300" style={{ left: `${x(p)}%` }} />
      ))}
      {spread.p25 !== null && spread.p75 !== null ? (
        <div
          className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-breeze-100"
          style={{ left: `${x(spread.p25)}%`, width: `${Math.max(0.8, x(spread.p75) - x(spread.p25))}%` }}
        />
      ) : null}
      {spread.values.map((v, i) => (
        <span
          key={i}
          title={usd(v)}
          className="absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface"
          style={{ left: `${x(v)}%`, background: SERIES.magnitude, opacity: 0.75 }}
        />
      ))}
      {spread.median !== null ? (
        <span className="absolute top-0.5 bottom-0.5 w-[3px] -translate-x-1/2 rounded-full bg-night-900" style={{ left: `${x(spread.median)}%` }} />
      ) : null}
    </div>
  );
}

function PriceAnswersBlock({ prices }: { prices: ReturnType<typeof priceAnswers> }) {
  const max = stripMax(PRICE_QUESTION_KEYS.map((k) => prices.overall[k]));
  const over = PRICE_QUESTION_KEYS.reduce((n, k) => n + prices.overall[k].values.filter((v) => v > max).length, 0);
  return (
    <Block
      title="What price feels right"
      subtitle="“At what price would the Flight Day Pack feel…”, asked once per visitor, all optional. Dots are answers, the dark tick is the median, the shaded band the middle half; thin lines mark $4.99 and $14.99."
      aside={<span className="text-xs text-ink-400 tabular-nums">{formatCount(prices.respondents)} people</span>}
    >
      {prices.respondents === 0 ? (
        <EmptyNote>No price answers in this slice yet.</EmptyNote>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:thin]">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                <th scope="col" className="pb-2 pl-1 pr-3 font-semibold">Feels…</th>
                <th scope="col" className="w-[38%] px-3 pb-2 font-semibold">
                  <span className="flex justify-between tabular-nums normal-case tracking-normal">
                    <span>$0</span>
                    <span>{usd(max)}{over > 0 ? "+" : ""}</span>
                  </span>
                </th>
                <th scope="col" className="px-3 pb-2 text-right font-semibold">Median</th>
                <th scope="col" className="px-3 pb-2 text-right font-semibold">Middle half</th>
                <th scope="col" className="px-3 pb-2 text-right font-semibold">Shown $4.99</th>
                <th scope="col" className="pb-2 pl-3 pr-1 text-right font-semibold">Shown $14.99</th>
              </tr>
            </thead>
            <tbody>
              {PRICE_QUESTION_KEYS.map((k) => {
                const s = prices.overall[k];
                return (
                  <tr key={k} className="border-t border-line/70">
                    <td className="py-2.5 pl-1 pr-3 text-ink-700">{QUESTION_LABELS[k]}</td>
                    <td className="px-3 py-2.5">
                      <DotStrip spread={s} max={max} />
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-ink-900">{usd(s.median)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-ink-700">
                      {s.p25 === null ? "—" : `${usd(s.p25)}–${usd(s.p75)}`}
                    </td>
                    {ARMS.map((arm, i) => {
                      const a = prices.byArm[arm][k];
                      return (
                        <td key={arm} className={cn("whitespace-nowrap py-2.5 text-right tabular-nums text-ink-700", i === 1 ? "pl-3 pr-1" : "px-3")}>
                          {usd(a.median)} <span className="text-ink-400">· {a.n}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-3 text-xs leading-snug text-ink-500">
            The price columns are medians · number of answers, split by the price the person had just been shown, so you
            can see whether it anchored them.{over > 0 ? ` ${over} ${over === 1 ? "answer is" : "answers are"} above ${usd(max)} and sit at the right edge.` : ""}
          </p>
        </div>
      )}
    </Block>
  );
}

// ── Words ───────────────────────────────────────────────────────────────────

const INITIAL = 5;

function TextList({ title, items }: { title: string; items: DTextAnswer[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? items : items.slice(0, INITIAL);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        <span className="text-xs text-ink-400 tabular-nums">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <EmptyNote className="mt-3">Nothing written yet.</EmptyNote>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {visible.map((item) => (
            <li key={item.id} className="rounded-2xl bg-canvas/70 px-4 py-3 ring-1 ring-inset ring-line/70">
              <p className="break-words text-sm leading-relaxed text-ink-900">“{item.text}”</p>
              <p className="mt-1.5 text-xs text-ink-400">
                Shown {ARM_LABEL[item.arm]} · {formatDateShort(item.createdAt)}
                {item.isTest ? " · test session" : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
      {items.length > INITIAL ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="mt-3 h-10 rounded-full px-4 text-sm font-semibold text-breeze-700 hover:bg-breeze-50"
        >
          {showAll ? "Show fewer" : `Show all ${items.length}`}
        </button>
      ) : null}
    </div>
  );
}

// ── Sign-ups ────────────────────────────────────────────────────────────────

function CountList({ title, rows, empty }: { title: string; rows: ReadonlyArray<{ key: string; label: ReactNode; count: number }>; empty: string }) {
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-bold text-ink-900">{title}</h3>
      {max === 0 ? (
        <EmptyNote className="mt-3">{empty}</EmptyNote>
      ) : (
        <div className="mt-1 divide-y divide-line/60">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 py-1.5">
              <span className="min-w-0 truncate text-sm text-ink-700">{r.label}</span>
              <HBar pct={max > 0 ? r.count / max : 0} color={SERIES.magnitude} height="h-2" />
              <span className="text-right text-sm font-semibold tabular-nums text-ink-900">{formatCount(r.count)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SignupsBlock({ stats }: { stats: ReturnType<typeof dSignupStats> }) {
  return (
    <Block
      title="Version D sign-ups"
      subtitle={`Every “get it free at launch” sign-up on version D. ${stats.withFlightDate} of the pack’s sign-ups gave a real flight date.`}
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <CountList
          title="Where they signed up"
          rows={stats.byPlacement.map((p) => ({ key: p.key, label: PLACEMENT_LABELS[p.key].replace(/^D · /, ""), count: p.count }))}
          empty="No version D sign-ups in this slice yet."
        />
        <CountList
          title="Pack sign-ups by campaign source"
          rows={stats.joinsBySource.map((s) => ({ key: s.key || "(none)", label: s.key || "No campaign tag", count: s.count }))}
          empty="No pack sign-ups in this slice yet."
        />
      </div>
    </Block>
  );
}
