"use client";

import { findOption, searchFlights, type FlightOption, type SearchResults } from "@preflight/shared/search";
import type { FlightInput } from "@preflight/shared/types";
import { ensureRouteDay, readRouteDay, routeDaysVersion } from "./store";

/*
 * Where a flight page gets a day's flights (docs/REAL_DATA.md, "Frontend").
 * Version C reads the generator in the browser: synchronous, deterministic,
 * always ready. Version D reads the day store (./store.ts), which answers
 * "not yet" until the day has loaded from /api/flights/day. The shared
 * components ask the tool context for their source (useFlightSource) and
 * treat "not yet" as a loading state, so one component serves both tools
 * and C's output is untouched.
 */

export interface FlightSource {
  /** The day's flights by departure time, or null while the day loads (the generator never says null). Throws when the day can't be built. */
  searchFlights(q: FlightInput): SearchResults | null;
  /** One flight by key ("DL1423"): undefined while the day loads, null when it isn't on that day's schedule. Throws like searchFlights. */
  findOption(q: FlightInput, key: string): FlightOption | null | undefined;
  /** Start loading the day (once). From an effect or an event handler, never during render; nothing to do for the generator. */
  ensure(q: FlightInput): void;
  /**
   * Whether days nobody opened (the date strip's other tiles) may be loaded ahead: free for the
   * generator; not for the store, where every day is a provider call against a monthly plan.
   */
  prefetches: boolean;
}

/** Version C, and the default wherever no tool is mounted: the generator, cached, always ready. */
export const generatorSource: FlightSource = Object.freeze({
  searchFlights,
  findOption,
  ensure: () => {},
  prefetches: true,
});

/** Version D: the day store, fed by /api/flights/day (the generator when the API can't answer). */
export const storeSource: FlightSource = Object.freeze({
  searchFlights(q: FlightInput): SearchResults | null {
    const state = readRouteDay(q);
    if (state.status === "error") throw state.error;
    return state.results;
  },
  findOption(q: FlightInput, key: string): FlightOption | null | undefined {
    const results = storeSource.searchFlights(q);
    if (results === null) return undefined;
    const wanted = key.replace(/\s+/g, "").toUpperCase();
    return results.options.find((o) => o.key === wanted) ?? null;
  },
  ensure: ensureRouteDay,
  prefetches: false,
});

let handle: { version: number; source: FlightSource } = { version: -1, source: storeSource };

/**
 * The store as the source of one render (useFlightSource's snapshot): the same object while
 * nothing has changed, a new one — reading the same store — each time a day settles, so a memo or
 * an effect keyed on the source runs again and its synchronous reads see the day.
 */
export function storeSourceSnapshot(): FlightSource {
  const version = routeDaysVersion();
  if (handle.version !== version) handle = { version, source: Object.freeze({ ...storeSource }) };
  return handle.source;
}
