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

/**
 * The bumpy stretches the turbulence section lists for this flight: how many and
 * their total minutes (the same windows, so both screens give the same figure).
 */
export function bumpyStretches(flight: Flight): { count: number; minutes: number } {
  const { windows } = flight.turbulence;
  return { count: windows.length, minutes: windows.reduce((sum, w) => sum + w.durationMin, 0) };
}
