import { addDays, formatShortDate } from "@preflight/shared/dates";

/*
 * Version C: small pure helpers shared by the flight and compare pages
 * (dates the tool accepts, short labels). Safe in render — "today" is passed in.
 */

/** The tool shows flights from today up to a year ahead (docs/VERSION_C.md). */
export const MAX_DAYS_AHEAD = 365;

export type DateStatus = "ok" | "past" | "far";

/** Whether a "YYYY-MM-DD" date can be shown, given today's date. */
export function dateStatus(date: string, today: string): DateStatus {
  if (date < today) return "past";
  if (date > addDays(today, MAX_DAYS_AHEAD)) return "far";
  return "ok";
}

/** The nearest date the tool can show: today for a past date, a year ahead for one further out. */
export function clampDate(date: string, today: string): string {
  const status = dateStatus(date, today);
  if (status === "past") return today;
  if (status === "far") return addDays(today, MAX_DAYS_AHEAD);
  return date;
}

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
