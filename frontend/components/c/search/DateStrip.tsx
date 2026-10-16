"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { addDays, formatLongDate } from "@preflight/shared/dates";
import { TURBULENCE_FORECAST_DAYS } from "@preflight/shared/forecast";
import { dayOverview, type DayOverview } from "@preflight/shared/search";
import { availabilityOn } from "@/components/c/common/availability";
import { formatFare } from "@/lib/c/format";
import { clampDate, MAX_DAYS_AHEAD, type RouteDay } from "@/lib/c/model";
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
  /** Link for another date (keeps sort and filters). */
  hrefFor: (date: string) => string;
}

/**
 * Nearby dates: weekday and date, that day's lowest fare, and — only for days
 * whose turbulence forecast is out (within 2 days of today) — the best
 * smoothness score; other days show how many nonstop flights there are. Each
 * day is a link. Computed one tile at a time after the day's own results, so
 * the first paint isn't held up.
 */
export function DateStrip({ day, stripDay, today, hrefFor }: DateStripProps) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const sameRoute = stripDay !== null && stripDay.origin === day.origin && stripDay.destination === day.destination;
  const dates = sameRoute ? stripDates(stripDay.date, today) : null;
  const stale = !sameRoute || stripDay.date !== day.date;
  const firstDate = dates ? dates[0] : null;
  const anyScores = dates ? availabilityOn(dates[0]!, today).turbulence : availabilityOn(day.date, today).turbulence;

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
          "relative -mx-4 flex snap-x gap-2 overflow-x-auto overscroll-x-contain px-4 py-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-7 lg:overflow-visible lg:px-0",
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
                scores={availabilityOn(date, today).turbulence}
                href={hrefFor(date)}
              />
            ))
          : Array.from({ length: DAYS }, (_, i) => (
              <li key={i} aria-hidden className="min-w-[5.5rem] flex-1 lg:min-w-0">
                <div className="h-[6.25rem] animate-pulse rounded-2xl bg-surface ring-1 ring-inset ring-line/80" />
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

function safeOverview(origin: string, destination: string, date: string): DayOverview | null {
  try {
    return dayOverview({ origin, destination, date }, date);
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
  href: string;
}

function DayTile({ origin, destination, date, current, scores, href }: DayTileProps) {
  const overview = useMemo(() => safeOverview(origin, destination, date), [origin, destination, date]);
  const has = overview !== null && overview.count > 0;
  return (
    <li className="min-w-[5.5rem] flex-1 snap-start lg:min-w-0">
      <Link
        href={href}
        scroll={false}
        aria-current={current ? "date" : undefined}
        className={cn(
          "flex h-[6.25rem] flex-col items-center justify-center rounded-2xl px-1.5 text-center ring-1 ring-inset transition-colors",
          current
            ? "bg-night-900 text-white shadow-lift ring-night-900"
            : "bg-surface text-ink-900 ring-line hover:bg-canvas hover:ring-line-strong",
        )}
      >
        <span className="sr-only">{formatLongDate(date)}</span>
        <span aria-hidden className={cn("text-[11px] font-semibold uppercase tracking-wide", current ? "text-white/70" : "text-ink-500")}>
          {weekday(date)}
        </span>
        <span aria-hidden className="text-sm font-bold leading-tight">
          {monthDay(date)}
        </span>
        {has ? (
          <>
            <span className="mt-1.5 text-[13px] font-semibold leading-none tabular-nums">
              <span className="sr-only">: from </span>
              {formatFare(overview.lowestFareUsd)}
            </span>
            {scores ? (
              <span
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums",
                  current ? "bg-white/15 text-calm-100" : "bg-calm-50 text-calm-700",
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
            No flights
          </span>
        )}
      </Link>
    </li>
  );
}
