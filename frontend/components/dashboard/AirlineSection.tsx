// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `AirlineSection` (section body) and `airlineTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";

export function AirlineSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Airline details for {flight.flightNumber} are coming soon.</p>;
}

export function airlineTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
