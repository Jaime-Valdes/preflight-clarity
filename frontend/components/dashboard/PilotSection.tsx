"use client";

import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";
import { useTracker } from "@/lib/tracking";
import { PilotCard } from "./trust/PilotCard";
import { formatCount } from "./trust/format";

/** "Your pilots" — an Uber-style card for the captain and the first officer. */
export function PilotSection({ flight }: SectionProps) {
  const tracker = useTracker();
  const routeLabel = `${flight.origin.code} → ${flight.destination.code}`;
  const pilots = [flight.crew.captain, flight.crew.firstOfficer];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-ink-700">
        Two pilots fly every flight. Both are fully qualified on the {flight.aircraft.model} and cross-check
        each other&rsquo;s work from pushback to the gate.
      </p>
      {pilots.map((pilot) => (
        <PilotCard
          key={pilot.role}
          pilot={pilot}
          aircraftModel={flight.aircraft.model}
          routeLabel={routeLabel}
          onToggle={(open) =>
            tracker?.event("pilot_details", "pilot", open ? pilot.role : `${pilot.role} closed`)
          }
        />
      ))}
      <p className="text-xs leading-snug text-ink-500">
        Ratings and notes come from passenger feedback after past flights.
      </p>
    </div>
  );
}

/** "Capt. Sarah Lindqvist · ★ 4.9 · 14,200 hours" */
export function pilotTeaser(flight: Flight, ctx: SectionContext): string {
  void ctx;
  const captain = flight.crew.captain;
  // Non-breaking spaces keep "★ 4.9" and "14,200 hours" together when the teaser wraps.
  return `Capt. ${captain.name} · ★ ${captain.rating.toFixed(1)} · ${formatCount(captain.totalHours)} hours`;
}
