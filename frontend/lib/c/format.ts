/*
 * Version C formatting helpers. Pure — safe in render.
 */

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** 1248 → "$1,248". */
export function formatFare(usd: number): string {
  return USD.format(Math.round(usd));
}

/** Minutes after midnight → "6:30 AM" (1439 and up → "11:59 PM", the end of the day). */
export function formatMinutes12(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  const h = Math.floor(m / 60);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m % 60).padStart(2, "0")} ${suffix}`;
}

/** The departure-window filter moves in half hours. */
export const WINDOW_STEP_MIN = 30;

/** Minutes after midnight rounded down to the half hour (5:40 → 5:30). */
export function floorToStep(minutes: number, step = WINDOW_STEP_MIN): number {
  return Math.floor(minutes / step) * step;
}

/** Minutes after midnight rounded up to the half hour (21:05 → 21:30), never past the end of the day. */
export function ceilToStep(minutes: number, step = WINDOW_STEP_MIN): number {
  return Math.min(1439, Math.ceil(minutes / step) * step);
}

/** The maximum-price filter moves in $10 steps. */
export const PRICE_STEP = 10;

export function floorToPrice(usd: number): number {
  return Math.floor(usd / PRICE_STEP) * PRICE_STEP;
}

export function ceilToPrice(usd: number): number {
  return Math.ceil(usd / PRICE_STEP) * PRICE_STEP;
}
