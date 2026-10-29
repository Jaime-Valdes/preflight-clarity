"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { formatDuration, formatTime12 } from "@preflight/shared/dates";
import type { FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { hasLeft } from "@/components/c/common/availability";
import { ScoreBadge } from "@/components/c/common/ScoreBadge";
import { Card } from "@/components/ui/Card";
import { useNowMs } from "@/lib/hooks";
import { useCompareList, type CompareList } from "@/lib/c/compare-store";
import { formatFare } from "@/lib/c/format";
import { MAX_COMPARE, itemId, type CompareItem, type RouteDay } from "@/lib/c/model";
import { useHrefs, useTool } from "@/components/c/shell/ToolContext";
import { cn } from "@/lib/cn";
import { CompareToggle } from "./CompareToggle";
import { PendingNote } from "./PendingNote";
import { LINK_BASE, LINK_BUTTON, LINK_TONE, dayOffsetMark, dayOffsetWords, fareFor, monthDay } from "./copy";
import { track } from "@/lib/analytics";

/** How many other flights the page lists before "See all". */
const SHOWN = 5;

interface OtherFlightsProps {
  day: RouteDay;
  /** Every flight that day (the same results the search page shows). */
  options: readonly FlightOption[];
  /** The flight on this page — left out of the list. */
  currentKey: string;
  /** Whether flight-specific turbulence forecasts exist yet (within TURBULENCE_FORECAST_DAYS). */
  turbulence: boolean;
  /** Days from today to the day (0 = today): the fares shown move with the booking lead time (fareFor). */
  daysUntil: number;
  /** Anchor id, so the fare card can link here. */
  id: string;
  className?: string;
}

/** Smoothest first; equal scores by departure time. */
function smoothestFirst(a: FlightOption, b: FlightOption): number {
  return b.flight.smoothness.score - a.flight.smoothness.score || byDeparture(a, b);
}

function byDeparture(a: FlightOption, b: FlightOption): number {
  return a.flight.departTime.localeCompare(b.flight.departTime);
}

/**
 * Version C flight page: the day's other flights on the same route (top five,
 * then a link to all of them), each with Details and Compare. Smoothest first
 * with their scores once the day's turbulence forecasts exist; before that, by
 * departure time without scores, and a marker says when the forecasts start.
 * Flights that have already left are not offered.
 */
export function OtherFlights({ day, options, currentKey, turbulence, daysUntil, id, className }: OtherFlightsProps) {
  const list = useCompareList();
  const tool = useTool();
  const hrefs = useHrefs();
  const headingId = useId();
  const noteId = useId();
  const [announcement, setAnnouncement] = useState("");
  const nowMs = useNowMs();
  const leftCount = useMemo(() => options.filter((o) => hasLeft(o.flight, nowMs)).length, [options, nowMs]);
  const others = useMemo(
    () =>
      options
        .filter((o) => o.key !== currentKey && !hasLeft(o.flight, nowMs))
        .sort(turbulence ? smoothestFirst : byDeparture),
    [options, currentKey, turbulence, nowMs],
  );
  const shown = others.slice(0, SHOWN);

  const toggle = (item: CompareItem, label: string) => {
    const wasIn = list.has(itemId(item));
    track(`${tool.events}_compare_toggle`, { from: "other_flights", added: !wasIn, key: item.key });
    if (!list.toggle(item)) {
      setAnnouncement(`You can compare up to ${MAX_COMPARE} flights.`);
      return;
    }
    setAnnouncement(
      wasIn
        ? `Removed ${label} from compare.`
        : `Added ${label} to compare. ${list.items.length + 1} of ${MAX_COMPARE} flights picked.`,
    );
  };

  return (
    <section id={id} aria-labelledby={headingId} className={cn("scroll-mt-4", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
        <h2 id={headingId} className="text-lg font-bold leading-tight text-ink-900">
          Other flights this day
        </h2>
        <p className="text-xs text-ink-500">
          {turbulence ? "Smoothest first" : "By departure time"} · prices are illustrative
        </p>
      </div>
      {!turbulence && shown.length > 0 ? (
        <PendingNote item="turbulence" date={day.date} subject="Smoothness scores" className="mt-2 px-1" />
      ) : null}

      {shown.length === 0 ? (
        <Card className="mt-3">
          <p className="text-sm leading-relaxed text-ink-700">
            {leftCount > 0
              ? "No other nonstop flight on this route is still to leave that day."
              : "This is the only nonstop flight on this route that day."}
          </p>
        </Card>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          {shown.map((option) => (
            <li key={option.key}>
              <OtherFlightRow
                option={option}
                day={day}
                daysUntil={daysUntil}
                list={list}
                noteId={noteId}
                showScore={turbulence}
                onToggle={toggle}
              />
            </li>
          ))}
        </ul>
      )}

      {list.isFull ? (
        <p id={noteId} className="mt-3 px-1 text-xs leading-snug text-ink-500">
          Up to {MAX_COMPARE} flights can be compared. Remove one from your compare list to add another.
        </p>
      ) : null}

      <Link href={hrefs.search(day)} className={cn(LINK_BUTTON.secondary, "mt-4 w-full sm:w-auto")}>
        {leftCount > 0 ? `See all flights on ${monthDay(day.date)}` : `See all ${options.length} flights on ${monthDay(day.date)}`}
        <ArrowRight aria-hidden className="size-4" />
      </Link>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

interface OtherFlightRowProps {
  option: FlightOption;
  day: RouteDay;
  daysUntil: number;
  list: CompareList;
  noteId: string;
  /** Only once flight-specific turbulence forecasts exist. */
  showScore: boolean;
  onToggle: (item: CompareItem, label: string) => void;
}

function OtherFlightRow({ option, day, daysUntil, list, noteId, showScore, onToggle }: OtherFlightRowProps) {
  const hrefs = useHrefs();
  const f = option.flight;
  // The flight's own airports (a search from LGA can list JFK's long-haul flights): one flight, one compare item.
  const item: CompareItem = { origin: f.origin.code, destination: f.destination.code, date: day.date, key: option.key };
  const picked = list.has(itemId(item));
  const label = `${f.flightNumber}, ${formatTime12(f.departTime)}`;
  const offset = dayOffsetMark(f.arriveDayOffset);
  const offsetWords = dayOffsetWords(f.arriveDayOffset);

  return (
    <div className="rounded-3xl bg-surface p-4 shadow-soft ring-1 ring-line/80 sm:flex sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <AirlineMark code={f.airline.code} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-snug text-ink-900 tabular-nums">
            {formatTime12(f.departTime)} → {formatTime12(f.arriveTime)}
            {offset ? (
              <>
                <sup aria-hidden className="ml-0.5 text-[11px] font-semibold text-calm-700">
                  {offset}
                </sup>
                <span className="sr-only"> ({offsetWords})</span>
              </>
            ) : null}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-500 [overflow-wrap:anywhere]">
            {f.airline.name} · <span className="whitespace-nowrap tabular-nums">{f.flightNumber}</span>
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            {showScore ? <ScoreBadge score={f.smoothness.score} label={f.smoothness.label} size="sm" /> : null}
            <span className="text-xs text-ink-500 tabular-nums">{formatDuration(f.blockMin)} · Nonstop</span>
          </div>
        </div>
        <p className="shrink-0 text-right text-base font-bold leading-snug text-ink-900 tabular-nums">
          {formatFare(fareFor(option, daysUntil))}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex sm:shrink-0">
        <Link href={hrefs.flight(item)} className={cn(LINK_BASE, LINK_TONE.secondary, "h-11 px-4")}>
          Details<span className="sr-only"> for {label}</span>
        </Link>
        <CompareToggle
          pressed={picked}
          disabled={list.isFull && !picked}
          describedBy={list.isFull && !picked ? noteId : undefined}
          flightLabel={label}
          onToggle={() => onToggle(item, label)}
        />
      </div>
    </div>
  );
}
