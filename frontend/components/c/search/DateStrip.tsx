"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { addDays, formatLongDate } from "@preflight/shared/dates";
import { TURBULENCE_FORECAST_DAYS } from "@preflight/shared/forecast";
import { fareAt, type DayOverview } from "@preflight/shared/search";
import { availabilityAt, daysToDeparture, hasLeft } from "@/components/c/common/availability";
import { useFlightSource } from "@/components/c/shell/ToolContext";
import { formatFare } from "@/lib/c/format";
import { clampDate, MAX_DAYS_AHEAD, type RouteDay } from "@/lib/c/model";
import type { FlightSource } from "@/lib/flights/source";
import { cn } from "@/lib/cn";
import { monthDay, weekday } from "./describe";

const DAYS = 7;

/** Seven days centred on `date`, kept inside the searchable window (today … today + MAX_DAYS_AHEAD). */
export function stripDates(date: string, today: string): string[] {
  const max = addDays(today, MAX_DAYS_AHEAD);
  // The first day: centred on the date, then pulled inside the window at either end.
  let start = clampDate(addDays(date, -Math.floor(DAYS / 2)), today);
  if (addDays(start, DAYS - 1) > max) start = addDays(max, -(DAYS - 1));
  return Array.from({ length: DAYS }, (_, i) => addDays(start, i));
}

interface DateStripProps {
  /** The day on screen. */
  day: RouteDay;
  /**
   * The day the strip is computed for — the deferred copy of `day` (null on
   * first paint). While it lags behind, the strip keeps showing the previous
   * days with the new one highlighted.
   */
  stripDay: RouteDay | null;
  today: string;
  /** useNowMs(): today's tile only counts the flights still to leave. */
  nowMs: number | null;
  /** Link for another date (keeps sort and filters). */
  hrefFor: (date: string) => string;
  /**
   * Show each day's best smoothness score once its forecast is out (version C). Version D passes
   * false: every day shows its number of flights instead, and no score appears anywhere on the strip.
   */
  showScores?: boolean;
}

/**
 * Nearby dates: weekday and date, that day's lowest fare today (fareAt: the
 * booking lead time moves fares), and — only for days whose turbulence
 * forecast is out (within 2 days of today) — the best smoothness score; other
 * days show how many nonstop flights there are. Each day is a link. Quieter
 * than the result cards (no shadow, a thin ring), with the chosen day in navy.
 * Computed one tile at a time after the day's own results, so the first paint
 * isn't held up.
 */
export function DateStrip({ day, stripDay, today, nowMs, hrefFor, showScores = true }: DateStripProps) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  // Each tile reads its day through the tool's source: the generator at once, version D's store once it has loaded.
  const source = useFlightSource();
  const sameRoute = stripDay !== null && stripDay.origin === day.origin && stripDay.destination === day.destination;
  const dates = sameRoute ? stripDates(stripDay.date, today) : null;
  const stale = !sameRoute || stripDay.date !== day.date;
  const firstDate = dates ? dates[0] : null;
  const anyScores = showScores && availabilityAt(today, dates ? dates[0]! : day.date).turbulence;

  // Keep the chosen day in view when the strip scrolls sideways (phones).
  useEffect(() => {
    const scroller = scrollerRef.current;
    const current = scroller?.querySelector<HTMLElement>('[aria-current="date"]');
    if (!scroller || !current || scroller.scrollWidth <= scroller.clientWidth) return;
    const left = current.offsetLeft - (scroller.clientWidth - current.offsetWidth) / 2;
    scroller.scrollTo({ left: Math.max(0, left) });
  }, [day.date, firstDate]);

  return (
    <nav aria-label="Nearby dates" aria-busy={stale || undefined}>
      <ul
        ref={scrollerRef}
        className={cn(
          "relative -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-7 lg:scroll-px-0 lg:overflow-visible lg:px-0",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {dates
          ? dates.map((date) => (
              <DayTile
                key={date}
                origin={day.origin}
                destination={day.destination}
                date={date}
                current={date === day.date}
                scores={showScores && availabilityAt(today, date).turbulence}
                daysUntil={daysToDeparture(today, date)}
                nowMs={daysToDeparture(today, date) <= 1 ? nowMs : null}
                href={hrefFor(date)}
                source={source}
              />
            ))
          : Array.from({ length: DAYS }, (_, i) => (
              <li key={i} aria-hidden className="min-w-[5.5rem] flex-1 lg:min-w-0">
                <div className="h-[6.25rem] animate-pulse rounded-2xl bg-surface/60 ring-1 ring-inset ring-line/60" />
              </li>
            ))}
      </ul>
      <p className="mt-1.5 text-xs text-ink-500">
        {anyScores
          ? `Lowest fare each day · best smoothness score from ${TURBULENCE_FORECAST_DAYS} days before departure`
          : "Lowest fare and number of nonstop flights each day"}
      </p>
    </nav>
  );
}

/**
 * The day's count, lowest fare today (`daysUntil` sets the booking lead time) and best score;
 * with `nowMs`, only over the flights that haven't left yet (`left`: how many have). Undefined
 * while the day is still loading (version D's store), null when it couldn't be built.
 */
function safeOverview(
  origin: string,
  destination: string,
  date: string,
  daysUntil: number,
  nowMs: number | null,
  source: FlightSource,
): (DayOverview & { left: number }) | null | undefined {
  try {
    const results = source.searchFlights({ origin, destination, date });
    if (results === null) return undefined;
    const all = results.options;
    const options = nowMs === null ? all : all.filter((o) => !hasLeft(o.flight, nowMs));
    return {
      date,
      left: all.length - options.length,
      count: options.length,
      lowestFareUsd: options.reduce((min, o) => Math.min(min, fareAt(o, daysUntil)), options.length > 0 ? Infinity : 0),
      bestScore: options.reduce((max, o) => Math.max(max, o.flight.smoothness.score), 0),
    };
  } catch {
    return null;
  }
}

interface DayTileProps {
  origin: string;
  destination: string;
  date: string;
  current: boolean;
  /** The day's turbulence forecast is out, so its best score can be shown. */
  scores: boolean;
  /** Whole days from today: today's fare for that day (fareAt). */
  daysUntil: number;
  /** Set for today (and tomorrow, for far-off time zones): flights that have left don't count. */
  nowMs: number | null;
  href: string;
  /** Where the day's flights come from (the tool's source). */
  source: FlightSource;
}

function DayTile({ origin, destination, date, current, scores, daysUntil, nowMs, href, source }: DayTileProps) {
  const overview = useMemo(
    () => safeOverview(origin, destination, date, daysUntil, nowMs, source),
    [origin, destination, date, daysUntil, nowMs, source],
  );
  // A source that prefetches (the generator) is asked for the tile's day; the store is not: a day
  // there is a provider call against a monthly plan, so the tile loads once the day is opened.
  useEffect(() => {
    if (source.prefetches) source.ensure({ origin, destination, date });
  }, [origin, destination, date, source]);
  const has = overview !== undefined && overview !== null && overview.count > 0;
  return (
    <li className="min-w-[5.5rem] flex-1 snap-start lg:min-w-0">
      <Link
        href={href}
        scroll={false}
        aria-current={current ? "date" : undefined}
        className={cn(
          "flex h-[6.25rem] flex-col items-center justify-center rounded-2xl px-1.5 text-center ring-1 ring-inset transition-colors",
          current
            ? "bg-night-900 text-white ring-night-900"
            : "bg-surface/60 text-ink-700 ring-line/70 hover:bg-surface hover:ring-line-strong",
        )}
      >
        <span className="sr-only">{formatLongDate(date)}</span>
        <span aria-hidden className={cn("text-[11px] font-semibold uppercase tracking-wide", current ? "text-white/70" : "text-ink-500")}>
          {weekday(date)}
        </span>
        <span aria-hidden className="text-sm font-bold leading-tight">
          {monthDay(date)}
        </span>
        {overview === undefined && !source.prefetches ? (
          // Version D, a day nobody has opened yet: the tile is the way to it.
          <span className={cn("mt-1.5 text-[11px] leading-tight", current ? "text-white/70" : "text-ink-500")}>
            <span className="sr-only">: </span>Tap to see
          </span>
        ) : overview === undefined ? (
          // Still loading: the tile keeps its size; the fare and count lines come when the day has.
          <>
            <span aria-hidden className="mt-1.5 h-[13px] w-9 rounded-full bg-current opacity-20" />
            <span aria-hidden className="mt-1.5 h-[11px] w-12 rounded-full bg-current opacity-20" />
            <span className="sr-only">: loading</span>
          </>
        ) : has ? (
          <>
            <span className="mt-1.5 text-[13px] font-semibold leading-none tabular-nums">
              <span className="sr-only">: from </span>
              {formatFare(overview.lowestFareUsd)}
            </span>
            {scores ? (
              <span
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums",
                  current ? "bg-white/15 text-calm-100" : "bg-canvas text-ink-700",
                )}
              >
                <span className="sr-only">, best smoothness score </span>
                {overview.bestScore}
              </span>
            ) : (
              <span
                className={cn("mt-1.5 text-[11px] leading-none tabular-nums", current ? "text-white/70" : "text-ink-500")}
              >
                <span className="sr-only">, </span>
                {overview.count} {overview.count === 1 ? "flight" : "flights"}
              </span>
            )}
          </>
        ) : (
          <span className={cn("mt-1.5 text-[11px] leading-tight", current ? "text-white/70" : "text-ink-500")}>
            <span className="sr-only">: </span>
            {overview && overview.left > 0 ? "All left" : "No flights"}
          </span>
        )}
      </Link>
    </li>
  );
}
