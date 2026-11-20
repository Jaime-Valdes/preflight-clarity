"use client";

import { createContext, useContext } from "react";
import { ON_TIME_DEFINITION, onTimeMissing, onTimeSource, type AirlineOnTime } from "@preflight/shared/onTime";
import type { SectionProps } from "@preflight/shared/types";
import { BenchmarkLine } from "@/components/c/flight/BenchmarkLine";
import { AirlineSection } from "@/components/dashboard/AirlineSection";
import { BlockLabel } from "@/components/dashboard/trust/BlockLabel";
import { MeterBar } from "@/components/dashboard/trust/MeterBar";

/*
 * Version D's airline section under "More detail": the shared section with its on-time block
 * replaced by the US DOT's figures (docs/REAL_DATA.md, "Status: airline on-time from BTS"), or by
 * a plain line where there are none. The flight page provides the record through the context, so
 * the section body stays one module-level component (FlightSections keeps its state).
 */

/** The flight's on-time record as the flight page looked it up (null: the day came without figures). */
export const DOnTimeContext = createContext<AirlineOnTime | null>(null);

export function DAirlineSection(props: SectionProps) {
  const record = useContext(DOnTimeContext);
  return <AirlineSection {...props} onTime={<DOnTimeBlock flight={props.flight} record={record} />} />;
}

function DOnTimeBlock({ flight, record }: { flight: SectionProps["flight"]; record: AirlineOnTime | null }) {
  if (!record || record.network === null) {
    const missing = onTimeMissing(record);
    return (
      <div>
        <BlockLabel>On-time arrivals</BlockLabel>
        <div className="mt-2 rounded-2xl bg-canvas/70 p-4 ring-1 ring-inset ring-line/70">
          <p className="text-sm font-semibold leading-snug text-ink-700">{missing.main}</p>
          <p className="mt-1 text-xs leading-snug text-ink-500">{missing.sub}.</p>
        </div>
      </div>
    );
  }
  return (
    <div>
      <BlockLabel>On-time arrivals</BlockLabel>
      <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-canvas/70 p-4 ring-1 ring-inset ring-line/70">
        <MeterBar
          label={`Across the airline’s US flights · ${record.period}`}
          value={record.network}
          hint={<BenchmarkLine benchmark="onTimePct" value={record.network} against={record.industry} />}
        />
        {record.route !== null ? (
          <MeterBar
            label={`On this route · ${flight.origin.code} → ${flight.destination.code} · ${record.period}`}
            value={record.route}
            hint={<BenchmarkLine benchmark="onTimePct" value={record.route} against={record.industry} />}
          />
        ) : null}
        <p className="text-xs leading-snug text-ink-500">
          {ON_TIME_DEFINITION} The US industry average counts every reporting airline&rsquo;s flights over the same months.
        </p>
        <p className="text-xs leading-snug text-ink-500">{onTimeSource(record.period)}</p>
      </div>
    </div>
  );
}
