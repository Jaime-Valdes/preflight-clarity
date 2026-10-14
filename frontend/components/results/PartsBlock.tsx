"use client";

import { formatPct, type PartFeedback } from "@preflight/shared/stats";
import { Block, EmptyNote, SERIES } from "./bits";

function Value({ count, pct }: { count: number; pct: number | null }) {
  return (
    <span className="whitespace-nowrap text-xs text-ink-900 tabular-nums">
      <span className="font-semibold">{count}</span>
      <span className="text-ink-500"> · {formatPct(pct)}</span>
    </span>
  );
}

function Label({ row }: { row: PartFeedback }) {
  return (
    <div className="min-w-0 leading-tight">
      <span className="block truncate text-sm text-ink-700" title={row.label}>{row.label}</span>
      <span className="block text-[11px] text-ink-400">{row.saw} saw it</span>
    </div>
  );
}

/** One part: "more anxious" grows left from the centre axis, "felt better" grows right. */
function DivergingRow({ row, scale }: { row: PartFeedback; scale: number }) {
  const half = (pct: number | null) => (pct === null ? 0 : Math.min(1, pct / scale) * 50);
  const description = `${row.label}: ${row.better} of ${row.saw} felt better (${formatPct(row.betterPct)}), ${row.worse} more anxious (${formatPct(row.worsePct)})`;
  return (
    <div className="py-2">
      <div className="mb-1.5 sm:hidden">
        <Label row={row} />
      </div>
      <div className="grid grid-cols-[4rem_1fr_4rem] items-center gap-2 sm:grid-cols-[minmax(0,13rem)_4rem_1fr_4rem] sm:gap-3">
        <div className="hidden sm:block">
          <Label row={row} />
        </div>
        <div className="text-right">
          <Value count={row.worse} pct={row.worsePct} />
        </div>
        <div
          role="img"
          aria-label={description}
          title={description}
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line/60"
        >
          <div aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-line-strong" />
          <div
            aria-hidden
            className="absolute inset-y-0 right-1/2 rounded-l-full"
            style={{ width: `${half(row.worsePct)}%`, background: SERIES.worse }}
          />
          <div
            aria-hidden
            className="absolute inset-y-0 left-1/2 rounded-r-full"
            style={{ width: `${half(row.betterPct)}%`, background: SERIES.better }}
          />
        </div>
        <div className="text-left">
          <Value count={row.better} pct={row.betterPct} />
        </div>
      </div>
    </div>
  );
}

/** Calming vs. anxiety-inducing mentions per dashboard part, as a share of participants who saw that part. */
export function PartsBlock({ feedback, className }: { feedback: PartFeedback[]; className?: string }) {
  const parts = feedback.filter((f) => f.part !== "none");
  const none = feedback.find((f) => f.part === "none");
  const respondents = none?.saw ?? 0;
  const scale = Math.max(0.25, ...parts.flatMap((f) => [f.betterPct ?? 0, f.worsePct ?? 0]));

  return (
    <Block
      id="parts"
      className={className}
      title="What helped vs. what made it worse"
      subtitle="Post-survey picks per dashboard part. Percentages are of the participants who actually saw that part, so variant B's single section is comparable."
      aside={
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES.worse }} />
            More anxious ◂
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: SERIES.better }} />
            ▸ Felt better
          </li>
        </ul>
      }
    >
      {respondents === 0 ? (
        <EmptyNote>No post-survey answers yet.</EmptyNote>
      ) : (
        <>
          <div className="divide-y divide-line/60">
            {parts.map((row) => (
              <DivergingRow key={row.part} row={row} scale={scale} />
            ))}
          </div>
          {none ? (
            <div className="rounded-2xl bg-canvas/70 px-4 py-3 text-sm leading-relaxed text-ink-700 ring-1 ring-inset ring-line/70">
              <span className="font-semibold text-ink-900">{none.worse} of {none.saw}</span> said nothing made them more
              anxious ({formatPct(none.worsePct)}) · <span className="font-semibold text-ink-900">{none.better}</span> said
              nothing made them feel better ({formatPct(none.betterPct)}).
            </div>
          ) : null}
        </>
      )}
    </Block>
  );
}
