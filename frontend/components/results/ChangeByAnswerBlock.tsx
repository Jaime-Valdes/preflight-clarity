"use client";

import { useMemo } from "react";
import {
  ANXIETY_STARTS,
  ANXIETY_START_LABELS,
  TRAVEL_IMPACTS,
  TRAVEL_IMPACT_LABELS,
  WORRIES,
  WORRY_LABELS,
  changeByAnswer,
  formatPct,
  formatSigned,
  hasPairedRatings,
  share,
  type ChangeByAnswer,
  type Distribution,
} from "@preflight/shared/stats";
import type { SessionRecord, TravelImpact, Variant } from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { BarRow, Block, EmptyNote, SERIES, deltaClass } from "./bits";

/** Cells below this many sessions are flagged in the note as saying little. */
const SMALL_CELL = 5;

/** Second header line under the variant letter (mirrors VARIANT_SHORT_LABELS). */
const VARIANT_HINT: Record<Variant, string> = { A: "Full", B: "Minimal" };

const COLUMNS: ReadonlyArray<{ key: "all" | Variant; label: string; hint: string }> = [
  { key: "all", label: "All", hint: "sessions" },
  { key: "A", label: "A", hint: VARIANT_HINT.A },
  { key: "B", label: "B", hint: VARIANT_HINT.B },
];

/**
 * "In the past year, has fear of flying changed your travel plans?" — multi-select
 * ("No" is exclusive), so shares are per respondent and don't add up to 100%.
 * n = sessions that picked at least one option (older records have none). Asked
 * before the dashboard since 2026-10-24, but still stored under `post`.
 */
function travelImpactDistribution(records: readonly SessionRecord[]): Distribution<TravelImpact> {
  const picks = (r: SessionRecord): TravelImpact[] => (Array.isArray(r.post.travelImpact) ? r.post.travelImpact : []);
  const respondents = records.filter((r) => picks(r).length > 0);
  const n = respondents.length;
  return {
    n,
    buckets: TRAVEL_IMPACTS.map((value) => {
      const count = respondents.filter((r) => picks(r).includes(value)).length;
      return { value, label: TRAVEL_IMPACT_LABELS[value], count, pct: share(count, n) };
    }),
  };
}

function ChangeTable<T extends string>({ title, rows, paired }: { title: string; rows: ChangeByAnswer<T>[]; paired: number }) {
  const answered = rows.reduce((sum, row) => sum + row.all.n, 0);
  const missing = Math.max(0, paired - answered);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        <span className="text-xs text-ink-400 tabular-nums">n = {answered}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-500">
        {missing > 0
          ? `${missing} ${missing === 1 ? "session" : "sessions"} with both ratings but no answer (older records) left out.`
          : "Every session with both ratings answered this."}
      </p>
      <table className="mt-2 w-full table-fixed border-collapse">
        <colgroup>
          <col />
          {COLUMNS.map((c) => (
            <col key={c.key} className="w-14 sm:w-16" />
          ))}
        </colgroup>
        <thead>
          <tr className="text-right text-[11px] font-semibold leading-tight text-ink-500">
            <td />
            {COLUMNS.map((c) => (
              <th key={c.key} scope="col" className="pb-1.5 pl-2 font-semibold">
                {c.label}
                <span className="block font-medium text-ink-400">{c.hint}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const muted = row.all.n === 0;
            return (
              <tr key={row.answer} className="border-t border-line/60">
                <th
                  scope="row"
                  className={cn("py-2 pr-2 text-left text-[13px] font-medium leading-snug", muted ? "text-ink-400" : "text-ink-700")}
                >
                  {row.label}
                </th>
                {COLUMNS.map((c) => {
                  const cell = row[c.key];
                  return (
                    <td key={c.key} className="py-2 pl-2 text-right align-top leading-tight tabular-nums">
                      <span className={cn("block text-sm font-semibold", cell.n === 0 ? "text-ink-400" : deltaClass(cell.meanChange))}>
                        {formatSigned(cell.meanChange)}
                      </span>
                      <span className="block text-[11px] text-ink-400">n = {cell.n}</span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TravelList({ data }: { data: Distribution<TravelImpact> }) {
  const scale = Math.max(0.25, ...data.buckets.map((b) => b.pct ?? 0));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-900">Fear of flying changed their travel plans…</h3>
        <span className="text-xs text-ink-400 tabular-nums">n = {data.n}</span>
      </div>
      <p className="mt-0.5 text-xs text-ink-500">Past year; asked before the dashboard since 2026-10-24 (after it until then). Multi-select: shares are per respondent and don’t add up to 100%.</p>
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

/**
 * Mean anxiety change split by two pre-survey answers (what worries them most,
 * when the anxiety starts), overall and per variant, plus the travel-plans
 * question. Every option is listed; empty cells show "—".
 */
export function ChangeByAnswerBlock({ records, className }: { records: SessionRecord[]; className?: string }) {
  const paired = useMemo(() => records.filter((r) => hasPairedRatings(r, "anxiety")).length, [records]);
  const byWorry = useMemo(() => changeByAnswer(records, "anxiety", WORRIES, WORRY_LABELS, (r) => r.pre.worriesMost), [records]);
  const byStart = useMemo(
    () => changeByAnswer(records, "anxiety", ANXIETY_STARTS, ANXIETY_START_LABELS, (r) => r.pre.anxietyStarts),
    [records],
  );
  const travel = useMemo(() => travelImpactDistribution(records), [records]);

  return (
    <Block
      id="change-by"
      className={className}
      title="Anxiety change by …"
      subtitle="Mean anxiety change (post − pre on the 0–10 scale) for the sessions that gave each answer, overall and per variant. Negative = anxiety dropped."
    >
      {records.length === 0 ? (
        <EmptyNote>No sessions match these filters yet.</EmptyNote>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ChangeTable title="By what worries them most" rows={byWorry} paired={paired} />
          <ChangeTable title="By when the anxiety starts" rows={byStart} paired={paired} />
          <TravelList data={travel} />
        </div>
      )}
      <p className="text-xs leading-snug text-ink-500">
        Directional only — cells with fewer than {SMALL_CELL} sessions say little. n counts sessions with both anxiety ratings and that
        answer; self-reported, no significance testing.
      </p>
    </Block>
  );
}
