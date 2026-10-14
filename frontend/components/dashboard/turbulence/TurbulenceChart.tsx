"use client";

import { useId, useMemo, useRef } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BumpWindow, PhaseForecast, TurbulencePoint } from "@preflight/shared/types";
import { useHydrated } from "@/lib/hooks";
import { CHART, COLORS, INTENSITY, PHASE_LABEL, intensityForLevel } from "@/lib/theme";
import { useTracker } from "@/lib/tracking";
import { compactMinutes, pointMoment } from "./format";

interface TurbulenceChartProps {
  points: TurbulencePoint[];
  phases: PhaseForecast[];
  windows: BumpWindow[];
  airborneMin: number;
}

const HEIGHT = 190;
const X_AXIS_HEIGHT = 26;
const MARGIN = { top: 8, right: 26, bottom: 0, left: 0 } as const;
/** A little headroom above "Moderate" so a peak never touches the phase labels. */
const Y_MAX = 2.3;
const PLOT_TOP = MARGIN.top;
const PLOT_BOTTOM = HEIGHT - MARGIN.bottom - X_AXIS_HEIGHT;
/** chart_inspect is logged at most this often while the participant explores the chart. */
const INSPECT_EVERY_MS = 4000;
/** Phase bands narrower than this share of the flight get no label (the axis names takeoff/landing). */
const MIN_LABELLED_BAND = 0.1;

const LEVEL_LABEL: Record<number, string> = { 0: "Smooth", 1: "Light", 2: "Moderate" };
const TICK_STEPS = [5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 300, 360, 480];

/** Friendly x ticks: a handful of round offsets plus the landing minute. */
function chooseTicks(airborneMin: number): number[] {
  const step = TICK_STEPS.find((s) => airborneMin / s <= 4.5) ?? 480;
  const ticks: number[] = [];
  for (let m = 0; m < airborneMin; m += step) {
    // Skip a tick that would collide with the "Landing" label.
    if (airborneMin - m < airborneMin * 0.18) break;
    ticks.push(m);
  }
  ticks.push(airborneMin);
  return ticks;
}

/** Vertical position (0–100%) of a turbulence level inside the plot, for the gradients. */
function stopFor(level: number): string {
  return `${Math.round(((Y_MAX - level) / Y_MAX) * 1000) / 10}%`;
}

/** Points per chart width that still draw as a calm line rather than a dense zigzag. */
const MAX_DISPLAY_POINTS = 72;
/** Levels at or above this (and their neighbours) are always kept, so bumps keep their exact shape. */
const KEEP_LEVEL = 0.45;

/**
 * Long flights have hundreds of 5-minute points; thin out the smooth stretches
 * for display, keeping the first/last points and every point in or next to a bump.
 */
function decimate(points: TurbulencePoint[]): TurbulencePoint[] {
  if (points.length <= MAX_DISPLAY_POINTS) return points;
  const step = Math.ceil(points.length / MAX_DISPLAY_POINTS);
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1 || i % step === 0) return true;
    if (p.level >= KEEP_LEVEL) return true;
    const prev = points[i - 1];
    const next = points[i + 1];
    return (prev !== undefined && prev.level >= KEEP_LEVEL) || (next !== undefined && next.level >= KEEP_LEVEL);
  });
}

interface TipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: TurbulencePoint }>;
  airborneMin: number;
}

function ChartTip({ active, payload, airborneMin }: TipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const band = INTENSITY[intensityForLevel(point.level)];
  return (
    <div role="status" style={CHART.tooltip.contentStyle} className="bg-surface">
      <p className="text-[11px] font-semibold text-ink-500">{pointMoment(point.minute, airborneMin)}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink-900">
        <span aria-hidden className="size-2 rounded-full" style={{ background: band.color }} />
        {band.label}
        <span className="font-medium text-ink-400">· {PHASE_LABEL[point.phase]}</span>
      </p>
    </div>
  );
}

/**
 * Expected intensity over the flight: a soft area whose colour follows the
 * level (calm → breeze → sand), phase bands behind it and bump windows tinted.
 * Client-only: renders a quiet placeholder until hydrated.
 */
export function TurbulenceChart({ points, phases, windows, airborneMin }: TurbulenceChartProps) {
  const hydrated = useHydrated();
  const tracker = useTracker();
  // useId can contain punctuation that is awkward inside url(#…); keep it alphanumeric.
  const rawId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fillId = `turb-fill-${rawId}`;
  const strokeId = `turb-stroke-${rawId}`;
  const lastInspect = useRef(Number.NEGATIVE_INFINITY);
  const ticks = useMemo(() => chooseTicks(airborneMin), [airborneMin]);
  const data = useMemo(() => decimate(points), [points]);
  const description =
    phases.map((p) => `${PHASE_LABEL[p.phase]}: ${INTENSITY[p.intensity].label}`).join(". ") +
    ". Full details are listed below the chart.";

  const inspect = (state: { activeLabel?: string | number }) => {
    if (!tracker) return;
    const now = performance.now();
    if (now - lastInspect.current < INSPECT_EVERY_MS) return;
    lastInspect.current = now;
    const detail = state.activeLabel === undefined ? undefined : `min ${state.activeLabel}`;
    tracker.event("chart_inspect", "turbulence", detail);
  };

  if (!hydrated) {
    return <div aria-hidden className="mt-2 rounded-2xl bg-canvas/60" style={{ height: HEIGHT }} />;
  }

  return (
    <div
      // Chromium draws its own blue focus ring on the chart's inner <g> after a tap; keyboard focus keeps the global ring.
      className="mt-2 -ml-1.5 [&_svg:focus:not(:focus-visible)]:outline-none [&_svg_*:focus]:outline-none"
      style={{ height: HEIGHT }}
    >
      <ResponsiveContainer width="100%" height={HEIGHT} initialDimension={{ width: 320, height: HEIGHT }}>
        <AreaChart
          data={data}
          margin={MARGIN}
          title="Expected turbulence by time into the flight"
          desc={description}
          onMouseMove={inspect}
          onTouchStart={inspect}
          onTouchMove={inspect}
          onClick={inspect}
        >
          <defs>
            <linearGradient id={fillId} gradientUnits="userSpaceOnUse" x1={0} y1={PLOT_TOP} x2={0} y2={PLOT_BOTTOM}>
              <stop offset={stopFor(2)} stopColor={COLORS.sand300} stopOpacity={0.6} />
              <stop offset={stopFor(1.1)} stopColor={COLORS.breeze300} stopOpacity={0.5} />
              <stop offset={stopFor(0.45)} stopColor={COLORS.calm300} stopOpacity={0.42} />
              <stop offset="100%" stopColor={COLORS.calm300} stopOpacity={0.28} />
            </linearGradient>
            <linearGradient id={strokeId} gradientUnits="userSpaceOnUse" x1={0} y1={PLOT_TOP} x2={0} y2={PLOT_BOTTOM}>
              <stop offset={stopFor(2)} stopColor={COLORS.sand400} />
              <stop offset={stopFor(1.1)} stopColor={COLORS.breeze500} />
              <stop offset={stopFor(0.45)} stopColor={COLORS.calm500} />
              <stop offset="100%" stopColor={COLORS.calm500} />
            </linearGradient>
          </defs>

          {phases.map((p, i) => {
            const share = (p.endMin - p.startMin) / Math.max(1, airborneMin);
            const labelled = share >= MIN_LABELLED_BAND && p.phase !== "takeoff" && p.phase !== "landing";
            return (
              <ReferenceArea
                key={p.phase}
                x1={p.startMin}
                x2={p.endMin}
                y1={0}
                y2={Y_MAX}
                fill={i % 2 === 1 ? COLORS.canvas : COLORS.surface}
                fillOpacity={i % 2 === 1 ? 0.8 : 0}
                stroke="none"
                ifOverflow="visible"
                label={
                  labelled
                    ? { value: PHASE_LABEL[p.phase], position: "insideTop", fill: COLORS.ink400, fontSize: 10, fontWeight: 600 }
                    : undefined
                }
              />
            );
          })}

          {windows.map((w) => (
            <ReferenceArea
              key={`${w.phase}-${w.startMin}`}
              x1={w.startMin}
              x2={Math.min(airborneMin, w.startMin + w.durationMin)}
              y1={0}
              y2={Y_MAX}
              fill={INTENSITY[w.intensity].color}
              fillOpacity={0.22}
              stroke="none"
              ifOverflow="visible"
            />
          ))}

          <CartesianGrid vertical={false} stroke={CHART.grid} />

          <XAxis
            dataKey="minute"
            type="number"
            domain={[0, airborneMin]}
            ticks={ticks}
            interval={0}
            tickFormatter={(m: number) => (m <= 0 ? "Takeoff" : m >= airborneMin ? "Landing" : compactMinutes(m))}
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
            width={60}
            tickLine={false}
            axisLine={false}
            tick={CHART.tick}
          />

          <Tooltip
            content={<ChartTip airborneMin={airborneMin} />}
            cursor={{ stroke: COLORS.ink300, strokeWidth: 1 }}
            isAnimationActive={false}
            wrapperStyle={{ outline: "none", zIndex: 1 }}
          />

          <Area
            type="monotone"
            dataKey="level"
            baseValue={0}
            stroke={`url(#${strokeId})`}
            strokeWidth={2}
            fill={`url(#${fillId})`}
            activeDot={{ r: 5, fill: COLORS.calm500, stroke: COLORS.surface, strokeWidth: 2 }}
            animationDuration={700}
            animationEasing="ease-out"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
