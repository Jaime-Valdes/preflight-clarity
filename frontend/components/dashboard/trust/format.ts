/*
 * Small formatting helpers shared by the "trust" sections (pilots, aircraft,
 * airline). Pure functions, no clock.
 */

/** Thousands-separated integer: 23450 → "23,450". */
export function formatCount(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** 9 → "9 days ago", 1 → "1 day ago", 0 → "today". */
export function daysAgo(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d === 0) return "today";
  return `${d} ${plural(d, "day")} ago`;
}

/** 35 → "in 35 days", 1 → "in 1 day", 0 → "today". */
export function inDays(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d === 0) return "today";
  return `in ${d} ${plural(d, "day")}`;
}

/** Airframe age for a one-line teaser: 7.6 → "7 years old", 1.4 → "1 year old", 0.8 → "under a year old". */
export function ageLabel(ageYears: number): string {
  const whole = Math.floor(Math.max(0, ageYears));
  if (whole < 1) return "under a year old";
  return `${whole} ${plural(whole, "year")} old`;
}

/** Airframe age for a stat tile: 7.6 → "7.6 years", 15 → "15 years", 0.8 → "10 months". */
export function ageValue(ageYears: number): string {
  const age = Math.max(0, ageYears);
  if (age < 1) {
    const months = Math.max(1, Math.round(age * 12));
    return `${months} ${plural(months, "month")}`;
  }
  const text = Number.isInteger(age) ? String(age) : age.toFixed(1);
  return `${text} years`;
}
