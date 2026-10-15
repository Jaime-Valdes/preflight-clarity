/*
 * Version C — flight search (illustrative). For a route and date: the day's
 * nonstop flights, each a full `Flight` plus an illustrative fare.
 * Deterministic: the same route and date always give the same results.
 *
 * Contract: docs/VERSION_C.md. The exported names and shapes are fixed. The
 * internals below are a stand-in built on generateFlight so the UI can start;
 * the generator replaces them with a coherent day schedule.
 */
import { generateFlight, normalizeInput } from "./fakeFlight";
import { createRng } from "./random";
import type { Flight, FlightInput, FlightPrefs } from "./types";

export interface FlightOption {
  /** Unique within route + date, stable: airline code + number, no space — "DL1423". */
  key: string;
  /** Full flight (dashboard shape). `alternatives` is [] — C shows other options from the same results. */
  flight: Flight;
  /** Illustrative one-way economy fare, whole US dollars. */
  fareUsd: number;
}

export interface SearchResults {
  /** Normalized query. */
  query: FlightInput;
  /** Every flight that day, by departure time. */
  options: FlightOption[];
}

export interface DayOverview {
  date: string;
  count: number;
  lowestFareUsd: number;
  /** Highest smoothness score that day. */
  bestScore: number;
}

/** "DL 1423" → "DL1423". */
export function optionKey(flight: Pick<Flight, "flightNumber">): string {
  return flight.flightNumber.replace(/\s+/g, "").toUpperCase();
}

// ── Stand-in internals (replaced by the generator) ─────────────────────────

const STAND_IN_PREFS: readonly FlightPrefs[] = [
  {},
  { departWindow: "morning" },
  { departWindow: "morning", bodyType: "wide" },
  { departWindow: "afternoon" },
  { departWindow: "afternoon", bodyType: "wide" },
  { departWindow: "evening" },
  { departWindow: "evening", bodyType: "wide" },
];

const CACHE = new Map<string, SearchResults>();
const CACHE_MAX = 64;

function build(query: FlightInput): SearchResults {
  const options: FlightOption[] = [];
  const seen = new Set<string>();
  for (const prefs of STAND_IN_PREFS) {
    const generated = generateFlight(query, prefs);
    const key = optionKey(generated);
    if (seen.has(key)) continue;
    seen.add(key);
    const flight: Flight = { ...generated, id: `c-${generated.id}`, alternatives: [] };
    const rng = createRng(`fare|${query.origin}|${query.destination}|${query.date}|${key}`);
    const fareUsd = Math.max(39, Math.round(49 + flight.distanceMi * 0.08 + rng.int(0, 60)));
    options.push({ key, flight, fareUsd });
  }
  options.sort((a, b) => a.flight.departTime.localeCompare(b.flight.departTime));
  return { query, options };
}

/** The day's flights for a route, by departure time. Cached and deterministic. */
export function searchFlights(query: FlightInput): SearchResults {
  const norm = normalizeInput(query);
  const cacheKey = `${norm.origin}|${norm.destination}|${norm.date}`;
  const hit = CACHE.get(cacheKey);
  if (hit) return hit;
  const results = build(norm);
  if (CACHE.size >= CACHE_MAX) CACHE.delete(CACHE.keys().next().value as string);
  CACHE.set(cacheKey, results);
  return results;
}

/** One flight from a day's results by its key ("DL1423"), or null. */
export function findOption(query: FlightInput, key: string): FlightOption | null {
  const wanted = key.replace(/\s+/g, "").toUpperCase();
  return searchFlights(query).options.find((o) => o.key === wanted) ?? null;
}

/** Lowest fare and best smoothness score for the same route on another date. */
export function dayOverview(query: FlightInput, date: string): DayOverview {
  const { options } = searchFlights({ ...query, date });
  return {
    date,
    count: options.length,
    lowestFareUsd: options.reduce((min, o) => Math.min(min, o.fareUsd), Infinity),
    bestScore: options.reduce((max, o) => Math.max(max, o.flight.smoothness.score), 0),
  };
}
