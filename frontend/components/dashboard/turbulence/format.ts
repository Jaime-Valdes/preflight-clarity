import { formatOffset, formatShortDate } from "@preflight/shared/dates";
import { TURBULENCE_FORECAST_DAYS, availableFrom } from "@preflight/shared/forecast";
import type { BumpWindow, FlightPhase, RouteHistory } from "@preflight/shared/types";

/*
 * Small, pure wording helpers shared by the turbulence teaser, the section
 * body and the chart. Everything is "minutes after takeoff" based.
 */

/** "25 min after takeoff" · "1h 10m into the flight" · "12 min before landing" */
export function windowMoment(w: Pick<BumpWindow, "phase" | "startMin">, airborneMin: number): string {
  if (w.phase === "descent" || w.phase === "landing") {
    return `${formatOffset(Math.max(0, airborneMin - w.startMin))} before landing`;
  }
  if (w.startMin < 60) return `${formatOffset(w.startMin)} after takeoff`;
  return `${formatOffset(w.startMin)} into the flight`;
}

/** Where a chart point sits in the flight: "At takeoff" · "1h 10m after takeoff" · "At landing". */
export function pointMoment(minute: number, airborneMin: number): string {
  if (minute <= 0) return "At takeoff";
  if (minute >= airborneMin) return "At landing";
  return `${formatOffset(minute)} after takeoff`;
}

/** Compact axis tick: 30 → "30m", 60 → "1h", 90 → "1h 30m". */
export function compactMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Phase time range: "0–2 min" · "22 min–5h 6m" · "5h 6m–5h 36m". */
export function rangeLabel(startMin: number, endMin: number): string {
  if (endMin < 60) return `${startMin}–${endMin} min`;
  return `${formatOffset(startMin)}–${formatOffset(endMin)}`;
}

/**
 * The study preview's horizon, named (docs/FEASIBILITY.md): the briefing shows the day
 * before the flight, or the day itself for a flight today (`previewDaysUntil` → 0).
 */
export function previewForecastLabel(briefingDaysUntil: number): string {
  return briefingDaysUntil <= 0 ? "Forecast for today" : "Day-before forecast";
}

/* ── Before the flight-specific forecast exists (docs/FEASIBILITY.md) ──── */

/** "Tue, Nov 24": the first day a turbulence forecast for a flight departing on `departureDate` exists. */
export function turbulenceForecastFrom(departureDate: string): string {
  try {
    return formatShortDate(availableFrom(departureDate, TURBULENCE_FORECAST_DAYS));
  } catch {
    return departureDate;
  }
}

/** "2 days before departure" */
export const TURBULENCE_LEAD = `${TURBULENCE_FORECAST_DAYS} days before departure`;

/** "Turbulence forecast from Tue, Nov 24 · 2 days before departure" (or another subject: "Smoothness score"). */
export function turbulenceMarker(departureDate: string, subject = "Turbulence forecast"): string {
  return `${subject} from ${turbulenceForecastFrom(departureDate)} · ${TURBULENCE_LEAD}`;
}

/** A calm round figure for a count of past flights: 1,243 → "1,200", 487 → "490". */
export function aboutCount(n: number): string {
  const step = n >= 1000 ? 100 : 10;
  return (Math.max(step, Math.round(n / step) * step)).toLocaleString("en-US");
}

/** "based on about 1,200 past flights with turbulence reports" */
export function historyBasis(history: Pick<RouteHistory, "flightsAnalyzed">): string {
  return `based on about ${aboutCount(history.flightsAnalyzed)} past flights with turbulence reports`;
}

/** "About 89% of December flights on this route are smooth" — route history, never this flight. */
export function typicalSmoothLine(history: Pick<RouteHistory, "smoothPct" | "month">): string {
  return `About ${history.smoothPct}% of ${history.month} flights on this route are smooth`;
}

const PHASE_WHEN: Record<FlightPhase, string> = {
  takeoff: "just after takeoff",
  climb: "during the climb",
  cruise: "at cruising altitude",
  descent: "on the way down",
  landing: "on the final approach",
};

/** "When bumps happen on this route, they're most often during the climb." */
export function typicalBumpyPhaseLine(phase: FlightPhase): string {
  return `When bumps happen on this route, they’re most often ${PHASE_WHEN[phase] ?? "at cruising altitude"}.`;
}
