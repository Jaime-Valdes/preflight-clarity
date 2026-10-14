"use client";

import { Check, ChevronDown, CircleCheck, Plane } from "lucide-react";
import { Fragment, useId, useState } from "react";
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { useTracker } from "@/lib/tracking";
import { Pill } from "@/components/ui/Pill";
import { Stat } from "@/components/ui/Stat";
import { BlockLabel } from "./trust/BlockLabel";
import { PlaneSilhouette } from "./trust/PlaneSilhouette";
import { Reveal } from "./trust/Reveal";
import { ageLabel, ageValue, daysAgo, formatCount, inDays } from "./trust/format";

const BODY_LABEL = { narrow: "Narrow-body", wide: "Wide-body" } as const;
const AISLE_LABEL = { narrow: "Single-aisle cabin", wide: "Twin-aisle cabin" } as const;

/** "Your aircraft" — the model, this specific airframe, its maintenance status and the model's record. */
export function AircraftSection({ flight }: SectionProps) {
  const tracker = useTracker();
  const { aircraft } = flight;
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
        <div className="text-lg font-bold leading-tight text-ink-900">
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

      {/* Facts about this specific airframe and the model */}
      <div>
        <BlockLabel>This plane</BlockLabel>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="Age" value={ageValue(aircraft.ageYears)} hint={`Delivered in ${aircraft.deliveredYear}`} />
          <Stat label="Tail number" value={aircraft.tailNumber} hint="Its registration" />
          <Stat label="Flying since" value={aircraft.modelInServiceSince} hint={`${aircraft.model} model`} />
          <Stat label="Worldwide" value={formatCount(aircraft.modelFleetSize)} hint={`${aircraft.model}s in service`} />
          <Stat label="Cabin noise" value={`${aircraft.cabinNoiseDb} dB`} hint={flight.airlineStats.cabinNoise} />
          <Stat label="Cruise altitude" value={`${formatCount(aircraft.cruiseAltitudeFt)} ft`} hint="Above most weather" />
        </div>
      </div>

      {/* Maintenance */}
      <div className="rounded-2xl bg-calm-50 p-4 ring-1 ring-inset ring-calm-100">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface text-calm-600 ring-1 ring-inset ring-calm-100"
          >
            <CircleCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-calm-700">Maintenance</div>
            <div className="text-sm font-bold leading-snug text-ink-900">{aircraft.maintenanceStatus}</div>
          </div>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5 text-sm text-ink-700">
          <li className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">Last full inspection</span>
            <span className="shrink-0 whitespace-nowrap font-semibold text-ink-900 tabular-nums">
              {daysAgo(aircraft.lastInspectionDaysAgo)}
            </span>
          </li>
          <li className="flex items-baseline justify-between gap-3">
            <span className="min-w-0">
              Next routine <span className="whitespace-nowrap">{aircraft.lastCheckType}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap font-semibold text-ink-900 tabular-nums">
              {inDays(aircraft.nextCheckDueDays)}
            </span>
          </li>
        </ul>
        <button
          type="button"
          aria-expanded={explainerOpen}
          aria-controls={explainerId}
          onClick={toggleExplainer}
          className="mt-3 flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-surface/80 px-3.5 text-left text-sm font-semibold text-calm-700 ring-1 ring-inset ring-calm-100 transition-colors active:bg-surface"
        >
          <span>What&rsquo;s an {aircraft.lastCheckType}?</span>
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0 transition-transform duration-300", explainerOpen && "rotate-180")}
          />
        </button>
        <Reveal open={explainerOpen} id={explainerId}>
          <p className="pt-3 text-sm leading-relaxed text-ink-700">
            An {aircraft.lastCheckType} is a routine, scheduled inspection that airliners get every few weeks of
            flying. Engineers work through a checklist covering the engines, landing gear, cabin systems and
            flight controls, and replace anything that is due. It is one layer of a schedule that also includes a
            walk-around by the pilots before every flight and much deeper checks every few years.
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

/** "Airbus A321neo · narrow-body · 6 years old" */
export function aircraftTeaser(flight: Flight, ctx: SectionContext): string {
  void ctx;
  const { aircraft } = flight;
  return `${aircraft.fullName} · ${aircraft.bodyType}-body · ${ageLabel(aircraft.ageYears)}`;
}
