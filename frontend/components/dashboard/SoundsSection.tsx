// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `SoundsSection` (section body) and `soundsTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";

export function SoundsSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Sounds details for {flight.flightNumber} are coming soon.</p>;
}

export function soundsTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
