import { formatShortDate } from "@preflight/shared/dates";
import type { ExploredFlight, Flight } from "@preflight/shared/types";

/** One flight in the strip: what the tracker records plus the generated flight it stands for. */
export interface ExploredEntry {
  meta: ExploredFlight;
  flight: Flight;
}

/**
 * The study's set-up flight is an example on the participant's route (they never say which flight
 * they are on — docs/FEASIBILITY.md), so the first chip is "Example flight"; then "Option 2", "Option 3"…
 */
export const EXAMPLE_FLIGHT_CHIP = "Example flight";

export function exploreLabel(index: number): string {
  return index <= 0 ? EXAMPLE_FLIGHT_CHIP : `Option ${index + 1}`;
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
