"use client";

import { CalendarDays, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { getAirport } from "@preflight/shared/airports";
import { findOption, searchFlights, type FlightOption } from "@preflight/shared/search";
import { useTodayISO } from "@/lib/hooks";
import { MAX_DAYS_AHEAD, clampDate, dateStatus, flightKey, itemId, parseRouteDay, searchHref, type RouteDay } from "@/lib/c/model";
import { LINK_BUTTON, shortDate } from "./copy";
import { FlightDetail } from "./FlightDetail";
import { FlightSkeleton } from "./FlightSkeleton";
import { Notice } from "./Notice";

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "date"; day: RouteDay; status: "past" | "too-far"; nearest: string }
  /** No flight in the link, or one that doesn't fly that day (`noFlights`: no nonstops on the route at all), or the day failed to build. */
  | { kind: "missing"; day: RouteDay; flightText: string; reason: "no-key" | "not-that-day" | "failed"; noFlights: boolean }
  | { kind: "found"; id: string; day: RouteDay; option: FlightOption; options: readonly FlightOption[]; today: string };

/**
 * What the query string leads to. Pure; generates the day's results
 * (deterministic and cached by the generator) only for a date the tool shows.
 */
function resolve(params: { get(name: string): string | null }, today: string | null): View {
  if (!today) return { kind: "loading" };
  const day = parseRouteDay(params);
  if (!day) return { kind: "invalid" };
  const status = dateStatus(day.date, today);
  if (status !== "ok") return { kind: "date", day, status, nearest: clampDate(day.date, today) };
  const raw = params.get("f")?.trim() ?? "";
  const key = flightKey(raw);
  // Never echo more than a flight number's worth of whatever the link carried.
  const flightText = (key ?? raw).slice(0, 12);
  if (!key) return { kind: "missing", day, flightText, reason: "no-key", noFlights: false };
  const query = { origin: day.origin, destination: day.destination, date: day.date };
  try {
    const option = findOption(query, key);
    const options = searchFlights(query).options;
    if (!option) return { kind: "missing", day, flightText, reason: "not-that-day", noFlights: options.length === 0 };
    return { kind: "found", id: itemId({ ...day, key: option.key }), day, option, options, today };
  } catch {
    return { kind: "missing", day, flightText, reason: "failed", noFlights: false };
  }
}

/** "New York (JFK)" */
function airportLabel(code: string): string {
  const airport = getAirport(code);
  return airport ? `${airport.city} (${code})` : code;
}

/**
 * /c/flight?from=JFK&to=LAX&date=2026-11-26&f=DL1423 — one flight in full.
 * Reads the query on the client (inside the page's Suspense boundary), waits
 * for today's date, regenerates the day's results and shows the flight, or a
 * calm message when the link doesn't lead to one.
 */
export function FlightPage() {
  const params = useSearchParams();
  const today = useTodayISO();
  const view = useMemo(() => resolve(params, today), [params, today]);
  const shownId = view.kind === "found" ? view.id : null;

  // Opening another flight from this page (Details) replaces everything under the pointer:
  // keyboard and screen-reader focus moves to the top of the new flight. Not on the first one.
  const lastShown = useRef<string | null>(null);
  useEffect(() => {
    if (!shownId) return;
    if (lastShown.current !== null && lastShown.current !== shownId) {
      document.querySelector<HTMLElement>("[data-flight-top]")?.focus({ preventScroll: true });
    }
    lastShown.current = shownId;
  }, [shownId]);

  switch (view.kind) {
    case "loading":
      return <FlightSkeleton />;
    case "invalid":
      return (
        <Notice
          title="We couldn’t find that flight"
          actions={
            <Link href="/c" className={LINK_BUTTON.primary}>
              <Search aria-hidden className="size-4" />
              Search flights
            </Link>
          }
        >
          <p>The link is missing its route or date, or they aren&rsquo;t ones we know. Start a new search to pick a flight.</p>
        </Notice>
      );
    case "date":
      return <DateNotice day={view.day} status={view.status} nearest={view.nearest} />;
    case "missing":
      return <NotOnSchedule day={view.day} flightText={view.flightText} reason={view.reason} noFlights={view.noFlights} />;
    case "found":
      return <FlightDetail key={view.id} day={view.day} option={view.option} options={view.options} today={view.today} />;
  }
}

function DateNotice({ day, status, nearest }: { day: RouteDay; status: "past" | "too-far"; nearest: string }) {
  const route = `${airportLabel(day.origin)} to ${airportLabel(day.destination)}`;
  return (
    <Notice
      title={status === "past" ? "That date has passed" : "That date is too far ahead"}
      icon={<CalendarDays />}
      actions={
        <>
          <Link href={searchHref({ ...day, date: nearest })} className={LINK_BUTTON.primary}>
            See flights on {shortDate(nearest)}
          </Link>
          <Link href="/c" className={LINK_BUTTON.secondary}>
            New search
          </Link>
        </>
      }
    >
      <p>
        {status === "past"
          ? `Flights on ${shortDate(day.date)} have already left. Pick another date to see the flights from ${route}.`
          : `Airlines publish schedules about ${MAX_DAYS_AHEAD} days ahead, so flights can be explored until ${shortDate(nearest)}. Pick an earlier date to see the flights from ${route}.`}
      </p>
    </Notice>
  );
}

interface NotOnScheduleProps {
  day: RouteDay;
  flightText: string;
  reason: "no-key" | "not-that-day" | "failed";
  noFlights: boolean;
}

function NotOnSchedule({ day, flightText, reason, noFlights }: NotOnScheduleProps) {
  const route = `${airportLabel(day.origin)} to ${airportLabel(day.destination)}`;
  const date = shortDate(day.date);
  const title =
    reason === "failed"
      ? "This flight couldn’t be shown"
      : reason === "no-key"
        ? "Which flight?"
        : "This flight doesn’t fly on that date";
  const body =
    reason === "failed"
      ? `We couldn’t put together the flights from ${route} on ${date} just now. The results page may still show them.`
      : reason === "no-key"
        ? `The link doesn’t say which flight from ${route} on ${date} to show.`
        : noFlights
          ? `There are no nonstop flights from ${route} on ${date}, so flight ${flightText} isn’t one of them.`
          : `Flight ${flightText} isn’t on the schedule from ${route} on ${date}. Some flights skip a day, and timetables change between seasons.`;
  return (
    <Notice
      title={title}
      icon={reason === "not-that-day" ? <CalendarDays /> : undefined}
      actions={
        <>
          <Link href={searchHref(day)} className={LINK_BUTTON.primary}>
            See flights on {date}
          </Link>
          <Link href="/c" className={LINK_BUTTON.secondary}>
            New search
          </Link>
        </>
      }
    >
      <p>{body}</p>
    </Notice>
  );
}
