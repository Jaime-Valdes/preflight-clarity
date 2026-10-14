// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `PilotSection` (section body) and `pilotTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";

export function PilotSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Pilot details for {flight.flightNumber} are coming soon.</p>;
}

export function pilotTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
