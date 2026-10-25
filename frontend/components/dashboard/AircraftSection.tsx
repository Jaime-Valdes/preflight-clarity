"use client";

import { Check, ChevronDown, CircleCheck, Plane } from "lucide-react";
import { Fragment, useId, useState } from "react";
import { availabilityFor } from "@preflight/shared/forecast";
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { useTracker } from "@/lib/tracking";
import { BenchmarkLine, benchmarkValue } from "@/components/c/flight/BenchmarkLine";
import { Pill } from "@/components/ui/Pill";
import { Stat } from "@/components/ui/Stat";
import { BlockLabel } from "./trust/BlockLabel";
import { PlaneSilhouette } from "./trust/PlaneSilhouette";
import { Reveal } from "./trust/Reveal";
import { ageLabel, ageRangeLabel, ageValue, cabinNoiseBand, formatCount, possessive, yearsNumber } from "./trust/format";

const BODY_LABEL = { narrow: "Narrow-body", wide: "Wide-body" } as const;
const AISLE_LABEL = { narrow: "Single-aisle cabin", wide: "Twin-aisle cabin" } as const;

/**
 * "Your aircraft" — the scheduled model, the assigned airframe once it is known
 * (about a day before departure), the rules on inspections and the model's record.
 * No maintenance records: they aren't public (docs/FEASIBILITY.md). Ages sit next
 * to the global fleet average and the cabin-noise band next to the typical jet
 * cabin (shared/src/benchmarks.ts), so the figures mean something on their own.
 */
export function AircraftSection({ flight, ctx }: SectionProps) {
  const tracker = useTracker();
  const { aircraft } = flight;
  const assigned = availabilityFor(ctx.daysUntil).airframe;
  const noise = cabinNoiseBand(aircraft.cabinNoiseDb);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const explainerId = useId();

  function toggleExplainer() {
    const next = !explainerOpen;
    setExplainerOpen(next);
    tracker?.event("maintenance_explainer", "aircraft", next ? "open" : "close");
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Model + silhouette */}
      <div className="rounded-2xl bg-linear-to-b from-breeze-50 to-surface px-4 pt-4 pb-2 ring-1 ring-inset ring-line/70">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          {assigned ? "Aircraft type" : "Scheduled aircraft"}
        </div>
        <div className="mt-0.5 text-lg font-bold leading-tight text-ink-900">
          {aircraft.fullName.split(" ").map((word, i) => (
            <Fragment key={i}>
              {i > 0 ? " " : null}
              <span className="whitespace-nowrap">{word}</span>
            </Fragment>
          ))}
        </div>
        <div className="mt-2">
          <Pill tone="breeze" icon={<Plane aria-hidden className="size-3.5" />}>
            {BODY_LABEL[aircraft.bodyType]}
          </Pill>
        </div>
        <div className="mt-2 text-xs leading-snug text-ink-500">
          {AISLE_LABEL[aircraft.bodyType]} · {aircraft.seatLayout} seating · about {aircraft.typicalSeats} seats
        </div>
        <div className="mt-1 flex justify-center">
          <PlaneSilhouette bodyType={aircraft.bodyType} name={aircraft.fullName} />
        </div>
      </div>

      {/* The airframe: assigned about a day before departure; until then, the airline's fleet of this model */}
      <div className="rounded-2xl bg-canvas/70 px-3.5 py-3 ring-1 ring-inset ring-line/70">
        {assigned ? (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Assigned aircraft</div>
            <div className="mt-1 text-[15px] font-bold leading-snug text-ink-900">
              <span className="tabular-nums">{aircraft.tailNumber}</span> ·{" "}
              <span className="whitespace-nowrap tabular-nums">{ageValue(aircraft.ageYears)} old</span>
            </div>
            <div className="mt-0.5 text-xs leading-snug text-ink-500">
              Delivered in <span className="tabular-nums">{aircraft.deliveredYear}</span> · can change before departure
            </div>
            <BenchmarkLine benchmark="fleetAgeYears" value={aircraft.ageYears} className="mt-1.5" />
          </>
        ) : (
          <>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Fleet age</div>
            <div className="mt-1 text-[15px] font-bold leading-snug text-ink-900">
              {possessive(flight.airline.name)} {aircraft.model}s: average{" "}
              <span className="whitespace-nowrap tabular-nums">{yearsNumber(aircraft.fleetAvgAgeYears)} years old</span>{" "}
              <span className="whitespace-nowrap font-semibold text-ink-500 tabular-nums">
                ({ageRangeLabel(aircraft.fleetAgeRange)})
              </span>
            </div>
            <div className="mt-0.5 text-xs leading-snug text-ink-500">
              The exact plane is assigned about a day before departure.
            </div>
            <BenchmarkLine benchmark="fleetAgeYears" value={aircraft.fleetAvgAgeYears} className="mt-1.5" />
          </>
        )}
      </div>

      {/* Facts about the model */}
      <div>
        <BlockLabel>The {aircraft.model}</BlockLabel>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="Flying since" value={aircraft.modelInServiceSince} hint={`${aircraft.model} model`} />
          <Stat label="Worldwide" value={`about ${formatCount(aircraft.modelFleetSize)}`} hint={`${aircraft.model}s in service`} />
          {/* The noise is a band, not a reading (docs/FEASIBILITY.md): the typical cabin sits beside it, no verdict. */}
          <Stat
            label="Cabin noise"
            value={noise.label}
            hint={
              <>
                {capitalize(noise.range)}, louder near the engines.
                <span className="mt-0.5 block tabular-nums">Typical jet cabin {benchmarkValue("cabinNoiseDb")}</span>
              </>
            }
          />
          <Stat
            label="Cruise altitude"
            value={`${formatCount(aircraft.cruiseAltitudeFt)} ft`}
            hint="Typical · above most clouds and weather"
          />
        </div>
      </div>

      {/* Inspections: the rule, not a records readout */}
      <div className="rounded-2xl bg-calm-50 p-4 ring-1 ring-inset ring-calm-100">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-calm-600 ring-1 ring-inset ring-calm-100"
          >
            <CircleCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-calm-700">Maintenance</div>
            <p className="mt-0.5 text-sm font-semibold leading-snug text-ink-900">
              By law, an airliner can only fly when every required inspection is complete and signed off.
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-expanded={explainerOpen}
          aria-controls={explainerId}
          onClick={toggleExplainer}
          className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-surface/80 px-3.5 text-left text-sm font-semibold text-calm-700 ring-1 ring-inset ring-calm-100 transition-colors active:bg-surface"
        >
          <span>What&rsquo;s an A-check?</span>
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0 transition-transform duration-300", explainerOpen && "rotate-180")}
          />
        </button>
        <Reveal open={explainerOpen} id={explainerId}>
          <p className="pt-3 text-sm leading-relaxed text-ink-700">
            An A-check is a routine, scheduled inspection that airliners get roughly every 600&ndash;1,000 flight
            hours &mdash; every few months, depending on the model. Engineers work through a checklist covering the
            engines, landing gear, cabin systems and flight controls, and replace anything that is due. On top of
            that, the plane gets a walk-around inspection before every flight, and much deeper checks every few
            years.
          </p>
        </Reveal>
      </div>

      {/* Model record */}
      {aircraft.safetyRecord.length > 0 ? (
        <div>
          <BlockLabel>About the {aircraft.model}</BlockLabel>
          <ul className="mt-2 flex flex-col gap-2">
            {aircraft.safetyRecord.map((line) => (
              <li key={line} className="flex items-start gap-2.5 text-sm leading-snug text-ink-700">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-calm-500" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "Airbus A321neo · narrow-body · 6 years old" once assigned; "… · fleet average 3.4 years" before. */
export function aircraftTeaser(flight: Flight, ctx: SectionContext): string {
  const { aircraft } = flight;
  const base = `${aircraft.fullName} · ${aircraft.bodyType}-body`;
  if (availabilityFor(ctx.daysUntil).airframe) return `${base} · ${ageLabel(aircraft.ageYears)}`;
  return `${base} · fleet average ${yearsNumber(aircraft.fleetAvgAgeYears)} years`;
}
