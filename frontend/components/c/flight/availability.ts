import { daysBetween } from "@preflight/shared/dates";
import {
  AIRFRAME_DAYS,
  TURBULENCE_FORECAST_DAYS,
  WEATHER_FORECAST_DAYS,
  availabilityFor,
  availableFrom,
  type Availability,
} from "@preflight/shared/forecast";
import { shortDate } from "./copy";

/*
 * Version C is time-aware (docs/FEASIBILITY.md, docs/VERSION_C.md "Time-aware
 * data"): a flight-specific item only shows once it really exists at the
 * flight's distance from today. Before that a calm marker says when it will:
 * "Turbulence forecast from Tue, Nov 24 · 2 days before departure".
 * Pure — "today" is passed in.
 */

/** Whole days from today to departure (0 = today, never negative). */
export function daysBefore(today: string, departureDate: string): number {
  return Math.max(0, daysBetween(today, departureDate));
}

/** What exists for a flight departing on `departureDate`, seen from `today`. */
export function availabilityOn(today: string, departureDate: string): Availability {
  return availabilityFor(daysBefore(today, departureDate));
}

export type PendingItem = "turbulence" | "weather" | "airframe";

const PENDING: Record<PendingItem, { subject: string; days: number }> = {
  turbulence: { subject: "Turbulence forecast", days: TURBULENCE_FORECAST_DAYS },
  weather: { subject: "Weather forecast", days: WEATHER_FORECAST_DAYS },
  airframe: { subject: "Assigned aircraft", days: AIRFRAME_DAYS },
};

export interface Marker {
  /** "Turbulence forecast" */
  subject: string;
  /** "Tue, Nov 24" */
  from: string;
  /** "2 days before departure" */
  lead: string;
}

/** The parts of a marker, for layouts that set them on separate lines. */
export function marker(item: PendingItem, departureDate: string, subject = PENDING[item].subject): Marker {
  const { days } = PENDING[item];
  return {
    subject,
    from: shortDate(availableFrom(departureDate, days)),
    lead: days === 0 ? "on the day of departure" : `${days} ${days === 1 ? "day" : "days"} before departure`,
  };
}

/** "Turbulence forecast from Tue, Nov 24 · 2 days before departure" */
export function markerText(item: PendingItem, departureDate: string, subject?: string): string {
  const m = marker(item, departureDate, subject);
  return `${m.subject} from ${m.from} · ${m.lead}`;
}
