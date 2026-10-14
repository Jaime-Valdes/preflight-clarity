import { formatOffset } from "@preflight/shared/dates";
import type { BumpWindow } from "@preflight/shared/types";

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
