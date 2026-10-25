"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { availabilityFor, getForecastStatus } from "@preflight/shared/forecast";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import type { SectionContext } from "@preflight/shared/types";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ExploreContext, type ExploreApi } from "@/components/dashboard/explore/context";
import { SummaryCard } from "@/components/dashboard/SummaryCard";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { searchHref, type CompareItem, type RouteDay } from "@/lib/c/model";
import { daysToDeparture } from "@/components/c/common/availability";
import { flightContext, monthDay, routeText } from "./copy";
import { FareCard } from "./FareCard";
import { FlightSections } from "./FlightSections";
import { OtherFlights } from "./OtherFlights";
import { track } from "@/lib/analytics";

interface FlightDetailProps {
  day: RouteDay;
  option: FlightOption;
  /** Every flight that day, for "Other flights this day". */
  options: readonly FlightOption[];
  /** "YYYY-MM-DD", already known to be on or before the flight's date. */
  today: string;
  /** 1-based place in the results list this flight was opened from (analytics only); null when opened another way. */
  position: number | null;
}

const OTHERS_ID = "other-flights";

/** Version C has no exploration strip: the sections only need neutral copy and somewhere to keep their state. */
function noop(): void {}

/**
 * Version C: one flight in full — the dashboard header, smoothness summary and
 * safety sections (reused as-is), the illustrative fare with "Add to compare",
 * and the day's other flights. Laptop: sections left, summary and fare in a
 * sticky column on the right. Mount it with a key per flight so the sections'
 * state starts fresh for each one.
 */
export function FlightDetail({ day, option, options, today, position }: FlightDetailProps) {
  const { flight } = option;
  // The flight's own airports: a search from LGA can list JFK's long-haul flights, and one flight is one compare item.
  const item: CompareItem = { origin: flight.origin.code, destination: flight.destination.code, date: day.date, key: option.key };
  // The real distance from today: the sections show only what exists by then (docs/FEASIBILITY.md).
  const daysUntil = daysToDeparture(today, flight.input.date);
  const history = flight.turbulence.history;
  const ctx = useMemo<SectionContext>(
    () => ({ daysUntil, forecast: getForecastStatus(daysUntil, history), variant: "A", preview: false }),
    [daysUntil, history],
  );
  const availability = availabilityFor(daysUntil);

  // Where this flight stands among the day's results, for analytics: its fare at this lead time and
  // whether it is the cheapest / smoothest of them (smoothness only once the forecast is out).
  const price = fareAt(option, daysUntil);
  const isCheapest = options.every((o) => fareAt(o, daysUntil) >= price);
  const score = availability.turbulence ? flight.smoothness.score : null;
  const isSmoothest = score === null ? null : options.every((o) => o.flight.smoothness.score <= score);
  useEffect(() => {
    track("c_flight_view", {
      key: option.key,
      origin: flight.origin.code,
      destination: flight.destination.code,
      days_until: daysUntil,
      has_scores: availability.turbulence,
      smoothness_score: score,
      price,
      is_cheapest: isCheapest,
      is_smoothest: isSmoothest,
      position,
    });
  }, [option.key, flight.origin.code, flight.destination.code, daysUntil, availability.turbulence, score, price, isCheapest, isSmoothest, position]);

  // What the section bodies keep for this flight (the chosen seat…); see useFlightState.
  const [bodyState, setBodyState] = useState<Readonly<Record<string, unknown>>>({});
  const explore = useMemo<ExploreApi>(
    () => ({
      openAlternative: noop,
      canOpen: () => false,
      openWhatIf: noop,
      switchTo: noop,
      compare: noop,
      // Neutral copy everywhere: "this flight", never "your flight".
      showingOwnFlight: false,
      flightState: (key: string) => bodyState[key],
      setFlightState: (key: string, value: unknown) => setBodyState((prev) => ({ ...prev, [key]: value })),
    }),
    [bodyState],
  );

  return (
    <div className="mx-auto w-full max-w-[640px] lg:max-w-none">
      <Link
        href={searchHref(day)}
        className="-ml-2 inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-sm font-semibold text-ink-700 transition-colors hover:text-ink-900"
      >
        <ChevronLeft aria-hidden className="size-4 shrink-0" />
        <span>
          All flights {routeText(day.origin, day.destination)}, {monthDay(day.date)}
        </span>
      </Link>

      <ExploreContext.Provider value={explore}>
        <div className="mt-2 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-8">
          {/* Focus lands here when another flight is opened from this page (see FlightPage). */}
          <div data-flight-top tabIndex={-1} className="min-w-0 rounded-3xl outline-none lg:col-start-1 lg:row-start-1">
            {/* The real distance both ways: the gate shows only on the day, the assigned aircraft only a day ahead. */}
            <DashboardHeader
              flight={flight}
              daysUntil={daysUntil}
              briefingDaysUntil={daysUntil}
              label="Flight details"
              className="animate-fade-up"
            />
          </div>

          <div className="min-w-0 lg:col-start-2 lg:row-span-3 lg:row-start-1">
            <div className="flex flex-col gap-4 lg:sticky lg:top-6">
              <SummaryCard flight={flight} ctx={ctx} className="animate-fade-up [animation-delay:60ms]" />
              <FareCard
                option={option}
                item={item}
                daysUntil={daysUntil}
                othersHref={`#${OTHERS_ID}`}
                className="animate-fade-up [animation-delay:90ms]"
              />
            </div>
          </div>

          <div className="min-w-0 animate-fade-up [animation-delay:120ms] lg:col-start-1">
            <p className="mb-3 mt-2 px-1 text-[13px] leading-snug text-ink-500 lg:mt-0">
              Pre-flight information for this flight. Open as much or as little as you like.
            </p>
            <FlightSections flight={flight} ctx={ctx} />
          </div>

          <OtherFlights
            id={OTHERS_ID}
            day={day}
            options={options}
            currentKey={option.key}
            turbulence={availability.turbulence}
            daysUntil={daysUntil}
            className="mt-6 min-w-0 lg:col-start-1 lg:mt-4"
          />

          {/* After the sections and the other flights (docs/INTEREST.md). */}
          <InterestCard placement="c_flight" context={flightContext(flight, day)} className="mt-2 min-w-0 lg:col-start-1" />
        </div>
      </ExploreContext.Provider>
    </div>
  );
}
