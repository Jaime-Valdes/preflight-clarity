"use client";

import { Armchair, CircleCheck, Clock3, Info, Waves } from "lucide-react";
import type { ReactNode } from "react";
import { formatOffset } from "@preflight/shared/dates";
import { availabilityFor } from "@preflight/shared/forecast";
import type { BumpWindow, Flight, ForecastStatus, PhaseForecast, RouteHistory, SectionContext, SectionProps } from "@preflight/shared/types";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { INTENSITY, PHASE_LABEL, TONE_CLASSES } from "@/lib/theme";
import { ForecastMarker } from "./turbulence/ForecastMarker";
import { TurbulenceChart } from "./turbulence/TurbulenceChart";
import {
  historyBasis,
  rangeLabel,
  turbulenceForecastFrom,
  typicalBumpyPhaseLine,
  windowMoment,
} from "./turbulence/format";

/*
 * A flight-specific turbulence forecast only exists in the last
 * TURBULENCE_FORECAST_DAYS days (docs/FEASIBILITY.md). `ctx.daysUntil` is the
 * distance the briefing describes (the study's day-before preview passes 1,
 * version C the real days). Before that: a calm marker and the route's history
 * for the month, labelled typical, with no timeline, stretches or causes.
 */

/* ── Teaser (collapsed header line) ─────────────────────────────────────── */

export function turbulenceTeaser(flight: Flight, ctx: SectionContext): string {
  const { history, windows } = flight.turbulence;
  if (!availabilityFor(ctx.daysUntil).turbulence) {
    return `Forecast from ${turbulenceForecastFrom(flight.input.date)} · typically ${history.smoothPct}% of ${history.month} flights are smooth`;
  }
  if (windows.length === 0) return "Smooth from takeoff to landing";
  const moderate = windows.find((w) => w.intensity === "moderate");
  if (moderate) {
    return `Moderate bumps ~${windowMoment(moderate, flight.airborneMin)} for about ${formatOffset(moderate.durationMin)}, otherwise mostly smooth`;
  }
  if (windows.length === 1) {
    return `Light bumps ~${windowMoment(windows[0], flight.airborneMin)}, otherwise smooth`;
  }
  return `Light bumps in ${windows.length} short stretches, otherwise smooth`;
}

/* ── Section body ───────────────────────────────────────────────────────── */

export function TurbulenceSection({ flight, ctx }: SectionProps) {
  const { turbulence } = flight;

  if (!availabilityFor(ctx.daysUntil).turbulence) {
    return (
      <div className="flex flex-col gap-4">
        <ForecastMarker date={flight.input.date}>
          Until then, here is what&rsquo;s typical on this route. The forecast for this flight updates every few hours
          once it starts.
        </ForecastMarker>
        <TypicalTile history={turbulence.history} />
        <FeelLegend />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ConfidenceTile forecast={ctx.forecast} preview={ctx.preview === true} />

      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <Eyebrow>Expected intensity</Eyebrow>
          <span className="text-[11px] text-ink-500">Tap the chart for details</span>
        </div>
        <TurbulenceChart
          points={turbulence.points}
          phases={turbulence.phases}
          windows={turbulence.windows}
          airborneMin={flight.airborneMin}
        />
      </div>

      <PhaseList phases={turbulence.phases} />

      <BumpWindows windows={turbulence.windows} airborneMin={flight.airborneMin} />

      <HistoryTile history={turbulence.history} />

      <FeelLegend />
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-wide text-ink-400", className)}>{children}</p>
  );
}

const METER_HEIGHTS = [8, 11, 14, 17, 20];

function ConfidenceMeter({ level }: { level: number }) {
  const filled = Math.max(0, Math.min(5, Math.round(level)));
  return (
    <div
      role="img"
      aria-label={`Confidence ${filled} out of 5`}
      className="flex h-5 shrink-0 items-end gap-[3px]"
    >
      {METER_HEIGHTS.map((h, i) => (
        <span
          key={h}
          className={cn("w-1.5 rounded-full", i < filled ? "bg-calm-500" : "bg-calm-100")}
          style={{ height: h }}
        />
      ))}
    </div>
  );
}

function ConfidenceTile({ forecast, preview }: { forecast: ForecastStatus; preview: boolean }) {
  return (
    <div className="rounded-2xl bg-canvas/70 p-3.5 ring-1 ring-inset ring-line/70">
      {/* The study shows the briefing as it will look the day before the flight. */}
      {preview ? <Eyebrow className="mb-2">Day-before forecast</Eyebrow> : null}
      <div className="flex items-center gap-3">
        <ConfidenceMeter level={forecast.confidenceLevel} />
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-ink-900">{forecast.confidenceLabel}</p>
          <p className="mt-0.5 text-xs leading-snug text-ink-500">{forecast.basis}</p>
        </div>
      </div>
      <p className="mt-3 flex gap-1.5 text-xs leading-snug text-ink-500">
        <Info aria-hidden className="mt-px size-3.5 shrink-0 text-breeze-500" />
        <span>{forecast.note}</span>
      </p>
    </div>
  );
}

/** Before the flight's own forecast exists: the route's history for the month, clearly typical. */
function TypicalTile({ history }: { history: RouteHistory }) {
  return (
    <div className="rounded-2xl bg-calm-50 p-4 ring-1 ring-inset ring-calm-100">
      <Eyebrow className="text-calm-700/80">Typical for {history.month} on this route</Eyebrow>
      <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-3">
        <span className="text-[34px] font-bold leading-none tracking-tight text-calm-700 tabular-nums">
          <span className="sr-only">About </span>
          {history.smoothPct}%
        </span>
        <p className="text-sm leading-snug text-ink-700">
          of {history.month} flights on this route have little or no turbulence.
        </p>
      </div>
      <p className="mt-2 text-xs leading-snug text-ink-500">Route history, {historyBasis(history)}.</p>
      <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-snug text-ink-700">
        <li className="flex gap-1.5">
          <Waves aria-hidden className="mt-0.5 size-3.5 shrink-0 text-calm-600" />
          <span>{typicalBumpyPhaseLine(history.typicalBumpyPhase)}</span>
        </li>
        <li className="flex gap-1.5">
          <Clock3 aria-hidden className="mt-0.5 size-3.5 shrink-0 text-calm-600" />
          <span>{history.bestDepartureWindow}</span>
        </li>
      </ul>
    </div>
  );
}

function HistoryTile({ history }: { history: RouteHistory }) {
  return (
    <div className="rounded-2xl bg-canvas/70 p-3.5 ring-1 ring-inset ring-line/70">
      <Eyebrow>Route history</Eyebrow>
      <p className="mt-1.5 text-[13px] leading-snug text-ink-700">
        On this route in {history.month}, about {history.smoothPct}% of flights had little or no turbulence ({historyBasis(history)}).
      </p>
      <p className="mt-2 flex gap-1.5 text-xs leading-snug text-ink-500">
        <Clock3 aria-hidden className="mt-px size-3.5 shrink-0 text-calm-600" />
        <span>{history.bestDepartureWindow}</span>
      </p>
    </div>
  );
}

function PhaseList({ phases }: { phases: PhaseForecast[] }) {
  return (
    <div>
      <Eyebrow>Flight phases</Eyebrow>
      <ol className="relative mt-1 before:absolute before:bottom-4 before:left-[5px] before:top-4 before:w-px before:bg-line-strong before:content-['']">
        {phases.map((p) => {
          const band = INTENSITY[p.intensity];
          return (
            <li key={p.phase} className="relative flex gap-3.5 py-2.5">
              <span
                aria-hidden
                className="mt-[5px] size-[11px] shrink-0 rounded-full ring-2 ring-surface"
                style={{ background: band.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm leading-snug text-ink-900">
                    <span className="font-semibold">{PHASE_LABEL[p.phase]}</span>
                    <span className="ml-1.5 whitespace-nowrap text-xs font-medium text-ink-400 tabular-nums">
                      {rangeLabel(p.startMin, p.endMin)}
                    </span>
                  </p>
                  <Pill tone={band.tone}>{band.short}</Pill>
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-500">{p.note}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function BumpWindows({ windows, airborneMin }: { windows: BumpWindow[]; airborneMin: number }) {
  return (
    <div>
      <Eyebrow>Bumpy stretches</Eyebrow>
      {windows.length === 0 ? (
        <div className="mt-2 flex items-center gap-3 rounded-2xl bg-calm-50 p-3.5 ring-1 ring-inset ring-calm-100">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-calm-600 ring-1 ring-inset ring-calm-100"
          >
            <CircleCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-snug text-ink-900">No bumpy stretches expected</p>
            <p className="mt-0.5 text-xs leading-snug text-ink-500">Calm air is expected along the whole route.</p>
          </div>
        </div>
      ) : (
        <ul className="mt-2 flex flex-col gap-2.5">
          {windows.map((w) => {
            const band = INTENSITY[w.intensity];
            return (
              <li
                key={`${w.phase}-${w.startMin}`}
                className={cn("rounded-2xl p-3.5 ring-1 ring-inset", TONE_CLASSES[band.tone].ring)}
                style={{ background: band.soft }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-semibold" style={{ color: band.text }}>
                    <Clock3 aria-hidden className="size-3.5 shrink-0" />
                    <span className="min-w-0 leading-snug">{windowMoment(w, airborneMin)}</span>
                  </span>
                  <Pill tone={band.tone} className="shrink-0 bg-surface/80">
                    {band.short} · {formatOffset(w.durationMin)}
                  </Pill>
                </div>
                <p className="mt-2 text-sm font-semibold leading-snug text-ink-900">{w.label}</p>
                <p className="mt-1 text-[13px] leading-snug text-ink-700">{w.cause}</p>
                <p className="mt-2.5 flex gap-1.5 text-xs leading-snug text-ink-500">
                  <Armchair aria-hidden className="mt-px size-3.5 shrink-0" />
                  <span>
                    {w.seatbeltSign
                      ? "The seatbelt sign will likely be on for this stretch."
                      : "Light enough that the seatbelt sign may stay off."}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const FEELS: Array<{ level: "none" | "light" | "moderate"; text: string }> = [
  { level: "none", text: "a steady ride, like a quiet highway drive." },
  { level: "light", text: "like a car on a gravel road — drinks stay in cups." },
  { level: "moderate", text: "noticeable jolts; walking is harder and the seatbelt sign is on." },
];

function FeelLegend() {
  return (
    <div className="rounded-2xl bg-canvas/70 p-3.5 ring-1 ring-inset ring-line/70">
      <Eyebrow>What the bumps feel like</Eyebrow>
      <ul className="mt-2 flex flex-col gap-1.5">
        {FEELS.map(({ level, text }) => {
          const band = INTENSITY[level];
          return (
            <li key={level} className="flex gap-2.5 text-[13px] leading-snug">
              <span aria-hidden className="mt-[5px] size-2.5 shrink-0 rounded-full" style={{ background: band.color }} />
              <span className="text-ink-700">
                <span className="font-semibold text-ink-900">{band.short}</span> — {text}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
