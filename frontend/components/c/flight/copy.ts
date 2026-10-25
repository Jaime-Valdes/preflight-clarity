import { formatShortDate } from "@preflight/shared/dates";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import type { Flight } from "@preflight/shared/types";
import type { RouteDay } from "@/lib/c/model";

/*
 * Version C: small pure helpers shared by the flight and compare pages
 * (short labels, link styles). Safe in render. Which dates the tool shows:
 * dateStatus / clampDate in lib/c/model.ts.
 */

/** "Thu, Nov 26" (falls back to the raw value for a malformed date). */
export function shortDate(iso: string): string {
  try {
    return formatShortDate(iso);
  } catch {
    return iso;
  }
}

/** "Nov 26" — no weekday. */
export function monthDay(iso: string): string {
  return shortDate(iso).replace(/^\w+, /, "");
}

/** "JFK → LAX" */
export function routeText(origin: string, destination: string): string {
  return `${origin} → ${destination}`;
}

/** "DL 2165 · JFK → LAX · Nov 26" — what the sign-up card records as the visitor's context (docs/INTEREST.md). */
export function flightContext(flight: Pick<Flight, "flightNumber">, day: RouteDay): string {
  return `${flight.flightNumber} · ${routeText(day.origin, day.destination)} · ${monthDay(day.date)}`;
}

/**
 * The illustrative fare shown for a flight `daysUntil` days before it leaves: the cached base
 * fare (FlightOption.fareUsd) moved by the booking lead time (fareAt). Every fare on the flight
 * and compare pages goes through here, so they always agree with the results page.
 */
export function fareFor(option: FlightOption, daysUntil: number): number {
  return fareAt(option, daysUntil);
}

/** "Today" · "Tomorrow" · "In 42 days" */
export function daysAwayLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

/** "+1" / "−1" for an arrival on another calendar day; "" otherwise. */
export function dayOffsetMark(offset: number): string {
  if (!offset) return "";
  return offset > 0 ? `+${offset}` : `−${-offset}`;
}

/** "next day" / "2 days later" / "day before" for screen readers; "" when the same day. */
export function dayOffsetWords(offset: number): string {
  if (!offset) return "";
  if (offset === 1) return "next day";
  if (offset === -1) return "day before";
  return offset > 1 ? `${offset} days later` : `${-offset} days before`;
}

/*
 * Links styled like the design system's buttons (Button renders a <button>; links need the classes).
 * Base, size and tone are separate so a caller picks a size instead of overriding one: cn() does not
 * merge conflicting Tailwind utilities.
 */
export const LINK_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors duration-200";

export const LINK_TONE = {
  primary: "bg-night-900 text-white shadow-lift hover:bg-night-800 active:bg-night-950",
  secondary: "bg-surface text-ink-900 ring-1 ring-inset ring-line-strong hover:bg-canvas active:bg-line/60",
} as const;

/** Full-size (44 px) link buttons. */
export const LINK_BUTTON = {
  primary: `${LINK_BASE} h-11 px-5 ${LINK_TONE.primary}`,
  secondary: `${LINK_BASE} h-11 px-5 ${LINK_TONE.secondary}`,
} as const;
