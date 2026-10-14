// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `WeatherSection` (section body) and `weatherTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";

export function WeatherSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Weather details for {flight.flightNumber} are coming soon.</p>;
}

export function weatherTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
