import { daysBetween, formatShortDate } from "@preflight/shared/dates";
import { departureUtcMs } from "@preflight/shared/fakeFlight";
import {
  AIRFRAME_DAYS,
  availabilityFor,
  availableFrom,
  TURBULENCE_FORECAST_DAYS,
  WEATHER_FORECAST_DAYS,
  type Availability,
} from "@preflight/shared/forecast";
import type { Flight } from "@preflight/shared/types";

/*
 * Version C is time-aware (docs/FEASIBILITY.md, docs/VERSION_C.md "Time-aware
 * data"): a flight-specific item only shows once it exists in the real world.
 * The one C module for the distance to departure, what is available, the calm
 * marker that stands in for an item that isn't out yet, and whether a flight
 * has already left. Every helper takes `today` first, then the departure date.
 * Pure — "today" and "now" are passed in, so safe in render.
 */

/** Whole days from `today` to the departure `date` (0 = today; never negative). */
export function daysToDeparture(today: string, date: string): number {
  return Math.max(0, daysBetween(today, date));
}

/** What is knowable on `today` about a flight that leaves on `date`. */
export function availabilityAt(today: string, date: string): Availability {
  return availabilityFor(daysToDeparture(today, date));
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
  /** "Tue, Nov 24" — the day the item comes out for a flight on that date. */
  from: string;
  /** "2 days before departure" */
  lead: string;
}

function shortDate(iso: string): string {
  try {
    return formatShortDate(iso);
  } catch {
    return iso;
  }
}

/** The parts of a marker, for layouts that set them on separate lines (add a separator for screen readers). */
export function marker(item: PendingItem, date: string, subject = PENDING[item].subject): Marker {
  const { days } = PENDING[item];
  return {
    subject,
    from: shortDate(availableFrom(date, days)),
    lead: days === 0 ? "on the day of departure" : `${days} ${days === 1 ? "day" : "days"} before departure`,
  };
}

/** "Turbulence forecast from Tue, Nov 24 · 2 days before departure" */
export function markerText(item: PendingItem, date: string, subject?: string): string {
  const m = marker(item, date, subject);
  return `${m.subject} from ${m.from} · ${m.lead}`;
}

/**
 * True once the flight has left (its departure instant, in its origin's time
 * zone, is before `nowMs`). `nowMs` comes from useNowMs(); null (not hydrated
 * yet) counts as not left.
 */
export function hasLeft(flight: Pick<Flight, "input" | "departTime" | "origin">, nowMs: number | null): boolean {
  return nowMs !== null && departureUtcMs(flight) <= nowMs;
}
