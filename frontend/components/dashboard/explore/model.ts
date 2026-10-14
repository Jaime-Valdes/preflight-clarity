import { formatShortDate } from "@preflight/shared/dates";
import type { ExploredFlight, Flight } from "@preflight/shared/types";

/** One flight in the strip: what the tracker records plus the generated flight it stands for. */
export interface ExploredEntry {
  meta: ExploredFlight;
  flight: Flight;
}

/** "Your flight" for the first (set-up) flight, then "Option 2", "Option 3"… */
export function exploreLabel(index: number): string {
  return index <= 0 ? "Your flight" : `Option ${index + 1}`;
}

/** "Nov 26" (no weekday — chips stay short). */
export function chipDate(iso: string): string {
  try {
    return formatShortDate(iso).replace(/^\w+, /, "");
  } catch {
    return iso;
  }
}

/** "JFK → LAX" */
export function routeLabel(flight: Flight): string {
  return `${flight.origin.code} → ${flight.destination.code}`;
}

/** Minutes of the airborne time expected to have some motion (the complement of smoothMinutesPct). */
export function bumpyMinutes(flight: Flight): number {
  const pct = Math.max(0, Math.min(100, flight.turbulence.smoothMinutesPct));
  return Math.round((flight.airborneMin * (100 - pct)) / 100);
}
