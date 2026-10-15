"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TurbulencePoint } from "@preflight/shared/types";
import { compactMinutes } from "@/components/dashboard/turbulence/format";
import { useHydrated } from "@/lib/hooks";
import { CHART, COLORS, INTENSITY, intensityForLevel } from "@/lib/theme";
import { spoken, type SeriesStyle } from "./facts";

export interface TimelineSeries {
  id: string;
  /** "DL 1423" (+ date / route when the compared flights differ in them). */
  name: string;
  /** "7:10 AM · Delta Air Lines" */
  detail: string;
  style: SeriesStyle;
  points: readonly TurbulencePoint[];
  airborneMin: number;
  /** Text alternative: the flight's bumpy stretches in words. */
  summary: string;
}

const HEIGHT = 216;
const X_AXIS_HEIGHT = 26;
/** A little headroom above "Moderate" so a peak never touches the top. */
const Y_MAX = 2.3;
const LEVEL_LABEL: Record<number, string> = { 0: "Smooth", 1: "Light", 2: "Moderate" };
const TICK_STEPS = [15, 30, 60, 90, 120, 180, 240, 300, 360, 480];
const KEYS = ["s0", "s1", "s2"] as const;

type Row = { minute: number } & Partial<Record<(typeof KEYS)[number], number>>;

/** A handful of round offsets plus the longest flight's landing minute (none crowding it on a phone-width axis). */
function chooseTicks(maxMin: number): number[] {
  const step = TICK_STEPS.find((s) => maxMin / s <= 4) ?? 480;
  const ticks: number[] = [];
  for (let m = 0; maxMin - m >= maxMin * 0.22; m += step) ticks.push(m);
  ticks.push(maxMin);
  return ticks;
}

/** One row per minute that any flight has a point for; each flight's line ends when it lands. */
function merge(series: readonly TimelineSeries[]): Row[] {
  const rows = new Map<number, Row>();
  series.forEach((s, i) => {
    const key = KEYS[i];
    if (!key) return;
    for (const p of s.points) {
      const row = rows.get(p.minute) ?? { minute: p.minute };
      row[key] = p.level;
      rows.set(p.minute, row);
    }
  });
  return [...rows.values()].sort((a, b) => a.minute - b.minute);
}

/** Short stroke in the series colour and dash — the legend mirrors the mark. */
export function LineKey({ style, className }: { style: SeriesStyle; className?: string }) {
  return (
    <svg aria-hidden width="24" height="10" viewBox="0 0 24 10" className={className}>
      <line
        x1="2"
        y1="5"
        x2="22"
        y2="5"
        stroke={style.color}
        strokeWidth={style.dash ? 2.5 : 2}
        strokeDasharray={style.dash}
        strokeLinecap="round"
      />
    </svg>
  );
}

interface TipProps {
  active?: boolean;
  label?: number | string;
  payload?: ReadonlyArray<{ dataKey?: unknown; value?: unknown }>;
  series: readonly TimelineSeries[];
}

/** One readout for every flight at the minute under the pointer: the value leads, the flight follows. */
function Tip({ active, label, payload, series }: TipProps) {
  if (!active || label === undefined) return null;
  const minute = Number(label);
  return (
    <div style={CHART.tooltip.contentStyle} className="bg-surface">
      <p className="text-[11px] font-semibold text-ink-500">{minute <= 0 ? "Takeoff" : `${compactMinutes(minute)} after takeoff`}</p>
      {series.map((s, i) => {
        const value = payload?.find((p) => p.dataKey === KEYS[i])?.value;
        const text =
          typeof value === "number" ? INTENSITY[intensityForLevel(value)].short : minute > s.airborneMin ? "Landed" : "—";
        return (
          <p key={s.id} className="mt-1 flex items-center gap-1.5 text-[12px] leading-none">
            <LineKey style={s.style} className="shrink-0" />
            <span className="font-semibold text-ink-900">{text}</span>
            <span className="text-ink-500">{s.name}</span>
          </p>
        );
      })}
    </div>
  );
}

interface PlotProps {
  data: Row[];
  series: readonly TimelineSeries[];
  maxMin: number;
  ticks: number[];
}

/** The Recharts drawing: one line per flight on a shared minutes-after-takeoff axis. */
function Plot({ data, series, maxMin, ticks }: PlotProps) {
  return (
    <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 320, height: HEIGHT }}>
      <LineChart data={data} margin={{ top: 10, right: 18, bottom: 0, left: 0 }} accessibilityLayer={false}>
        <CartesianGrid vertical={false} stroke={CHART.grid} />
        <XAxis
          dataKey="minute"
          type="number"
          domain={[0, maxMin]}
          ticks={ticks}
          interval={0}
          tickFormatter={(m: number) => (m <= 0 ? "Takeoff" : compactMinutes(m))}
          height={X_AXIS_HEIGHT}
          tickLine={false}
          axisLine={{ stroke: CHART.grid }}
          tick={CHART.tick}
          tickMargin={8}
        />
        <YAxis
          type="number"
          domain={[0, Y_MAX]}
          ticks={[0, 1, 2]}
          tickFormatter={(v: number) => LEVEL_LABEL[v] ?? ""}
          width={64}
          tickLine={false}
          axisLine={false}
          tick={CHART.tick}
        />
        <Tooltip
          content={<Tip series={series} />}
          cursor={{ stroke: COLORS.ink300, strokeWidth: 1 }}
          isAnimationActive={false}
          wrapperStyle={{ outline: "none", zIndex: 1 }}
        />
        {series.map((s, i) => (
          <Line
            key={s.id}
            type="monotone"
            dataKey={KEYS[i]}
            name={s.name}
            connectNulls
            dot={false}
            stroke={s.style.color}
            strokeWidth={s.style.dash ? 2.5 : 2}
            strokeDasharray={s.style.dash}
            strokeLinecap="round"
            strokeLinejoin="round"
            activeDot={{ r: 4, fill: s.style.color, stroke: COLORS.surface, strokeWidth: 2 }}
            animationDuration={600}
            animationEasing="ease-out"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Version C compare page: the compared flights' turbulence timelines on one
 * chart (minutes after takeoff), each with its own colour and dash pattern,
 * and a legend that also describes each timeline in words.
 */
export function TimelineChart({ series }: { series: readonly TimelineSeries[] }) {
  const hydrated = useHydrated();
  const data = useMemo(() => merge(series), [series]);
  const maxMin = Math.max(1, ...series.map((s) => s.airborneMin));
  const ticks = useMemo(() => chooseTicks(maxMin), [maxMin]);
  const names = series.map((s) => `${spoken(s.name)} (${s.style.pattern})`).join("; ");

  return (
    <figure>
      <div
        role="img"
        aria-label={`Line chart of expected turbulence by minutes after takeoff for ${names}. Each timeline is described below the chart.`}
        className="-ml-1.5 [&_svg:focus:not(:focus-visible)]:outline-none [&_svg_*:focus]:outline-none"
        style={{ height: HEIGHT }}
      >
        {hydrated ? (
          // The label above and the list below carry the chart's content; the drawing itself stays out of the tree.
          <div aria-hidden className="h-full">
            <Plot data={data} series={series} maxMin={maxMin} ticks={ticks} />
          </div>
        ) : (
          <div aria-hidden className="h-full rounded-2xl bg-canvas/60" />
        )}
      </div>
      <figcaption className="mt-3">
        <ul className="flex flex-col gap-2.5">
          {series.map((s) => (
            <li key={s.id} className="flex gap-2.5 text-[13px] leading-snug">
              <LineKey style={s.style} className="mt-[3px] shrink-0" />
              <span className="min-w-0">
                <span className="font-semibold text-ink-900">{s.name}</span>
                <span className="text-ink-500"> · {s.detail}</span>
                <span className="block text-ink-700">{s.summary}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] leading-snug text-ink-500">
          Minutes after takeoff. Each line ends when that flight lands. Forecasts are illustrative.
        </p>
      </figcaption>
    </figure>
  );
}
