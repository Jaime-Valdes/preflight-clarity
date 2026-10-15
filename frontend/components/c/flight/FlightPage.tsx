"use client";

import { CalendarDays, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { getAirport } from "@preflight/shared/airports";
import { findOption, searchFlights, type FlightOption } from "@preflight/shared/search";
import { useTodayISO } from "@/lib/hooks";
import { flightKey, itemId, parseRouteDay, searchHref, type RouteDay } from "@/lib/c/model";
import { LINK_BUTTON, clampDate, dateStatus, shortDate } from "./copy";
import { FlightDetail } from "./FlightDetail";
import { FlightSkeleton } from "./FlightSkeleton";
import { Notice } from "./Notice";

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "date"; day: RouteDay; status: "past" | "far"; nearest: string }
  | { kind: "missing"; day: RouteDay; flightText: string; failed: boolean }
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
  if (!key) return { kind: "missing", day, flightText, failed: false };
  const query = { origin: day.origin, destination: day.destination, date: day.date };
  try {
    const option = findOption(query, key);
    if (!option) return { kind: "missing", day, flightText, failed: false };
    const options = searchFlights(query).options;
    return { kind: "found", id: itemId({ ...day, key: option.key }), day, option, options, today };
  } catch {
    return { kind: "missing", day, flightText, failed: true };
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
      return <NotOnSchedule day={view.day} flightText={view.flightText} failed={view.failed} />;
    case "found":
      return <FlightDetail key={view.id} day={view.day} option={view.option} options={view.options} today={view.today} />;
  }
}

function DateNotice({ day, status, nearest }: { day: RouteDay; status: "past" | "far"; nearest: string }) {
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
          : `Flights can be explored up to a year ahead, until ${shortDate(nearest)}. Pick an earlier date to see the flights from ${route}.`}
      </p>
    </Notice>
  );
}

function NotOnSchedule({ day, flightText, failed }: { day: RouteDay; flightText: string; failed: boolean }) {
  const route = `${airportLabel(day.origin)} to ${airportLabel(day.destination)}`;
  return (
    <Notice
      title={failed ? "This flight couldn’t be shown" : "This flight isn’t on the schedule"}
      actions={
        <>
          <Link href={searchHref(day)} className={LINK_BUTTON.primary}>
            See all flights that day
          </Link>
          <Link href="/c" className={LINK_BUTTON.secondary}>
            New search
          </Link>
        </>
      }
    >
      <p>
        {failed
          ? `We couldn’t put together the flights from ${route} on ${shortDate(day.date)} just now. The results page may still show them.`
          : flightText
            ? `We couldn’t find flight ${flightText} from ${route} on ${shortDate(day.date)}. The link may be from an earlier schedule.`
            : `The link doesn’t say which flight from ${route} on ${shortDate(day.date)} to show.`}
      </p>
    </Notice>
  );
}
