"use client";

import { useMemo } from "react";
import {
  checkFrequencyDistribution,
  flightsPerYearDistribution,
  formatPct,
  timeframeDistribution,
  wouldReplaceDistribution,
  type Distribution,
} from "@preflight/shared/stats";
import type { SessionRecord } from "@preflight/shared/types";
import { BarRow, Block, EmptyNote, SERIES } from "./bits";

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
              label={b.label}
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

/** Post-survey single/multi-choice answers, plus the optional pre-survey context questions. */
export function DistributionsBlock({ records, className }: { records: SessionRecord[]; className?: string }) {
  const check = useMemo(() => checkFrequencyDistribution(records), [records]);
  const replace = useMemo(() => wouldReplaceDistribution(records), [records]);
  const timeframe = useMemo(() => timeframeDistribution(records), [records]);
  const flights = useMemo(() => flightsPerYearDistribution(records), [records]);
  const hasContext = timeframe.n > 0 || flights.n > 0;

  return (
    <Block
      id="distributions"
      className={className}
      title="If this existed for real"
      subtitle="How often they would check it, and what it might replace."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <DistributionList title="Would check it…" note="Single choice. Share of those who answered." data={check} />
        <DistributionList
          title="Would replace…"
          note="Multi-select: shares are per respondent and don't add up to 100%."
          data={replace}
        />
      </div>
      {hasContext ? (
        <div className="border-t border-line/70 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Pre-survey context (optional questions)</p>
          <div className="mt-2 grid gap-6 sm:grid-cols-2">
            <DistributionList title="Next flight is…" note="Share of those who answered." data={timeframe} />
            <DistributionList title="They fly…" note="Share of those who answered." data={flights} />
          </div>
        </div>
      ) : null}
    </Block>
  );
}
