// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `SeatSection` (section body) and `seatTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";

export function SeatSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Seat details for {flight.flightNumber} are coming soon.</p>;
}

export function seatTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
