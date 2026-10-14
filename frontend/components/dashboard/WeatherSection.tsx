"use client";

import { ArrowUp, CalendarClock, Droplets, Eye, PlaneLanding, PlaneTakeoff, Wind, type LucideIcon } from "lucide-react";
import { createElement, useState, type ReactNode } from "react";
import { formatTime12, monthName } from "@preflight/shared/dates";
import { FORECAST_HORIZON_DAYS } from "@preflight/shared/forecast";
import type { Flight, SectionContext, SectionProps, WeatherReport } from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { TONE_CLASSES } from "@/lib/theme";
import { useTracker } from "@/lib/tracking";
import {
  CARD_TINT,
  conditionIcon,
  conditionTone,
  dayOffsetLabel,
  precipLabel,
  windArrowRotation,
} from "./env/weather";

type Unit = "F" | "C";

/**
 * Weather at the origin around departure and at the destination around
 * arrival: condition, temperature, wind, visibility, chance of rain and a calm
 * note on what it means for the flight.
 */
export function WeatherSection({ flight, ctx }: SectionProps) {
  const tracker = useTracker();
  const [unit, setUnit] = useState<Unit>("F");

  const changeUnit = (next: Unit) => {
    if (next === unit) return;
    setUnit(next);
    tracker?.event("weather_units", "weather", next);
  };

  const basis =
    ctx.daysUntil > FORECAST_HORIZON_DAYS
      ? `Typical conditions for ${safeMonthName(flight.input.date)} · live forecast about ${FORECAST_HORIZON_DAYS} days before departure`
      : "Forecast for your departure and arrival times";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="flex min-w-0 items-start gap-1.5 pt-2 text-xs leading-snug text-ink-500">
          <CalendarClock aria-hidden className="mt-px size-3.5 shrink-0" />
          <span>{basis}</span>
        </p>
        <UnitToggle unit={unit} onChange={changeUnit} />
      </div>
      <WeatherCard report={flight.weather.origin} unit={unit} dayOffset={0} />
      <WeatherCard report={flight.weather.destination} unit={unit} dayOffset={flight.arriveDayOffset} />
    </div>
  );
}

/** "Partly cloudy in New York · Clear in Los Angeles" */
export function weatherTeaser(flight: Flight, ctx: SectionContext): string {
  void ctx;
  const o = flight.weather.origin;
  const d = flight.weather.destination;
  if (o.city === d.city) return `${o.label} at departure · ${d.label} at arrival`;
  return `${o.label} in ${o.city} · ${d.label} in ${d.city}`;
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function WeatherCard({ report, unit, dayOffset }: { report: WeatherReport; unit: Unit; dayOffset: number }) {
  const tone = conditionTone(report);
  const t = TONE_CLASSES[tone];
  const departure = report.moment === "departure";
  const MomentIcon = departure ? PlaneTakeoff : PlaneLanding;
  const primary = unit === "F" ? report.tempF : report.tempC;
  const secondary = unit === "F" ? `${report.tempC}°C` : `${report.tempF}°F`;
  const rotation = windArrowRotation(report.windDir);
  const offsetLabel = dayOffsetLabel(dayOffset);

  return (
    <article
      aria-label={`${departure ? "Departure" : "Arrival"} weather, ${report.city}`}
      className={cn("rounded-2xl p-4 ring-1 ring-inset ring-line/70", CARD_TINT[tone])}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
            <MomentIcon aria-hidden className="size-3.5" />
            {departure ? "Departure" : "Arrival"}
          </div>
          <div className="mt-0.5 text-sm leading-snug font-semibold break-words text-ink-900">
            {report.city} <span className="font-medium text-ink-400">{report.airportCode}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-ink-900 tabular-nums">{formatTime12(report.localTime)}</div>
          <div className="text-[11px] text-ink-400">{offsetLabel ? `local · ${offsetLabel}` : "local time"}</div>
        </div>
      </header>

      <div className="mt-3 flex items-center gap-3">
        <span
          aria-hidden
          className={cn(
            "flex size-14 shrink-0 items-center justify-center rounded-2xl bg-surface shadow-soft ring-1 ring-inset",
            t.text,
            t.ring,
          )}
        >
          {createElement(conditionIcon(report), { className: "size-7", strokeWidth: 1.75 })}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] leading-snug font-bold text-ink-900">{report.label}</div>
          <div className="mt-0.5 text-xs text-ink-500 tabular-nums">{secondary}</div>
        </div>
        <div className="shrink-0 text-[34px] leading-none font-extrabold tracking-tight text-ink-900 tabular-nums">
          {primary}°<span className="text-lg font-bold text-ink-500">{unit}</span>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Details">
        <Chip icon={Wind} label="Wind" value={`${report.windKts} kt`}>
          <span className="inline-flex items-center gap-0.5 font-semibold text-ink-700">
            {rotation !== null ? (
              <ArrowUp aria-hidden className="size-3" style={{ transform: `rotate(${rotation}deg)` }} />
            ) : null}
            {report.windDir}
          </span>
        </Chip>
        {report.gustKts ? <Chip label="Gusts" value={`${report.gustKts} kt`} /> : null}
        <Chip icon={Eye} label="Visibility" value={`${report.visibilityMi} mi`} />
        <Chip icon={Droplets} label={precipLabel(report.condition)} value={`${report.precipPct}%`} />
      </ul>

      <p className="mt-3 text-sm leading-snug text-ink-700">{report.impactNote}</p>
    </article>
  );
}

function Chip({
  icon: Icon,
  label,
  value,
  children,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  children?: ReactNode;
}) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs ring-1 ring-inset ring-line/80">
      {Icon ? <Icon aria-hidden className="size-3.5 text-ink-400" /> : null}
      <span className="text-ink-500">{label}</span>
      <span className="font-semibold text-ink-900 tabular-nums">{value}</span>
      {children}
    </li>
  );
}

const UNITS: readonly Unit[] = ["F", "C"];

function UnitToggle({ unit, onChange }: { unit: Unit; onChange: (next: Unit) => void }) {
  return (
    <div
      role="group"
      aria-label="Temperature unit"
      className="inline-flex shrink-0 rounded-full bg-canvas p-0.5 ring-1 ring-inset ring-line"
    >
      {UNITS.map((u) => {
        const active = u === unit;
        return (
          <button
            key={u}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(u)}
            // The pseudo-element pads the hit area to 44px without changing the visual size.
            className={cn(
              "relative h-9 min-w-11 rounded-full px-3 text-xs font-semibold transition-colors tabular-nums before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
              active
                ? "bg-surface text-ink-900 shadow-[0_1px_2px_rgb(14_26_43/0.08)] ring-1 ring-inset ring-line/80"
                : "text-ink-500 hover:text-ink-700",
            )}
          >
            °{u}
          </button>
        );
      })}
    </div>
  );
}

/** monthName throws on a malformed date; a generated flight always has a valid one, but never crash a section over it. */
function safeMonthName(iso: string): string {
  try {
    return monthName(iso);
  } catch {
    return "this time of year";
  }
}
