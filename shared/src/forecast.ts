import { addDays } from "./dates";
import type { Flight, FlightSummary, ForecastStatus, RouteHistory } from "./types";

/*
 * What can really be known, and when (docs/FEASIBILITY.md). Each constant is
 * the number of days before departure from which that item exists in the real
 * world; before that, the UI must not show it as known.
 */

/** Flight-specific turbulence forecast: score, timeline, bump stretches with times, causes. */
export const TURBULENCE_FORECAST_DAYS = 2;
/** Departure/arrival weather condition and temperature. */
export const WEATHER_FORECAST_DAYS = 7;
/** Wind, gusts and visibility at the departure/arrival time. */
export const WEATHER_DETAIL_DAYS = 2;
/** Gate number (the terminal is known any time). */
export const GATE_DAYS = 0;
/** Tail number, this airframe's age and delivery year (the type is known from the schedule). */
export const AIRFRAME_DAYS = 1;
/** Schedules and fares are published about this far ahead; date pickers stop here. */
export const SCHEDULE_DAYS = 330;
/** The study (A/B) shows the briefing as it will look the day before departure. */
export const PREVIEW_DAYS_UNTIL = 1;

/** The horizon the study's preview describes: the day before, or the day itself for a flight today. */
export function previewDaysUntil(realDaysUntil: number): number {
  return Math.min(PREVIEW_DAYS_UNTIL, Math.max(0, realDaysUntil));
}

/** @deprecated Use TURBULENCE_FORECAST_DAYS (kept so older imports compile). */
export const FORECAST_HORIZON_DAYS = TURBULENCE_FORECAST_DAYS;

export interface Availability {
  /** Flight-specific turbulence forecast. */
  turbulence: boolean;
  /** Departure/arrival condition and temperature. */
  weather: boolean;
  /** Wind, gusts and visibility. */
  weatherDetail: boolean;
  gate: boolean;
  /** Tail number, this airframe's age and delivery year. */
  airframe: boolean;
}

/** Which flight-specific items exist `daysUntil` days before departure. */
export function availabilityFor(daysUntil: number): Availability {
  return {
    turbulence: daysUntil <= TURBULENCE_FORECAST_DAYS,
    weather: daysUntil <= WEATHER_FORECAST_DAYS,
    weatherDetail: daysUntil <= WEATHER_DETAIL_DAYS,
    gate: daysUntil <= GATE_DAYS,
    airframe: daysUntil <= AIRFRAME_DAYS,
  };
}

/** The date from which something that exists `daysBefore` days ahead of departure becomes available. */
export function availableFrom(departureDate: string, daysBefore: number): string {
  return addDays(departureDate, -daysBefore);
}

/**
 * How sure the turbulence forecast can be, given how far away the flight is.
 * A flight-specific forecast only exists in the last TURBULENCE_FORECAST_DAYS
 * days (WAFS/GTG-style turbulence forecasts); before that there is only the
 * route's history for the month (mode "history"), and the UI shows a marker
 * instead of flight-specific turbulence. ("outlook" is no longer produced; it
 * stays in the type for older records.)
 */
export function getForecastStatus(daysUntil: number, history: RouteHistory): ForecastStatus {
  const flights = history.flightsAnalyzed.toLocaleString("en-US");

  if (daysUntil > TURBULENCE_FORECAST_DAYS) {
    return {
      mode: "history",
      confidence: "low",
      confidenceLevel: 1,
      confidenceLabel: "Not available yet",
      basis: `Typical for ${history.month}: about ${flights} past flights with turbulence reports on this route`,
      note: `A turbulence forecast for this flight starts ${TURBULENCE_FORECAST_DAYS} days before departure.`,
    };
  }

  if (daysUntil > 0) {
    return {
      mode: "forecast",
      confidence: "moderate",
      confidenceLevel: 4,
      confidenceLabel: "Good confidence",
      basis: "The latest turbulence forecasts along the usual path for this flight",
      note: "Updated every 6 hours. Timing firms up on the day of the flight.",
    };
  }

  return {
    mode: "forecast",
    confidence: "high",
    confidenceLevel: 5,
    confidenceLabel: "High confidence",
    basis: "Hourly turbulence forecasts and recent pilot reports along the usual path",
    note: "Updated every hour until departure.",
  };
}

/**
 * Compact flight description stored with each session record. `shownDaysUntil`
 * is the horizon the briefing was shown at (the study's day-before preview
 * passes PREVIEW_DAYS_UNTIL); `daysUntil` stays the real distance.
 */
export function summarizeFlight(flight: Flight, daysUntil: number, shownDaysUntil = daysUntil): FlightSummary {
  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    airline: flight.airline.name,
    route: `${flight.origin.code} → ${flight.destination.code}`,
    aircraft: flight.aircraft.fullName,
    bodyType: flight.aircraft.bodyType,
    airborneMin: flight.airborneMin,
    smoothnessScore: flight.smoothness.score,
    maxIntensity: flight.turbulence.maxIntensity,
    daysUntil,
    forecastMode: getForecastStatus(shownDaysUntil, flight.turbulence.history).mode,
  };
}
