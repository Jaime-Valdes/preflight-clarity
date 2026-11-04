import type { DayProvider } from "@/lib/flights/store";

/**
 * Where a day's schedule came from, in one quiet line (docs/REAL_DATA.md): AeroDataBox asks for the
 * credit on its free plan wherever its data shows, and the fares are never real.
 */
export function scheduleAttribution(provider: DayProvider | null): string {
  return provider === "aerodatabox" ? "Schedules: AeroDataBox · fares are illustrative" : "Illustrative schedule";
}

/** The line for several days at once (the compare table): the credit as soon as any of them is AeroDataBox's. */
export function scheduleAttributionFor(providers: ReadonlyArray<DayProvider | null>): string {
  return scheduleAttribution(providers.includes("aerodatabox") ? "aerodatabox" : "generator");
}
