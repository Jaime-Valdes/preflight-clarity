"use client";

import { useSyncExternalStore } from "react";
import { daysBetween, toISODate } from "@preflight/shared/dates";
import { isRouteOnTime, type RouteOnTime } from "@preflight/shared/onTime";
import { isRouteHistoryDay, type RouteHistoryDay } from "@preflight/shared/routeHistory";
import { optionsFromSchedule, type RouteDaySchedule } from "@preflight/shared/schedule";
import { hasNonstopService, searchFlights, type SearchResults } from "@preflight/shared/search";
import type { FlightInput } from "@preflight/shared/types";
import { track } from "@/lib/analytics";

/*
 * Version D's day store (docs/REAL_DATA.md, "Frontend"): one snapshot per
 * route-day, loaded once from the backend's published schedule
 * (GET /api/flights/day) and kept for the session, so the results, flight and
 * compare pages, the tray and the date strip all read the same frozen
 * SearchResults — "cheapest", the price ranks and the marks never disagree
 * between pages. When the API can't answer (no API_URL, so the path is a 404;
 * an error; a slow answer; a provider's day with no flights in it) the day is the generator's, marked so, and the app
 * works with no key. Reads are synchronous and never fetch: ensureRouteDay
 * starts a load from an effect or an event handler; useRouteDay keeps a
 * component current. Version C never comes here (lib/flights/source.ts).
 * A day also keeps the airline on-time figures the API sent with it (`onTime`,
 * the US DOT's; shared/src/onTime.ts) and the route's turbulence history
 * (`routeHistory`, NOAA MADIS's; shared/src/routeHistory.ts): null when the browser's own
 * illustrative day stands in, or an older API sent none.
 * Each settled day says whether its listings are the provider's (`listings: "real"`) or the illustrative
 * stand-in, and why the stand-in (`illustrativeWhy`); a day's first settling sends `d_day_loaded` with both
 * (docs/ANALYTICS.md), so how often visitors see real flights can be counted.
 */

export type DayProvider = RouteDaySchedule["provider"];

/** Whether a day's flights are the schedule provider's or the illustrative stand-in. */
export type DayListings = "real" | "illustrative";

/**
 * Why the illustrative day stands in: no API on this deployment (404), the server's hourly allowance of provider
 * calls is spent (503), the per-visitor rate limit (429), the provider could not answer (502, or another error
 * status), no answer within TIMEOUT_MS, a network failure, a body that isn't the contract's, a provider day with no
 * flights in it, rows the browser could not build on, or an API that serves the generator itself (no provider set).
 */
export type IllustrativeWhy =
  | "no_api"
  | "budget"
  | "rate_limited"
  | "provider_error"
  | "timeout"
  | "network"
  | "bad_answer"
  | "no_flights"
  | "not_built"
  | "api_generator";

/** What is known about a route-day: loading until a load started by ensureRouteDay settles. */
export type RouteDayState =
  | { status: "loading"; results: null; provider: null; fetchedAt: null; served: null; onTime: null; routeHistory: null; listings: null; illustrativeWhy: null }
  /** `served`: the route has nonstop service (true), nobody flies it nonstop (false), or the provider could not say (null: a day with no rows). */
  | {
      status: "ready";
      results: SearchResults;
      provider: DayProvider;
      fetchedAt: string;
      served: boolean | null;
      onTime: RouteOnTime | null;
      routeHistory: RouteHistoryDay | null;
      listings: DayListings;
      /** Null when the listings are real. */
      illustrativeWhy: IllustrativeWhy | null;
    }
  /** Neither the API nor the generator could give the day (an invalid date, say): what the generator threw. */
  | { status: "error"; results: null; provider: null; fetchedAt: null; served: null; onTime: null; routeHistory: null; listings: null; illustrativeWhy: null; error: unknown };

const LOADING: RouteDayState = Object.freeze({
  status: "loading",
  results: null,
  provider: null,
  fetchedAt: null,
  served: null,
  onTime: null,
  routeHistory: null,
  listings: null,
  illustrativeWhy: null,
});

/** Settled days kept per session; past this the least recently asked-for days go (a page asks for its days again on its next render). */
const CAPACITY = 48;

/** How long the API gets before the generator stands in for the day. */
const TIMEOUT_MS = 8_000;

/** Settled days by "ORIGIN|DEST|DATE"; a day being loaded is in `inflight` and reads as loading. */
const entries = new Map<string, RouteDayState>();
/** When each day was last asked for (ensureRouteDay), for the eviction order. */
const askedAt = new Map<string, number>();
let askedCount = 0;
const inflight = new Set<string>();
/** Days that have settled at least once this tab (d_day_loaded goes once per day). */
const loadedOnce = new Set<string>();
const listeners = new Set<() => void>();
/** Counts the days that have settled: the store's cheap "something changed" snapshot. */
let version = 0;
/** Set once the API has answered 404 (no backend, or one without the route): the session's later days go straight to the generator. */
let apiMissing = false;

function keyOf(day: FlightInput): string {
  return `${day.origin.trim().toUpperCase()}|${day.destination.trim().toUpperCase()}|${day.date.trim()}`;
}

function notify(): void {
  version += 1;
  for (const listener of listeners) listener();
}

/** Hear every change of the store (useSyncExternalStore's subscribe). */
export function subscribeRouteDays(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** How many days have settled so far; stable between changes. */
export function routeDaysVersion(): number {
  return version;
}

/** The day's state right now. Synchronous; never fetches. */
export function readRouteDay(day: FlightInput): RouteDayState {
  return entries.get(keyOf(day)) ?? LOADING;
}

/** The day's frozen results once ready, else null (still loading, or failed). Synchronous; never fetches. */
export function peekRouteDay(day: FlightInput): SearchResults | null {
  return readRouteDay(day).results;
}

function getServerSnapshot(): RouteDayState {
  return LOADING;
}

/**
 * The day's state, kept current (useSyncExternalStore): the same object until the day settles;
 * loading during server render and hydration.
 */
export function useRouteDay(day: FlightInput): RouteDayState {
  const key = keyOf(day);
  return useSyncExternalStore(subscribeRouteDays, () => entries.get(key) ?? LOADING, getServerSnapshot);
}

/**
 * Start loading the day, once: nothing happens while it loads or after it has settled. From an
 * effect or an event handler, never during render; only the browser loads.
 */
export function ensureRouteDay(day: FlightInput): void {
  if (typeof window === "undefined") return;
  const key = keyOf(day);
  askedCount += 1;
  askedAt.set(key, askedCount);
  if (entries.has(key) || inflight.has(key)) return;
  inflight.add(key);
  void load(key, { origin: day.origin, destination: day.destination, date: day.date });
}

async function load(key: string, day: FlightInput): Promise<void> {
  const state = settle(key, day, await fetchSchedule(day));
  inflight.delete(key);
  const first = !loadedOnce.has(key);
  loadedOnce.add(key);
  entries.set(key, state);
  evict(key);
  notify();
  // Once per day per tab: a day evicted and asked for again is not counted twice.
  if (first && state.status === "ready") {
    track("d_day_loaded", {
      origin: day.origin.trim().toUpperCase(),
      destination: day.destination.trim().toUpperCase(),
      date: day.date.trim(),
      days_until: Math.max(0, daysBetween(toISODate(new Date()), day.date.trim())),
      listings: state.listings,
      illustrative_why: state.illustrativeWhy,
      flights: state.results.options.length,
    });
  }
}

/** Past CAPACITY, the days asked for least recently go (never the one just settled). */
function evict(keep: string): void {
  while (entries.size > CAPACITY) {
    let oldest: string | null = null;
    let oldestAsk = Infinity;
    for (const key of entries.keys()) {
      const ask = askedAt.get(key) ?? 0;
      if (key !== keep && ask < oldestAsk) {
        oldest = key;
        oldestAsk = ask;
      }
    }
    if (oldest === null) return;
    entries.delete(oldest);
    askedAt.delete(oldest);
  }
}

/**
 * The day from the provider's rows, built in the browser; the generator's when the API gave
 * nothing (or rows the browser couldn't build on); an error only when the generator fails too.
 */
function settle(key: string, day: FlightInput, fetched: DayFetch): RouteDayState {
  const answer = "answer" in fetched ? fetched.answer : null;
  let why: IllustrativeWhy = "why" in fetched ? fetched.why : "bad_answer";
  const schedule = answer?.schedule ?? null;
  // The figures are about the airlines and the routes, not the rows: they hold for the illustrative day too.
  const onTime = answer?.onTime ?? null;
  const routeHistory = answer?.routeHistory ?? null;
  if (schedule) {
    try {
      const results = optionsFromSchedule(schedule);
      // A provider's day with no flights in it is a day it has no data for (a 204, or nothing published for the
      // day yet), not a day nobody flies: the illustrative day stands in below, and the page says so.
      if (schedule.provider === "generator" || results.options.length > 0) {
        const real = schedule.provider !== "generator";
        const ready: RouteDayState = {
          status: "ready",
          results,
          provider: schedule.provider,
          fetchedAt: schedule.fetchedAt,
          served: schedule.served ?? null,
          onTime,
          routeHistory,
          listings: real ? "real" : "illustrative",
          illustrativeWhy: real ? null : "api_generator",
        };
        return Object.freeze(ready);
      }
      why = "no_flights";
    } catch (error) {
      why = "not_built";
      // The generator stands in below; said in the console, so the fallback is never silent in development.
      console.warn(`day store: the schedule for ${key} could not be built; the illustrative day stands in`, error);
    }
  }
  try {
    // The generator has no provider instant: the moment it built the day (a load callback, never render).
    const ready: RouteDayState = {
      status: "ready",
      results: searchFlights(day),
      provider: "generator",
      fetchedAt: new Date().toISOString(),
      served: hasNonstopService(day.origin, day.destination),
      onTime,
      routeHistory,
      listings: "illustrative",
      illustrativeWhy: why,
    };
    return Object.freeze(ready);
  } catch (error) {
    const failed: RouteDayState = {
      status: "error",
      results: null,
      provider: null,
      fetchedAt: null,
      served: null,
      onTime: null,
      routeHistory: null,
      listings: null,
      illustrativeWhy: null,
      error,
    };
    return Object.freeze(failed);
  }
}

/** What a 200 gave: the schedule, and the on-time figures when the API sent valid ones. */
interface DayAnswer {
  schedule: RouteDaySchedule;
  onTime: RouteOnTime | null;
  routeHistory: RouteHistoryDay | null;
}

/** The API's answer, or why there is none. */
type DayFetch = { answer: DayAnswer } | { why: IllustrativeWhy };

/** An error status → why the illustrative day stands in. */
function whyOfStatus(status: number): IllustrativeWhy {
  if (status === 404) return "no_api";
  if (status === 503) return "budget";
  if (status === 429) return "rate_limited";
  return "provider_error";
}

/**
 * GET /api/flights/day for the day, within TIMEOUT_MS: the schedule (and the on-time figures) from a 200 with one in it,
 * else why not (a 404 when no API is configured, an error status, a network failure, a timeout, a
 * body that isn't the contract's) — the caller falls back to the generator. A 404 is remembered:
 * the route isn't there, so no later day of the session asks again.
 */
async function fetchSchedule(day: FlightInput): Promise<DayFetch> {
  if (apiMissing) return { why: "no_api" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const params = new URLSearchParams({ from: day.origin, to: day.destination, date: day.date });
    const response = await fetch(`/api/flights/day?${params.toString()}`, {
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (response.status === 404) apiMissing = true;
    if (!response.ok) {
      // Let the connection go: an unread body keeps the request pending in the network panel.
      void response.body?.cancel().catch(() => {});
      return { why: whyOfStatus(response.status) };
    }
    const body: unknown = await response.json();
    if (!isDayResponse(body)) return { why: "bad_answer" };
    const { onTime, routeHistory } = body as { onTime?: unknown; routeHistory?: unknown };
    return {
      answer: { schedule: body.schedule, onTime: isRouteOnTime(onTime) ? onTime : null, routeHistory: isRouteHistoryDay(routeHistory) ? routeHistory : null },
    };
  } catch (error) {
    // An abort is the timeout; a body that isn't JSON is a bad answer; anything else is the network.
    if (controller.signal.aborted) return { why: "timeout" };
    return { why: error instanceof SyntaxError ? "bad_answer" : "network" };
  } finally {
    clearTimeout(timer);
  }
}

/** `{ ok: true, schedule }` with the schedule's header fields in place (the rows are checked as the day is built). */
function isDayResponse(body: unknown): body is { ok: true; schedule: RouteDaySchedule } {
  if (!body || typeof body !== "object") return false;
  const { ok, schedule } = body as { ok?: unknown; schedule?: unknown };
  if (ok !== true || !schedule || typeof schedule !== "object") return false;
  const s = schedule as Record<string, unknown>;
  return (
    typeof s.origin === "string" &&
    typeof s.destination === "string" &&
    typeof s.date === "string" &&
    (s.provider === "generator" || s.provider === "aerodatabox") &&
    typeof s.fetchedAt === "string" &&
    Array.isArray(s.rows)
  );
}
