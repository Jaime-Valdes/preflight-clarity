/*
 * Version C formatting helpers. Pure — safe in render.
 */

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** 1248 → "$1,248". */
export function formatFare(usd: number): string {
  return USD.format(Math.round(usd));
}

/** "Morning" etc. for the departure-time filter, from "HH:MM" (Expedia-style buckets). */
export type TimeBucket = "night" | "morning" | "afternoon" | "evening";
export const TIME_BUCKETS: readonly TimeBucket[] = ["morning", "afternoon", "evening", "night"];
export const TIME_BUCKET_LABELS: Record<TimeBucket, { label: string; range: string }> = {
  morning: { label: "Morning", range: "5:00 AM – 11:59 AM" },
  afternoon: { label: "Afternoon", range: "12:00 PM – 5:59 PM" },
  evening: { label: "Evening", range: "6:00 PM – 11:59 PM" },
  night: { label: "Night", range: "12:00 AM – 4:59 AM" },
};

export function timeBucket(hhmm: string): TimeBucket {
  const hour = Number(hhmm.slice(0, 2));
  if (hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
