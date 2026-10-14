"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from "recharts";
import {
  MEASURE_LABELS,
  VARIANT_LABELS,
  formatNumber,
  formatSigned,
  type MeasureReport,
  type MeasureSummary,
} from "@preflight/shared/stats";
import type { Variant } from "@preflight/shared/types";
import { CHART, COLORS } from "@/lib/theme";
import { Block, EmptyNote, Legend, SERIES } from "./bits";

interface PanelDatum {
  measure: string;
  pre: number | null;
  post: number | null;
}

const LEGEND = [
  { color: SERIES.pre, label: "Pre-survey" },
  { color: SERIES.post, label: "Post-survey" },
];

function labelText(value: unknown): string {
  return typeof value === "number" ? value.toFixed(1) : "";
}

function PrePostTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-2xl bg-surface px-3 py-2 text-xs shadow-lift ring-1 ring-line">
      <div className="font-semibold text-ink-500">{label}</div>
      {payload.map((entry) => (
        <div key={String(entry.name)} className="mt-1 flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: entry.color }} />
          <span className="text-ink-500">{entry.name}</span>
          <span className="ml-auto pl-3 font-bold text-ink-900 tabular-nums">
            {formatNumber(typeof entry.value === "number" ? entry.value : null)}
          </span>
        </div>
      ))}
    </div>
  );
}

function Panel({ title, summaries }: { title: string; summaries: MeasureSummary[] }) {
  const data: PanelDatum[] = summaries.map((s) => ({
    measure: MEASURE_LABELS[s.measure],
    pre: s.meanPre,
    post: s.meanPost,
  }));
  const ns = summaries.map((s) => s.n);
  const sameN = ns.every((n) => n === ns[0]);
  const hasData = ns.some((n) => n > 0);

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-ink-900">{title}</h3>
        <span className="text-xs text-ink-400 tabular-nums">{sameN ? `n = ${ns[0]}` : `n = ${ns.join(" / ")}`}</span>
      </div>
      <div className="mt-2 h-[200px]">
        {hasData ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={3} barCategoryGap="30%" margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="measure" tickLine={false} axisLine={false} tick={CHART.tick} interval={0} />
              <YAxis domain={[0, 10]} ticks={[0, 5, 10]} width={24} tickLine={false} axisLine={false} tick={CHART.tick} />
              <Tooltip cursor={{ fill: COLORS.canvas }} content={PrePostTooltip} />
              <Bar dataKey="pre" name="Pre-survey" fill={SERIES.pre} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                <LabelList dataKey="pre" position="top" formatter={labelText} fill={COLORS.ink500} fontSize={11} />
              </Bar>
              <Bar dataKey="post" name="Post-survey" fill={SERIES.post} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
                <LabelList dataKey="post" position="top" formatter={labelText} fill={COLORS.ink700} fontSize={11} fontWeight={700} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyNote className="flex h-full items-center justify-center">No paired answers yet.</EmptyNote>
        )}
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-1.5 sm:gap-2">
        {summaries.map((s) => (
          <div key={s.measure} className="min-w-0 rounded-2xl bg-canvas/70 px-2.5 py-2 ring-1 ring-inset ring-line/70 sm:px-3">
            <dt className="truncate text-[11px] font-semibold text-ink-500">{MEASURE_LABELS[s.measure]}</dt>
            <dd className="mt-0.5 text-base font-bold leading-tight text-ink-900 tabular-nums">{formatSigned(s.meanChange)}</dd>
            <dd className="text-[11px] text-ink-500">mean change{sameN ? "" : ` · n = ${s.n}`}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

const VARIANTS: Variant[] = ["A", "B"];

/** Grouped pre/post bars per measure: all sessions plus one small multiple per variant. */
export function PrePostBlock({ reports, className }: { reports: MeasureReport[]; className?: string }) {
  return (
    <Block
      id="prepost"
      className={className}
      title="Pre vs. post"
      subtitle="Mean 0–10 ratings before and after the dashboard, for sessions that answered both. Differences are directional only — small samples, no significance testing."
      aside={<Legend items={LEGEND} />}
    >
      <div className="grid gap-6 md:grid-cols-3 md:gap-5">
        <Panel title="All sessions" summaries={reports.map((r) => r.overall)} />
        {VARIANTS.map((v) => (
          <Panel key={v} title={VARIANT_LABELS[v]} summaries={reports.map((r) => r.byVariant[v])} />
        ))}
      </div>
    </Block>
  );
}
