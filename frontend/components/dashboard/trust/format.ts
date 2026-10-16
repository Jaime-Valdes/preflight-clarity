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

/** Years with at most one decimal: 6 → "6", 3.44 → "3.4". */
export function yearsNumber(years: number): string {
  const y = Math.max(0, Math.round(years * 10) / 10);
  return Number.isInteger(y) ? String(y) : y.toFixed(1);
}

/** Fleet age range: [0.8, 6.1] → "0.8–6.1". */
export function ageRangeLabel([min, max]: readonly [number, number]): string {
  return `${yearsNumber(min)}–${yearsNumber(Math.max(min, max))}`;
}

export interface NoiseBand {
  /** "Quieter than most airliners" */
  label: string;
  /** "roughly 76–80 dB at cruise" */
  range: string;
}

/**
 * Cabin noise as a relative band with an approximate range (docs/FEASIBILITY.md):
 * published figures for a model vary with the cabin and seat, so never one exact dB.
 */
export function cabinNoiseBand(db: number): NoiseBand {
  const centre = Math.round(db);
  const range = `roughly ${centre - 2}–${centre + 2} dB at cruise`;
  if (db < 79) return { label: "Quieter than most airliners", range };
  if (db < 82) return { label: "A little quieter than average", range };
  return { label: "About average for an airliner", range };
}

/** "Lufthansa" → "Lufthansa’s", "Delta Air Lines" → "Delta Air Lines’". */
export function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}\u2019` : `${name}\u2019s`;
}
