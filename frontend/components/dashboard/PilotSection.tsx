"use client";

import { Check, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { useTracker } from "@/lib/tracking";
import { BlockLabel } from "./trust/BlockLabel";
import { crewFacts, crewTeaserLine } from "./trust/crew";
import { Reveal } from "./trust/Reveal";
import { RoleCard } from "./trust/RoleCard";

/**
 * "Who flies your plane" — the flight-deck roles on this flight and the rules
 * every airline pilot meets (docs/FEASIBILITY.md). No names, hours or ratings:
 * airlines don't publish who will fly a given flight.
 */
export function PilotSection({ flight }: SectionProps) {
  const tracker = useTracker();
  const { crew, aircraft } = flight;
  const facts = crewFacts(crew, aircraft.model);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const explainerId = useId();

  function toggleExplainer() {
    const next = !explainerOpen;
    setExplainerOpen(next);
    tracker?.event("pilot_details", "pilot", next ? "training" : "training closed");
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-ink-700">
        {crew.pilots > 2
          ? `At least two pilots fly every airline flight. A flight this long carries ${crew.pilots}, so they can take turns resting. All of them are licensed and type-rated on the ${aircraft.model} and cross-check each other from pushback to the gate.`
          : `At least two pilots fly every airline flight. Both are licensed and type-rated on the ${aircraft.model} and cross-check each other from pushback to the gate.`}
      </p>

      {facts.roles.map((role) => (
        <RoleCard key={role.role} facts={role} />
      ))}

      <div className="rounded-2xl bg-dusk-50/60 p-4 ring-1 ring-inset ring-dusk-100">
        <BlockLabel>Every pilot on board</BlockLabel>
        <ul className="mt-2 flex flex-col gap-1.5">
          {facts.everyPilot.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm leading-snug text-ink-700">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-calm-500" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-expanded={explainerOpen}
          aria-controls={explainerId}
          onClick={toggleExplainer}
          className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-surface/80 px-3.5 text-left text-sm font-semibold text-dusk-700 ring-1 ring-inset ring-dusk-100 transition-colors active:bg-surface"
        >
          <span>How pilots are trained and checked</span>
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0 transition-transform duration-300", explainerOpen && "rotate-180")}
          />
        </button>
        <Reveal open={explainerOpen} id={explainerId}>
          <div className="flex flex-col gap-2 pt-3 text-sm leading-relaxed text-ink-700">
            {facts.training.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </Reveal>
      </div>

      <p className="text-xs leading-snug text-ink-500">
        Airlines don&rsquo;t publish who will fly a given flight &mdash; these are the rules every airline pilot meets.
      </p>
    </div>
  );
}

/** "2 pilots · licensed and type-rated on the A321neo" */
export function pilotTeaser(flight: Flight, ctx: SectionContext): string {
  void ctx;
  return crewTeaserLine(flight.crew, flight.aircraft.model);
}
