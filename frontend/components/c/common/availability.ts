import { daysBetween, formatShortDate } from "@preflight/shared/dates";
import {
  availabilityFor,
  availableFrom,
  TURBULENCE_FORECAST_DAYS,
  WEATHER_FORECAST_DAYS,
  type Availability,
} from "@preflight/shared/forecast";

/*
 * Version C is time-aware (docs/FEASIBILITY.md, docs/VERSION_C.md "Time-aware
 * data"): a flight-specific item only shows once it exists in the real world.
 * These helpers give the distance, what is available, and the calm marker
 * copy that stands in for an item that isn't out yet. Pure — safe in render.
 */

/** Whole days from today to the departure date (0 = today; never negative). */
export function daysAhead(date: string, today: string): number {
  return Math.max(0, daysBetween(today, date));
}

/** What is knowable today about a flight that leaves on `date`. */
export function availabilityOn(date: string, today: string): Availability {
  return availabilityFor(daysAhead(date, today));
}

/** "Tue, Nov 24" — the day the turbulence forecast for a flight on `date` comes out. */
export function turbulenceFromDate(date: string): string {
  return formatShortDate(availableFrom(date, TURBULENCE_FORECAST_DAYS));
}

/** "Thu, Nov 19" — the day the weather forecast for a flight on `date` comes out. */
export function weatherFromDate(date: string): string {
  return formatShortDate(availableFrom(date, WEATHER_FORECAST_DAYS));
}

/** "2 days before departure" */
export const TURBULENCE_LEAD = `${TURBULENCE_FORECAST_DAYS} days before departure`;
/** "7 days before departure" */
export const WEATHER_LEAD = `${WEATHER_FORECAST_DAYS} days before departure`;

/** "Turbulence forecast from Tue, Nov 24 · 2 days before departure" */
export function turbulenceMarker(date: string): string {
  return `Turbulence forecast from ${turbulenceFromDate(date)} · ${TURBULENCE_LEAD}`;
}

/** "Weather forecast from Thu, Nov 19 · 7 days before departure" */
export function weatherMarker(date: string): string {
  return `Weather forecast from ${weatherFromDate(date)} · ${WEATHER_LEAD}`;
}
