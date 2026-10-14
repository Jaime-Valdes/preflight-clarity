"use client";

import { useId, useMemo } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TurbulencePoint } from "@preflight/shared/types";
import { useHydrated } from "@/lib/hooks";
import { CHART, COLORS, INTENSITY, intensityForLevel } from "@/lib/theme";
import { compactMinutes } from "../turbulence/format";

export interface CompareSeries {
  /** "Your flight", "Option 2"… */
  label: string;
  points: TurbulencePoint[];
  airborneMin: number;
}

interface CompareChartProps {
  a: CompareSeries;
  b: CompareSeries;
}

/** Series colours: A is calm (sea-glass), B is breeze (sky). */
export const SERIES_COLOR = { a: COLORS.calm500, b: COLORS.breeze500 } as const;
const SERIES_FILL = { a: COLORS.calm300, b: COLORS.breeze300 } as const;

const HEIGHT = 200;
const Y_MAX = 2.3;
const LEVEL_LABEL: Record<number, string> = { 0: "Smooth", 1: "Light", 2: "Moderate" };
const TICK_STEPS = [15, 30, 60, 90, 120, 180, 240, 300, 360, 480];

interface Row {
  minute: number;
  a?: number;
  b?: number;
}

function chooseTicks(maxMin: number): number[] {
  const step = TICK_STEPS.find((s) => maxMin / s <= 4) ?? 480;
  const ticks: number[] = [];
  for (let m = 0; m <= maxMin - step * 0.5; m += step) ticks.push(m);
  ticks.push(maxMin);
  return ticks;
}

function merge(a: TurbulencePoint[], b: TurbulencePoint[]): Row[] {
  const rows = new Map<number, Row>();
  for (const p of a) rows.set(p.minute, { ...(rows.get(p.minute) ?? { minute: p.minute }), a: p.level });
  for (const p of b) rows.set(p.minute, { ...(rows.get(p.minute) ?? { minute: p.minute }), b: p.level });
  return [...rows.values()].sort((x, y) => x.minute - y.minute);
}

interface TipProps {
  active?: boolean;
  label?: number | string;
  payload?: ReadonlyArray<{ dataKey?: string | number; value?: number }>;
  names: { a: string; b: string };
}

function Tip({ active, label, payload, names }: TipProps) {
  if (!active || !payload?.length) return null;
  const minute = Number(label);
  return (
    <div style={CHART.tooltip.contentStyle} className="bg-surface">
      <p className="text-[11px] font-semibold text-ink-500">
        {minute <= 0 ? "Takeoff" : `${compactMinutes(minute)} after takeoff`}
      </p>
      {(["a", "b"] as const).map((key) => {
        const item = payload.find((p) => p.dataKey === key);
        if (!item || typeof item.value !== "number") return null;
        return (
          <p key={key} className="mt-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-ink-900">
            <span aria-hidden className="size-2 rounded-full" style={{ background: SERIES_COLOR[key] }} />
            <span className="text-ink-500">{names[key]}</span>
            {INTENSITY[intensityForLevel(item.value)].short}
          </p>
        );
      })}
    </div>
  );
}

/**
 * Two turbulence timelines on one chart: x = minutes after takeoff (up to the
 * longer flight), y = Smooth / Light / Moderate. A in calm, B in breeze.
 */
export function CompareChart({ a, b }: CompareChartProps) {
  const hydrated = useHydrated();
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const data = useMemo(() => merge(a.points, b.points), [a.points, b.points]);
  const maxMin = Math.max(a.airborneMin, b.airborneMin, 1);
  const ticks = useMemo(() => chooseTicks(maxMin), [maxMin]);
  const names = { a: a.label, b: b.label };

  if (!hydrated) return <div aria-hidden className="rounded-2xl bg-canvas/60" style={{ height: HEIGHT }} />;

  return (
    <div className="-ml-1.5 [&_svg:focus:not(:focus-visible)]:outline-none [&_svg_*:focus]:outline-none" style={{ height: HEIGHT }}>
      <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 320, height: HEIGHT }}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 26, bottom: 0, left: 0 }}
          title={`Expected turbulence over time: ${a.label} and ${b.label}`}
          desc="Both timelines start at takeoff. The side-by-side numbers below the chart give the same comparison."
        >
          <defs>
            {(["a", "b"] as const).map((key) => (
              <linearGradient key={key} id={`cmp-${key}-${rawId}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_FILL[key]} stopOpacity={0.45} />
                <stop offset="100%" stopColor={SERIES_FILL[key]} stopOpacity={0.05} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis
            dataKey="minute"
            type="number"
            domain={[0, maxMin]}
            ticks={ticks}
            interval={0}
            tickFormatter={(m: number) => (m <= 0 ? "Takeoff" : compactMinutes(m))}
            height={26}
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
            width={60}
            tickLine={false}
            axisLine={false}
            tick={CHART.tick}
          />
          <Tooltip
            content={<Tip names={names} />}
            cursor={{ stroke: COLORS.ink300, strokeWidth: 1 }}
            isAnimationActive={false}
            wrapperStyle={{ outline: "none", zIndex: 1 }}
          />
          {(["a", "b"] as const).map((key) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              connectNulls
              baseValue={0}
              stroke={SERIES_COLOR[key]}
              strokeWidth={2}
              strokeDasharray={key === "b" ? "6 3" : undefined}
              fill={`url(#cmp-${key}-${rawId})`}
              activeDot={{ r: 4, fill: SERIES_COLOR[key], stroke: COLORS.surface, strokeWidth: 2 }}
              animationDuration={600}
              animationEasing="ease-out"
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
