"use client";

import { useMemo } from "react";
import {
  ANXIETY_STARTS,
  ANXIETY_START_LABELS,
  WORRIES,
  WORRY_LABELS,
  bookLikelihoodDistribution,
  checkFrequencyDistribution,
  flightsPerYearDistribution,
  formatPct,
  share,
  timeframeDistribution,
  wouldReplaceDistribution,
  type Distribution,
} from "@preflight/shared/stats";
import type { AnxietyStart, SessionRecord, WorryMost } from "@preflight/shared/types";
import { BarRow, Block, EmptyNote, SERIES } from "./bits";

/**
 * Single-choice distribution over the sessions that answered (same shape and
 * rules as the shared `*Distribution` helpers; local until stats.ts exports
 * ones for the newer questions).
 */
function singleChoice<T extends string>(
  records: readonly SessionRecord[],
  options: readonly T[],
  labels: Record<T, string>,
  pick: (record: SessionRecord) => T | null | undefined,
): Distribution<T> {
  const answers = records.map(pick).filter((v): v is T => typeof v === "string" && options.includes(v));
  const n = answers.length;
  return {
    n,
    buckets: options.map((value) => {
      const count = answers.filter((a) => a === value).length;
      return { value, label: labels[value], count, pct: share(count, n) };
    }),
  };
}

function worriesMostDistribution(records: readonly SessionRecord[]): Distribution<WorryMost> {
  return singleChoice(records, WORRIES, WORRY_LABELS, (r) => r.pre.worriesMost);
}

function anxietyStartsDistribution(records: readonly SessionRecord[]): Distribution<AnxietyStart> {
  return singleChoice(records, ANXIETY_STARTS, ANXIETY_START_LABELS, (r) => r.pre.anxietyStarts);
}

function DistributionList({ title, note, data }: { title: string; note: string; data: Distribution }) {
  const scale = Math.max(0.25, ...data.buckets.map((b) => b.pct ?? 0));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        <span className="text-xs text-ink-400 tabular-nums">n = {data.n}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-500">{note}</p>
      {data.n === 0 ? (
        <EmptyNote className="mt-3">No answers yet.</EmptyNote>
      ) : (
        <div className="mt-2 divide-y divide-line/60">
          {data.buckets.map((b) => (
            <BarRow
              key={b.value}
              label={<span title={b.label}>{b.label}</span>}
              pct={b.pct}
              scale={scale}
              color={SERIES.magnitude}
              value={
                <>
                  <span className="font-semibold">{b.count}</span>
                  <span className="text-ink-500"> · {formatPct(b.pct)}</span>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Post-survey single/multi-choice answers, plus the pre-survey context questions. */
export function DistributionsBlock({ records, className }: { records: SessionRecord[]; className?: string }) {
  const check = useMemo(() => checkFrequencyDistribution(records), [records]);
  const replace = useMemo(() => wouldReplaceDistribution(records), [records]);
  const booking = useMemo(() => bookLikelihoodDistribution(records), [records]);
  const timeframe = useMemo(() => timeframeDistribution(records), [records]);
  const flights = useMemo(() => flightsPerYearDistribution(records), [records]);
  const worries = useMemo(() => worriesMostDistribution(records), [records]);
  const starts = useMemo(() => anxietyStartsDistribution(records), [records]);
  const hasContext = timeframe.n > 0 || flights.n > 0 || worries.n > 0 || starts.n > 0;

  return (
    <Block
      id="distributions"
      className={className}
      title="If this existed for real"
      subtitle="How often they would check it, what it might replace, and whether it would make booking more likely."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <DistributionList title="Would check it…" note="Single choice. Share of those who answered." data={check} />
        <DistributionList
          title="Would replace…"
          note="Multi-select: shares are per respondent and don't add up to 100%."
          data={replace}
        />
        <DistributionList
          title="More likely to book a flight?"
          note="Optional, asked since 2026-10-24. Share of those who answered."
          data={booking}
        />
      </div>
      {hasContext ? (
        <div className="border-t border-line/70 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Pre-survey context</p>
          <div className="mt-2 grid gap-6 sm:grid-cols-2">
            {/* Asked until 2026-10-24; newer sessions give a flight date instead, so the list only shows while someone answered it. */}
            {timeframe.n > 0 ? (
              <DistributionList title="Next flight is…" note="Older sessions only. Share of those who answered." data={timeframe} />
            ) : null}
            <DistributionList title="They fly…" note="Share of those who answered." data={flights} />
            <DistributionList title="Worries them most…" note="Share of those who answered." data={worries} />
            <DistributionList title="Anxiety starts…" note="Share of those who answered." data={starts} />
          </div>
        </div>
      ) : null}
    </Block>
  );
}
