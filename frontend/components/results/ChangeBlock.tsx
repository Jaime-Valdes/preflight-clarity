"use client";

import { useMemo } from "react";
import {
  MEASURES,
  MEASURE_LABELS,
  VARIANT_SHORT_LABELS,
  changeBreakdown,
  formatPct,
  type ChangeBreakdown,
  type ChangeReport,
  type Measure,
} from "@preflight/shared/stats";
import type { SessionRecord } from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { Block, Legend, SERIES } from "./bits";

/** The direction the hypothesis predicts for each measure (brief: anxiety ↓, control ↑, predictability ↑). */
const PREDICTED: Record<Measure, "dropped" | "rose"> = {
  anxiety: "dropped",
  control: "rose",
  predictability: "rose",
};

const PREDICTED_LABEL: Record<"dropped" | "rose", string> = { dropped: "drop predicted", rose: "rise predicted" };

const LEGEND = [
  { color: SERIES.better, label: "Moved as the hypothesis predicts" },
  { color: SERIES.same, label: "Stayed the same" },
  { color: SERIES.worse, label: "Moved against it" },
];

/** Minimum share for a percentage label to fit inside its segment. */
const LABEL_MIN = 0.13;

function StackedBar({ data }: { data: ChangeBreakdown }) {
  if (data.n === 0) {
    return (
      <div className="flex h-8 items-center justify-center rounded-xl bg-canvas text-xs text-ink-400 ring-1 ring-inset ring-line/60">
        No paired answers
      </div>
    );
  }
  const predicted = PREDICTED[data.measure];
  const colorFor = (key: "dropped" | "same" | "rose") =>
    key === "same" ? SERIES.same : key === predicted ? SERIES.better : SERIES.worse;
  const all = {
    dropped: { key: "dropped" as const, label: "Dropped", count: data.dropped, pct: data.droppedPct ?? 0 },
    same: { key: "same" as const, label: "Stayed the same", count: data.same, pct: data.samePct ?? 0 },
    rose: { key: "rose" as const, label: "Rose", count: data.rose, pct: data.rosePct ?? 0 },
  };
  const against = predicted === "dropped" ? "rose" : "dropped";
  // Predicted → same → against, so the teal share always starts at the left edge.
  const segments = [all[predicted], all.same, all[against]]
    .filter((s) => s.count > 0)
    .map((s) => ({ ...s, color: colorFor(s.key) }));

  return (
    <div
      role="img"
      aria-label={segments.map((s) => `${s.label} ${s.count} of ${data.n} (${formatPct(s.pct)})`).join(", ")}
      className="flex h-8 w-full gap-0.5 overflow-hidden rounded-xl"
    >
      {segments.map((s) => (
        <div
          key={s.key}
          title={`${s.label}: ${s.count} of ${data.n} (${formatPct(s.pct)})`}
          style={{ width: `${s.pct * 100}%`, background: s.color }}
          className="flex min-w-[3px] items-center justify-center text-xs font-semibold text-ink-900"
        >
          {s.pct >= LABEL_MIN ? formatPct(s.pct) : null}
        </div>
      ))}
    </div>
  );
}

function MeasureRows({ report, emphasis }: { report: ChangeReport; emphasis: boolean }) {
  const rows = [
    { key: "all", label: "All sessions", data: report.overall },
    { key: "A", label: VARIANT_SHORT_LABELS.A, data: report.byVariant.A },
    { key: "B", label: VARIANT_SHORT_LABELS.B, data: report.byVariant.B },
  ];
  return (
    <section className="flex flex-col gap-2">
      <h3 className={cn("font-bold text-ink-900", emphasis ? "text-sm" : "text-[13px]")}>
        {MEASURE_LABELS[report.measure]}
        <span className="font-medium text-ink-500"> · {PREDICTED_LABEL[PREDICTED[report.measure]]}</span>
      </h3>
      {rows.map((row) => (
        <div key={row.key} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 sm:grid-cols-[8rem_1fr]">
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-ink-700">{row.label}</div>
            <div className="text-[11px] text-ink-400 tabular-nums">n = {row.data.n}</div>
          </div>
          <StackedBar data={row.data} />
        </div>
      ))}
    </section>
  );
}

/** Dropped / same / rose shares as 100% stacked bars, overall and per variant — anxiety first. */
export function ChangeBlock({ records, className }: { records: SessionRecord[]; className?: string }) {
  const reports = useMemo(() => MEASURES.map((m) => changeBreakdown(records, m)), [records]);
  const [anxiety, ...others] = reports;

  return (
    <Block
      id="change"
      className={className}
      title="Anxiety change"
      subtitle="Share of sessions whose post-survey rating was lower, equal or higher than their pre-survey rating. Control and predictability below, for comparison."
      aside={<Legend items={LEGEND} />}
    >
      <MeasureRows report={anxiety} emphasis />
      <div className="flex flex-col gap-4 border-t border-line/70 pt-4">
        {others.map((report) => (
          <MeasureRows key={report.measure} report={report} emphasis={false} />
        ))}
      </div>
      <p className="text-xs leading-snug text-ink-500">n counts sessions with both the pre and the post answer.</p>
    </Block>
  );
}
