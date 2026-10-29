"use client";

import { Check, ChevronRight, Plane, Plus } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { formatDuration, formatTime12 } from "@preflight/shared/dates";
import type { Rating } from "@preflight/shared/ratings";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { flightContext } from "@/components/c/flight/copy";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { RatingButton } from "@/components/d/ratings/RatingSheet";
import { Pill } from "@/components/ui/Pill";
import { formatFare } from "@/lib/c/format";
import { MAX_COMPARE, type CompareItem } from "@/lib/c/model";
import { priceDeltaText } from "@/lib/d/view";
import { cn } from "@/lib/cn";

interface DResultCardProps {
  option: FlightOption;
  /** The flight as a compare-list item (its own route, date, key). */
  item: CompareItem;
  /** Whole days until departure: sets today's fare (fareAt). */
  daysUntil: number;
  /** The flight's four ratings in the visitor's priority order (orderByPriorities); the first two are shown. */
  ratings: readonly Rating[];
  /** The day's cheapest fare today, for "+$42 vs cheapest" (null with no flights). */
  cheapest: number | null;
  /** Leads the flights on screen for the visitor's priorities (ties all marked). */
  smoothestForYou: boolean;
  /** The visitor ranked their priorities: the marker and the ratings' label say "for you"; otherwise "overall". */
  chosen: boolean;
  /** Query parameters the Details link keeps (campaign tags from the link that opened the results). */
  campaign?: Record<string, string | undefined>;
  /** The airframe is assigned (≤ 1 day before departure): "assigned" instead of "scheduled". */
  airframe: boolean;
  /** 1-based place in the list, carried to the flight page (`?pos=`) for analytics. */
  position: number;
  inCompare: boolean;
  /** The compare list is full and this flight isn't in it. */
  compareLocked: boolean;
  /** Called with the toggle button (so the caller can keep it clear of the tray). */
  onToggleCompare: (control: HTMLButtonElement) => void;
}

/** How many of the visitor's ratings a card shows (the other two are on the flight page). */
const SHOWN_RATINGS = 2;

function dayOffset(offset: number): string | null {
  if (offset === 0) return null;
  return offset > 0 ? `+${offset}` : `−${Math.abs(offset)}`;
}

/**
 * One flight in version D's results (docs/ITERATION_2.md): airline and flight
 * number, the times, the two ratings that matter most to the visitor as calm
 * pills (a tap opens "what this means" and how it is worked out), the aircraft,
 * and the fare with its distance from the day's cheapest. No score, no
 * timeline, no forecast talk. Two separate actions — Compare (a toggle) and
 * Details (a link); the card itself is not a link.
 */
export function DResultCard({
  option,
  item,
  daysUntil,
  ratings,
  cheapest,
  smoothestForYou,
  chosen,
  campaign,
  airframe,
  position,
  inCompare,
  compareLocked,
  onToggleCompare,
}: DResultCardProps) {
  const hrefs = useHrefs();
  const { flight } = option;
  const titleId = useId();
  const noteId = useId();
  const depart = formatTime12(flight.departTime);
  const arrive = formatTime12(flight.arriveTime);
  const offset = dayOffset(flight.arriveDayOffset);
  const fare = fareAt(option, daysUntil);
  const fareText = formatFare(fare);
  const delta = priceDeltaText(fare, cheapest);
  const isCheapest = delta === "Cheapest";
  const flightLabel = flightContext(flight, item);
  const top = ratings.slice(0, SHOWN_RATINGS);
  // "For you" only once the visitor has said what matters; until then the lead is on the usual order.
  const smoothestText = chosen ? "Smoothest for you" : "Smoothest overall";

  return (
    <article aria-labelledby={titleId} className="rounded-3xl bg-surface p-4 shadow-soft ring-1 ring-line/80 sm:p-5">
      {/* Phones: one column — airline, times, ratings, aircraft, then the actions under a rule. Wider: the
          fare and actions move into a column on the right; the rest keeps its order on the left, with the
          ratings on a full-width row so even the longest label ("Slightly bumpy takeoff & landing") never
          has to be cut short. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_9rem] md:gap-x-5 lg:grid-cols-[minmax(0,1fr)_8.5rem] lg:gap-x-4 xl:gap-x-5">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start gap-3">
            <AirlineMark code={flight.airline.code} />
            <div className="min-w-0 flex-1">
              <h3 id={titleId} className="text-[15px] font-bold leading-snug text-ink-900 [overflow-wrap:anywhere]">
                {flight.airline.name}
                <span className="sr-only">
                  , {flight.flightNumber}, departs {depart}
                  {smoothestForYou ? `, ${smoothestText.toLowerCase()} of these flights` : ""}
                  {isCheapest ? ", cheapest this day" : ""}
                </span>
              </h3>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
                <span className="tabular-nums">{flight.flightNumber}</span>
                {smoothestForYou ? (
                  <span
                    aria-hidden
                    className="inline-flex items-center rounded-full bg-calm-50 px-2 py-0.5 text-[11px] font-semibold text-calm-700 ring-1 ring-inset ring-calm-100"
                  >
                    {smoothestText}
                  </span>
                ) : null}
              </p>
            </div>
            <p className="shrink-0 text-right md:hidden">
              <span className="block text-2xl font-bold leading-none text-ink-900 tabular-nums">{fareText}</span>
              <span className={cn("mt-1 block text-[11px] tabular-nums", isCheapest ? "font-semibold text-ink-700" : "text-ink-500")}>{delta}</span>
            </p>
          </div>

          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:max-w-[28rem]">
            <p>
              <span className="block whitespace-nowrap text-lg font-bold leading-none text-ink-900 tabular-nums">{depart}</span>
              <span className="mt-1 block text-xs text-ink-500">{flight.origin.code}</span>
            </p>
            <div className="min-w-0 text-center">
              <p className="whitespace-nowrap text-xs font-semibold text-ink-700 tabular-nums">{formatDuration(flight.blockMin)}</p>
              <div aria-hidden className="my-1 flex items-center gap-1 text-ink-300">
                <span className="h-px flex-1 bg-line" />
                <Plane className="size-3 rotate-45" />
                <span className="h-px flex-1 bg-line" />
              </div>
              <p className="text-[11px] text-ink-500">Nonstop</p>
            </div>
            <p className="text-right">
              <span className="block whitespace-nowrap text-lg font-bold leading-none text-ink-900 tabular-nums">
                {arrive}
                {offset ? (
                  <sup className="ml-0.5 text-[11px] font-semibold text-calm-700">
                    {offset}
                    <span className="sr-only"> day</span>
                  </sup>
                ) : null}
              </span>
              <span className="mt-1 block text-xs text-ink-500">{flight.destination.code}</span>
            </p>
          </div>

          {/* The ratings that matter most to this visitor, first one first. Each pill opens its detail sheet. */}
          <ul aria-label={chosen ? "Rated for you" : "Ratings"} className="flex flex-wrap gap-1.5">
            {top.map((rating) => (
              <li key={rating.category} className="max-w-full">
                <RatingButton rating={rating} flightLabel={flightLabel} from="results" size="sm" />
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-[13px] font-semibold text-ink-700">
              {flight.aircraft.fullName}
              <span className="font-normal text-ink-500"> · {airframe ? "assigned" : "scheduled"}</span>
            </span>
            {flight.aircraft.bodyType === "wide" ? <Pill tone="breeze">Wide-body</Pill> : null}
          </div>
        </div>

        {/* Fare and actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3 md:flex-col md:flex-nowrap md:items-stretch md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0 lg:pl-4 xl:pl-5">
          <p className="mb-1 hidden text-right md:block">
            <span className="block text-[26px] font-bold leading-none text-ink-900 tabular-nums">{fareText}</span>
            <span className={cn("mt-1 block text-[11px] tabular-nums", isCheapest ? "font-semibold text-ink-700" : "text-ink-500")}>{delta}</span>
          </p>
          <button
            type="button"
            aria-pressed={inCompare}
            aria-disabled={compareLocked || undefined}
            aria-describedby={compareLocked ? noteId : undefined}
            onClick={(e) => {
              if (!compareLocked) onToggleCompare(e.currentTarget);
            }}
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors",
              compareLocked
                ? "cursor-not-allowed bg-canvas text-ink-400 ring-line"
                : inCompare
                  ? "bg-calm-50 text-calm-700 ring-calm-200 hover:bg-calm-100"
                  : "bg-surface text-ink-900 ring-line-strong hover:bg-canvas",
            )}
          >
            {inCompare ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
            Compare
            <span className="sr-only"> {flight.flightNumber}</span>
          </button>
          {compareLocked ? (
            <p id={noteId} className="text-xs text-ink-500 md:text-center">
              Up to {MAX_COMPARE} flights
            </p>
          ) : null}
          <Link
            href={hrefs.flight(item, { ...campaign, pos: String(position) })}
            className="ml-auto inline-flex h-11 items-center justify-center gap-0.5 rounded-full pl-4 pr-3 text-sm font-semibold text-breeze-700 transition-colors hover:bg-breeze-50 md:ml-0"
          >
            Details
            <span className="sr-only"> for {flight.flightNumber}</span>
            <ChevronRight aria-hidden className="size-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
