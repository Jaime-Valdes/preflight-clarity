"use client";

import { Info } from "lucide-react";
import { useMemo } from "react";
import { SIGNUP_PLACEMENTS, type SignupRate, type SignupStats } from "@preflight/shared/signup";
import {
  VARIANT_SHORT_LABELS,
  formatCount,
  signupRateBySection,
  type SectionSignupRate,
  type SignupCell,
} from "@preflight/shared/stats";
import type { SessionRecord, SignupPlacement, SignupSource } from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { BarRow, Block, EmptyNote, Notice, SERIES, Tile } from "./bits";

export const SOURCE_LABELS: Record<SignupSource, string> = { study: "Study", c: "Version C", d: "Version D" };

export const PLACEMENT_LABELS: Record<SignupPlacement, string> = {
  debrief: "Study · debrief",
  dashboard: "Study · briefing",
  c_home: "C · home",
  c_results: "C · results",
  c_flight: "C · flight",
  c_compare: "C · compare",
  d_home: "D · home",
  d_results: "D · results",
  d_flight: "D · flight",
  d_compare: "D · compare",
};

/** Cells below this many sessions are flagged in the note as saying little. */
const SMALL_CELL = 5;

/** "25%" or "—" (nobody reached the debrief). */
function ratePct(rate: SignupRate): string {
  return rate.pct === null ? "—" : `${rate.pct}%`;
}

/** "12 of 48 who reached the debrief", or why there is no rate yet. */
function rateHint(rate: SignupRate): string {
  if (rate.sawForm === 0) return "Nobody has seen the sign-up form yet";
  return `${formatCount(rate.signups)} of ${formatCount(rate.sawForm)} who saw the sign-up form`;
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

/** One cross-tab cell: the rate on top, "sign-ups of sessions" under it. */
function SectionCell({ cell }: { cell: SignupCell }) {
  const empty = cell.n === 0;
  return (
    <td className="py-2 pl-2 text-right align-top leading-tight tabular-nums">
      <span className={cn("block text-sm font-semibold", empty || cell.n < SMALL_CELL ? "text-ink-400" : "text-ink-900")}>
        {cell.pct === null ? "—" : `${cell.pct}%`}
      </span>
      <span className="block text-[11px] text-ink-400">
        {empty ? "no sessions" : `${formatCount(cell.signups)} of ${formatCount(cell.n)}`}
      </span>
    </td>
  );
}

/**
 * Sign-up rate among the real completed sessions that opened each section vs.
 * those shown it but never opened it. A per-session view PostHog can't give
 * (it has no session ids), and a cross-tab, not a cause.
 */
function SectionTable({ rows }: { rows: SectionSignupRate[] }) {
  const shown = rows.filter((row) => row.opened.n + row.notOpened.n > 0);
  const sessions = shown.reduce((m, row) => Math.max(m, row.opened.n + row.notOpened.n), 0);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-900">Sign-ups by section opened</h3>
        <span className="shrink-0 text-xs text-ink-400 tabular-nums">n = {sessions}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-500">
        Real completed sessions that were shown the section: sign-up rate among those who opened it vs. those who didn’t.
      </p>
      {shown.length === 0 ? (
        <EmptyNote className="mt-3">No real completed sessions with a dashboard yet.</EmptyNote>
      ) : (
        <table className="mt-2 w-full table-fixed border-collapse">
          <colgroup>
            <col />
            <col className="w-20 sm:w-24" />
            <col className="w-20 sm:w-24" />
          </colgroup>
          <thead>
            <tr className="text-right text-[11px] font-semibold leading-tight text-ink-500">
              <td />
              <th scope="col" className="pb-1.5 pl-2 font-semibold">
                Opened it
                <span className="block font-medium text-ink-400">signed up</span>
              </th>
              <th scope="col" className="pb-1.5 pl-2 font-semibold">
                Didn’t open
                <span className="block font-medium text-ink-400">signed up</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.section} className="border-t border-line/60">
                <th scope="row" className="py-2 pr-2 text-left text-[13px] font-medium leading-snug text-ink-700">
                  <span className="block truncate" title={row.label}>
                    {row.label}
                  </span>
                </th>
                <SectionCell cell={row.opened} />
                <SectionCell cell={row.notOpened} />
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface InterestBlockProps {
  stats: SignupStats;
  /** Sessions behind the section cross-tab (test/forced filters applied; the helper keeps real completed ones). */
  records: SessionRecord[];
  /** Why the sign-ups may be incomplete (e.g. the backend has no sign-ups endpoint yet). */
  note?: string;
  className?: string;
}

/**
 * The business signal: "notify me when it's live" sign-ups (docs/INTEREST.md).
 * Counts follow the page's test/forced filters; the study rate and the section
 * cross-tab only ever count real sessions, because test sessions never reach
 * real people.
 */
export function InterestBlock({ stats, records, note, className }: InterestBlockProps) {
  const sources = (Object.keys(SOURCE_LABELS) as SignupSource[]).map((key) => ({
    key,
    label: SOURCE_LABELS[key],
    count: stats.bySource[key],
  }));
  const placements = SIGNUP_PLACEMENTS.map((key) => ({ key, label: PLACEMENT_LABELS[key], count: stats.byPlacement[key] ?? 0 }));
  const bySection = useMemo(() => signupRateBySection(records), [records]);

  return (
    <Block
      id="interest"
      className={className}
      title="Interest"
      subtitle="“Notify me when it’s live” sign-ups from the study (the card at the end of the briefing, and the debrief) and version C. Study sign-up rate = real sessions that signed up ÷ real sessions that saw the sign-up form (the card at the end of the briefing, or the debrief)."
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

      {/* The cross-tab gets the widest column so section titles don't truncate on a laptop. */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr_1.5fr]">
        <BarList title="By source" rows={sources} />
        <BarList title="By placement" rows={placements} />
        <SectionTable rows={bySection} />
      </div>

      <p className="text-xs text-ink-400">
        A sign-up is interest in hearing about a launch, not a promise to use or pay for it. The form is identical in A and B, so a gap between the two rates is a small-sample hint about the dashboard they saw, not a result. The section cross-tab is per session (a session counts as signed up when its record says so), its cells are small, and opening a section and signing up can both come from the same interest — it says what went together, not what caused what. Cells under {SMALL_CELL} sessions are greyed. Test sessions never count toward the rate or the cross-tab.
      </p>
    </Block>
  );
}
