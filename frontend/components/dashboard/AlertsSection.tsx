// STUB — owned by a dashboard-section agent, which replaces this whole file.
// Contract: export `AlertsSection` (section body) and `alertsTeaser` (one-line collapsed teaser).
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";

export function AlertsSection({ flight }: SectionProps) {
  return <p className="text-sm text-ink-500">Alerts details for {flight.flightNumber} are coming soon.</p>;
}

export function alertsTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "";
}
