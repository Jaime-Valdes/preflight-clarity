"use client";

import { useMemo } from "react";
import { explorationStats, formatMs, formatNumber, formatPct } from "@preflight/shared/stats";
import type { SessionRecord } from "@preflight/shared/types";
import { BarRow, Block, EmptyNote, SERIES, Tile } from "./bits";

/** "2 of 5" under a share, or a quiet note when nobody is in the slice. */
function ofN(count: number, n: number): string {
  return n > 0 ? `${count} of ${n} sessions` : "no exploration data yet";
}

/**
 * Free exploration (variant A only): how many flights people looked at, whether
 * they compared, and what they said about switching. Descriptive only — a
 * preferred flight is what they tapped, nothing was booked.
 */
export function ExplorationBlock({ records, className }: { records: SessionRecord[]; className?: string }) {
  const stats = useMemo(() => explorationStats(records).byVariant.A, [records]);
  const { n, wouldSwitch } = stats;
  const scale = Math.max(0.25, ...wouldSwitch.buckets.map((b) => b.pct ?? 0));

  return (
    <Block
      id="exploration"
      className={className}
      title="Exploring (variant A)"
      subtitle={
        <>
          Flights looked at include their own. Time only counts while the page was visible. “Preferred” is the
          “I’d prefer this one” tap in the compare view — recorded only, nothing is booked.{" "}
          <span className="tabular-nums">n = {n}</span>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile
          label="Flights looked at"
          value={formatNumber(stats.medianFlights)}
          hint={n > 0 ? `median · mean ${formatNumber(stats.meanFlights)}` : "no exploration data yet"}
        />
        <Tile label="Added a flight" value={formatPct(stats.addedAnyPct)} hint={ofN(stats.addedAny, n)} />
        <Tile label="Opened compare" value={formatPct(stats.openedComparePct)} hint={ofN(stats.openedCompare, n)} />
        <Tile
          label="Preferred another"
          value={formatPct(stats.preferredOtherPct)}
          hint={n > 0 ? `${stats.preferredOther} of ${n} marked a flight other than their own` : "no exploration data yet"}
        />
        <Tile label="Time on own flight" value={formatMs(stats.medianReferenceMs)} hint="median per session" />
        <Tile
          label="Time per other flight"
          value={formatMs(stats.medianOtherMs)}
          hint={stats.medianOtherMs === null ? "nobody added a flight yet" : "median over every added flight"}
        />
        <Tile
          label="Finished on another"
          value={formatPct(stats.endedOnOtherPct)}
          hint={n > 0 ? `${stats.endedOnOther} of ${n} tapped “done” on another flight` : "no exploration data yet"}
        />
        <Tile
          label="Flights added"
          value={n > 0 ? String(stats.alternativesOpened + stats.whatIfs) : "—"}
          hint={`${stats.alternativesOpened} opened from alternatives · ${stats.whatIfs} via “Try a different flight”`}
        />
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-bold text-ink-900">Would switch to another flight they looked at</h3>
          <span className="shrink-0 text-xs text-ink-400 tabular-nums">n = {wouldSwitch.n}</span>
        </div>
        <p className="mt-0.5 text-xs text-ink-500">Optional post-survey question. Share of those who answered.</p>
        {wouldSwitch.n === 0 ? (
          <EmptyNote className="mt-3">No answers yet.</EmptyNote>
        ) : (
          <div className="mt-2 divide-y divide-line/60">
            {wouldSwitch.buckets.map((b) => (
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
    </Block>
  );
}
