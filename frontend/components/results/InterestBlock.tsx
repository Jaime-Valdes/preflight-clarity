"use client";

import { Info } from "lucide-react";
import { SIGNUP_PLACEMENTS, type SignupRate, type SignupStats } from "@preflight/shared/signup";
import { VARIANT_SHORT_LABELS, formatCount } from "@preflight/shared/stats";
import type { SignupPlacement, SignupSource } from "@preflight/shared/types";
import { BarRow, Block, EmptyNote, Notice, SERIES, Tile } from "./bits";

export const SOURCE_LABELS: Record<SignupSource, string> = { study: "Study", c: "Version C" };

export const PLACEMENT_LABELS: Record<SignupPlacement, string> = {
  debrief: "Study · debrief",
  dashboard: "Study · briefing",
  c_home: "C · home",
  c_results: "C · results",
  c_flight: "C · flight",
  c_compare: "C · compare",
};

/** "25%" or "—" (nobody reached the debrief). */
function ratePct(rate: SignupRate): string {
  return rate.pct === null ? "—" : `${rate.pct}%`;
}

/** "12 of 48 who reached the debrief", or why there is no rate yet. */
function rateHint(rate: SignupRate): string {
  if (rate.reachedDebrief === 0) return "Nobody reached the debrief yet";
  return `${formatCount(rate.signups)} of ${formatCount(rate.reachedDebrief)} who reached the debrief`;
}

function BarList({ title, rows }: { title: string; rows: ReadonlyArray<{ key: string; label: string; count: number }> }) {
  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const max = rows.reduce((m, r) => Math.max(m, r.count), 0);
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-bold text-ink-900">{title}</h3>
      {total === 0 ? (
        <EmptyNote className="mt-3">No sign-ups in this slice yet.</EmptyNote>
      ) : (
        <div className="mt-1 divide-y divide-line/60">
          {rows.map((row) => (
            <BarRow
              key={row.key}
              label={row.label}
              pct={row.count / total}
              scale={max / total}
              color={SERIES.magnitude}
              value={
                <>
                  <span className="font-semibold">{formatCount(row.count)}</span>
                  <span className="text-ink-500"> · {Math.round((100 * row.count) / total)}%</span>
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface InterestBlockProps {
  stats: SignupStats;
  /** Why the sign-ups may be incomplete (e.g. the backend has no sign-ups endpoint yet). */
  note?: string;
  className?: string;
}

/**
 * The business signal: "notify me when it's live" sign-ups (docs/INTEREST.md).
 * Counts follow the page's test/forced filters; the study rate only ever counts
 * real sessions, because test sessions never reach real people.
 */
export function InterestBlock({ stats, note, className }: InterestBlockProps) {
  const sources = (Object.keys(SOURCE_LABELS) as SignupSource[]).map((key) => ({
    key,
    label: SOURCE_LABELS[key],
    count: stats.bySource[key],
  }));
  const placements = SIGNUP_PLACEMENTS.map((key) => ({ key, label: PLACEMENT_LABELS[key], count: stats.byPlacement[key] ?? 0 }));

  return (
    <Block
      id="interest"
      className={className}
      title="Interest"
      subtitle="“Notify me when it’s live” sign-ups from the study debrief and version C. Study sign-up rate = real sessions that signed up ÷ real sessions that reached the debrief."
    >
      {note ? <Notice icon={<Info aria-hidden />}>{note}</Notice> : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="Sign-ups"
          value={formatCount(stats.total)}
          hint={stats.total > 0 ? `${formatCount(stats.uniqueEmails)} unique ${stats.uniqueEmails === 1 ? "email" : "emails"}` : "none in this slice yet"}
        />
        <Tile
          label="Open to a chat"
          value={formatCount(stats.interview)}
          hint={stats.total > 0 ? `${Math.round((100 * stats.interview) / stats.total)}% of sign-ups ticked the interview box` : "ticked the interview box"}
        />
        <Tile label="Study sign-up rate" value={ratePct(stats.study.all)} hint={rateHint(stats.study.all)} />
        <Tile label={VARIANT_SHORT_LABELS.A} value={ratePct(stats.study.A)} hint={rateHint(stats.study.A)} />
        <Tile label={VARIANT_SHORT_LABELS.B} value={ratePct(stats.study.B)} hint={rateHint(stats.study.B)} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <BarList title="By source" rows={sources} />
        <BarList title="By placement" rows={placements} />
      </div>

      <p className="text-xs text-ink-400">
        A sign-up is interest in hearing about a launch, not a promise to use or pay for it. The debrief form is identical in A and B, so a gap between the two rates is a small-sample hint about the dashboard they saw, not a result. Test sessions never count toward the rate.
      </p>
    </Block>
  );
}
