// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `CompareSection` (section body) and `compareTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";

export function CompareSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Compare details for {flight.flightNumber} are coming soon.</p>;
}

export function compareTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
