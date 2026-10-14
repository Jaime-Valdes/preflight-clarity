// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `TurbulenceSection` (section body) and `turbulenceTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@/lib/types";

export function TurbulenceSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Turbulence details for {flight.flightNumber} are coming soon.</p>;
}

export function turbulenceTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
