import { formatOffset, formatShortDate } from "@preflight/shared/dates";
import type { Flight } from "@preflight/shared/types";

/*
 * Version C: short, calm descriptions of a flight for result cards. Pure.
 */

/** The bumpy stretches the turbulence section lists: how many and their total minutes. */
export function bumpyStretches(flight: Flight): { count: number; minutes: number } {
  const { windows } = flight.turbulence;
  return { count: windows.length, minutes: windows.reduce((sum, w) => sum + w.durationMin, 0) };
}

/** "2 bumpy stretches · 15 min" / "No bumpy stretches expected". */
export function stretchesText(flight: Flight): string {
  const { count, minutes } = bumpyStretches(flight);
  if (count === 0) return "No bumpy stretches expected";
  return `${count} bumpy ${count === 1 ? "stretch" : "stretches"} · ${minutes} min`;
}

/** Text alternative for the mini turbulence timeline. */
export function timelineLabel(flight: Flight): string {
  const parts = flight.turbulence.windows.map(
    (w) => `${w.intensity} bumps about ${formatOffset(w.startMin)} after takeoff, for about ${w.durationMin} min`,
  );
  return parts.length
    ? `Turbulence timeline, takeoff to landing: ${parts.join("; ")}; smooth otherwise.`
    : "Turbulence timeline, takeoff to landing: smooth throughout.";
}

/** "Nov 26" (no weekday). */
export function monthDay(iso: string): string {
  try {
    return formatShortDate(iso).replace(/^\w+, /, "");
  } catch {
    return iso;
  }
}

/** "Thu" */
export function weekday(iso: string): string {
  try {
    return formatShortDate(iso).slice(0, 3);
  } catch {
    return "";
  }
}
