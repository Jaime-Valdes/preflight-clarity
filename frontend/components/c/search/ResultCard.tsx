"use client";

import { Armchair, CalendarClock, Check, ChevronRight, Clock3, Plane, Plus } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { formatDuration, formatTime12 } from "@preflight/shared/dates";
import type { FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { ScoreBadge } from "@/components/c/common/ScoreBadge";
import { Sparkline } from "@/components/c/common/Sparkline";
import { Pill } from "@/components/ui/Pill";
import { formatFare } from "@/lib/c/format";
import { MAX_COMPARE, flightHref, type CompareItem } from "@/lib/c/model";
import { cn } from "@/lib/cn";
import { stretchesText, timelineLabel } from "./describe";

interface ResultCardProps {
  option: FlightOption;
  /** The flight as a compare-list item (route, date, key). */
  item: CompareItem;
  inCompare: boolean;
  /** The compare list is full and this flight isn't in it. */
  compareLocked: boolean;
  /** Called with the toggle button (so the caller can keep it in view). */
  onToggleCompare: (control: HTMLButtonElement) => void;
  /**
   * The flight's turbulence forecast is out (≤ 2 days before departure): show the score, the mini
   * timeline and the bump summary. Otherwise a calm marker says when they appear.
   */
  scores: boolean;
  /** For the marker: the day the forecast comes out ("Tue, Nov 24") and how long before departure that is. */
  forecastFrom: string;
  forecastLead: string;
}

function dayOffset(offset: number): string | null {
  if (offset === 0) return null;
  return offset > 0 ? `+${offset}` : `−${Math.abs(offset)}`;
}

/**
 * One flight in the results: airline, times, the scheduled aircraft, the
 * smoothness score with a mini turbulence timeline (once the forecast is out —
 * a calm "from …" marker before that), two quiet facts anyone can look up any
 * time (on-time record on the route; aircraft size and the airline's fleet
 * age), the illustrative fare, and two separate actions — Compare (a toggle)
 * and Details (a link). The card itself is not a link.
 */
export function ResultCard({
  option,
  item,
  inCompare,
  compareLocked,
  onToggleCompare,
  scores,
  forecastFrom,
  forecastLead,
}: ResultCardProps) {
  const { flight, fareUsd } = option;
  const titleId = useId();
  const noteId = useId();
  const depart = formatTime12(flight.departTime);
  const arrive = formatTime12(flight.arriveTime);
  const offset = dayOffset(flight.arriveDayOffset);
  const fare = formatFare(fareUsd);

  return (
    <article aria-labelledby={titleId} className="rounded-3xl bg-surface p-4 shadow-soft ring-1 ring-line/80 sm:p-5">
      {/* Phones: one column (airline, times, smoothness, aircraft, actions). Wider: three columns —
          the flight on the left, smoothness in the middle, fare and actions on the right. */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_13rem_8.5rem] md:grid-rows-[auto_auto_1fr] md:gap-x-5 md:gap-y-0 lg:grid-cols-[minmax(0,1fr)_12rem_8rem] lg:gap-x-4 xl:grid-cols-[minmax(0,1fr)_14rem_9rem] xl:gap-x-5">
        <div className="flex items-start gap-3 md:col-start-1 md:row-start-1">
          <AirlineMark code={flight.airline.code} />
          <div className="min-w-0 flex-1">
            <h3 id={titleId} className="text-[15px] font-bold leading-snug text-ink-900 [overflow-wrap:anywhere]">
              {flight.airline.name}
              <span className="sr-only">
                , {flight.flightNumber}, departs {depart}
              </span>
            </h3>
            <p className="mt-0.5 text-xs text-ink-500">{flight.flightNumber}</p>
          </div>
          <p className="shrink-0 text-right md:hidden">
            <span className="block text-xl font-bold leading-none text-ink-900 tabular-nums">{fare}</span>
            <span className="mt-1 block text-[11px] text-ink-500">one way</span>
          </p>
        </div>

        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 md:col-start-1 md:row-start-2 md:mt-4">
          <p>
            <span className="block whitespace-nowrap text-lg font-bold leading-none text-ink-900 tabular-nums">{depart}</span>
            <span className="mt-1 block text-xs text-ink-500">{flight.origin.code}</span>
          </p>
          <div className="min-w-0 text-center">
            <p className="whitespace-nowrap text-xs font-semibold text-ink-700 tabular-nums">{formatDuration(flight.blockMin)}</p>
            <div aria-hidden className="my-1 flex items-center gap-1 text-ink-300">
              <span className="h-px flex-1 bg-line-strong" />
              <Plane className="size-3 rotate-45" />
              <span className="h-px flex-1 bg-line-strong" />
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

        {/* Smoothness: score and label, then the turbulence timeline across the full width —
            or, before the forecast for this flight exists, when it will. */}
        {scores ? (
          <div className="rounded-2xl bg-canvas/70 p-3 ring-1 ring-inset ring-line/70 md:col-start-2 md:row-span-3 md:row-start-1 md:self-center">
            <ScoreBadge score={flight.smoothness.score} label={flight.smoothness.label} detail={stretchesText(flight)} />
            <Sparkline
              points={flight.turbulence.points}
              width={240}
              height={32}
              fluid
              label={timelineLabel(flight)}
              className="mt-3"
            />
            <p aria-hidden className="mt-1 flex justify-between text-[10px] font-semibold uppercase tracking-wide text-ink-400">
              <span>Takeoff</span>
              <span>Landing</span>
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-2xl bg-canvas/70 p-3 ring-1 ring-inset ring-line/70 md:col-start-2 md:row-span-3 md:row-start-1 md:self-center">
            <span
              aria-hidden
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100"
            >
              <CalendarClock className="size-4" />
            </span>
            <p className="min-w-0">
              <span className="block text-[13px] font-semibold leading-snug text-ink-700">
                Turbulence forecast from {forecastFrom}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">
                {forecastLead} · with its smoothness score
              </span>
            </p>
          </div>
        )}

        <div className="md:col-start-1 md:row-start-3 md:mt-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="text-[13px] font-semibold text-ink-700">
              {flight.aircraft.fullName}
              <span className="font-normal text-ink-500"> · scheduled</span>
            </span>
            {flight.aircraft.bodyType === "wide" ? <Pill tone="breeze">Wide-body</Pill> : null}
          </div>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-ink-500 sm:flex-row sm:flex-wrap sm:gap-x-4">
            <li className="flex items-start gap-1.5">
              <Clock3 aria-hidden className="mt-px size-3.5 shrink-0 text-ink-400" />
              <span>
                <span className="tabular-nums">{flight.airlineStats.onTimeRoutePct}%</span> on time on this route · last 12 months
              </span>
            </li>
            <li className="flex items-start gap-1.5">
              <Armchair aria-hidden className="mt-px size-3.5 shrink-0 text-ink-400" />
              <span>
                About <span className="tabular-nums">{flight.aircraft.typicalSeats}</span> seats · fleet average{" "}
                <span className="tabular-nums">{flight.aircraft.fleetAvgAgeYears.toFixed(1)}</span> years old
              </span>
            </li>
          </ul>
        </div>

        {/* Fare and actions */}
        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 pt-3 md:col-start-3 md:row-span-3 md:row-start-1 md:flex-col md:flex-nowrap md:items-stretch md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0 lg:pl-4 xl:pl-5">
          <p className="mb-1 hidden text-right md:block">
            <span className="block text-2xl font-bold leading-none text-ink-900 tabular-nums">{fare}</span>
            <span className="mt-1 block text-[11px] text-ink-500">one way · illustrative</span>
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
            href={flightHref(item)}
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
