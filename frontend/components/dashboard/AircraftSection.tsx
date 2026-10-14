// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `AircraftSection` (section body) and `aircraftTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";

export function AircraftSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Aircraft details for {flight.flightNumber} are coming soon.</p>;
}

export function aircraftTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
