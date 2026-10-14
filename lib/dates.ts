/*
 * Calendar helpers. Dates are plain "YYYY-MM-DD" strings in the traveller's
 * local calendar; times are "HH:MM" 24h strings. Nothing here reads the
 * current clock — callers pass `today` in (Next.js prerendering forbids
 * reading the clock during render, so only call these with a clock value
 * from an effect or event handler).
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isISODate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Parses "YYYY-MM-DD" into parts. Throws on malformed input. */
export function parseISODate(iso: string): { y: number; m: number; d: number } {
  const match = ISO_DATE.exec(iso);
  if (!match) throw new Error(`Invalid date: ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** Day number since the Unix epoch for a calendar date (timezone-free). */
function epochDay(iso: string): number {
  const { y, m, d } = parseISODate(iso);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Local calendar date of a Date object as "YYYY-MM-DD". */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISODate(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Whole calendar days from `fromIso` to `toIso` (negative if `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  return epochDay(toIso) - epochDay(fromIso);
}

/** Whole calendar days from `today` (local) to the departure date. 0 = today. */
export function daysUntil(dateIso: string, today: Date): number {
  return daysBetween(toISODate(today), dateIso);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayIndex(iso: string): number {
  const { y, m, d } = parseISODate(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function monthName(iso: string): string {
  return MONTHS[parseISODate(iso).m - 1];
}

/** "Thursday, November 26, 2026" */
export function formatLongDate(iso: string): string {
  const { y, m, d } = parseISODate(iso);
  return `${WEEKDAYS[weekdayIndex(iso)]}, ${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "Thu, Nov 26" */
export function formatShortDate(iso: string): string {
  const { m, d } = parseISODate(iso);
  return `${WEEKDAYS[weekdayIndex(iso)].slice(0, 3)}, ${MONTHS[m - 1].slice(0, 3)} ${d}`;
}

/** "08:35" → "8:35 AM" */
export function formatTime12(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr} ${suffix}`;
}

/** 332 → "5h 32m", 45 → "45m" */
export function formatDuration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Minutes after takeoff → "25 min", "1h 10m" */
export function formatOffset(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  return total < 60 ? `${total} min` : formatDuration(total);
}

/** Countdown line for the dashboard header. */
export function countdownLabel(days: number): string {
  if (days <= 0) return "Your flight is today";
  if (days === 1) return "Your flight is tomorrow";
  return `${days} days until your flight`;
}

/** "HH:MM" → minutes after midnight. */
export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes after midnight (any integer) → "HH:MM", wrapped to 0–23h. */
export function minutesToTime(minutes: number): string {
  const wrapped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
