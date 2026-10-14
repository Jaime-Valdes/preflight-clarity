import { daysBetween, formatShortDate } from "@preflight/shared/dates";
import type { BodyType, Flight } from "@preflight/shared/types";
import type { Tone } from "@/lib/theme";

/*
 * Pure copy helpers for the "Compare smoother options" section. No React.
 */

/** "Same day" | "Day before" | "Day after" (or a short date when further out). */
export function relationLabel(flightDate: string, altDate: string): string {
  let diff: number;
  try {
    diff = daysBetween(flightDate, altDate);
  } catch {
    return altDate;
  }
  if (diff === 0) return "Same day";
  if (diff === -1) return "Day before";
  if (diff === 1) return "Day after";
  try {
    return formatShortDate(altDate);
  } catch {
    return altDate;
  }
}

/** "+8 smoother" | "3 less smooth" | "Same score" */
export function deltaLabel(delta: number): string {
  const d = Math.round(delta);
  if (d > 0) return `+${d} smoother`;
  if (d < 0) return `${-d} less smooth`;
  return "Same score";
}

/** "+$45" | "−$20" | "Same fare" */
export function fareLabel(diffUsd: number): string {
  const d = Math.round(diffUsd);
  const amount = Math.abs(d).toLocaleString("en-US");
  if (d > 0) return `+$${amount}`;
  if (d < 0) return `−$${amount}`;
  return "Same fare";
}

/** Same thresholds the generator uses for `smoothness.label`. */
export function scoreLabel(score: number): string {
  return score >= 88 ? "Very smooth" : score >= 75 ? "Mostly smooth" : "Some bumps expected";
}

export function scoreTone(score: number): Tone {
  return score >= 88 ? "calm" : score >= 75 ? "breeze" : "sand";
}

export const BODY_LABEL: Record<BodyType, string> = { wide: "Wide-body", narrow: "Narrow-body" };

/** "+1" | "−1" | "" for an arrival calendar-day offset. */
export function dayMarker(offset: number): string {
  if (!offset) return "";
  return offset > 0 ? `+${offset}` : `−${-offset}`;
}

/** Collapsed-header line: "2 smoother options on this route · up to +9". */
export function compareTeaserLine(flight: Flight): string {
  const alts = flight.alternatives ?? [];
  if (alts.length === 0) return "No other flights found on this route";
  const smoother = alts.filter((a) => a.scoreDelta > 0);
  if (smoother.length === 0) {
    return `${alts.length} other option${alts.length === 1 ? "" : "s"} · none smoother than yours`;
  }
  const best = Math.max(...smoother.map((a) => a.scoreDelta));
  const n = smoother.length;
  return `${n} smoother option${n === 1 ? "" : "s"} on this route · up to +${best}`;
}
