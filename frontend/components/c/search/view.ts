import type { FlightOption } from "@preflight/shared/search";
import { DEFAULT_SORT, SORT_KEYS, searchHref, type RouteDay, type SortKey } from "@/lib/c/model";
import { TIME_BUCKETS, timeBucket, type TimeBucket } from "@/lib/c/format";

/*
 * Version C results: sort and filters, kept in the /c/search query string —
 *   sort=smoothest|cheapest|fastest|departure   (the day's default is omitted)
 *   time=morning,evening              (departure-time buckets, lib/c/format.ts)
 *   airline=AA,DL                     (IATA codes)
 *   wide=1                            (wide-body only)
 *   min=75|85                         (minimum smoothness score)
 * Time-aware (docs/VERSION_C.md): smoothness scores exist only from
 * TURBULENCE_FORECAST_DAYS before departure. Before that the Smoothest sort and
 * the minimum-smoothness filter don't apply, the default sort is Departure time,
 * and a stale sort=smoothest / min= in a link is ignored.
 * Pure — safe in render. Unknown values are ignored. Never sorts its input in place.
 */

export const MIN_SCORES = [0, 75, 85] as const;
export type MinScore = (typeof MIN_SCORES)[number];

export interface ResultsView {
  /** Whether this day's flights have smoothness scores yet (decides the default sort and what applies). */
  scores: boolean;
  sort: SortKey;
  /** In TIME_BUCKETS order. */
  times: readonly TimeBucket[];
  /** Sorted IATA codes. */
  airlines: readonly string[];
  wide: boolean;
  min: MinScore;
}

type Params = { get(name: string): string | null };

function list(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/** The sort a day starts with: Smoothest once scores exist, Departure time before that. */
export function defaultSortFor(scores: boolean): SortKey {
  return scores ? DEFAULT_SORT : "departure";
}

/** Sorts that need smoothness scores. */
export const SCORE_SORTS: readonly SortKey[] = ["smoothest"];

function usableSort(value: string | null, scores: boolean): SortKey {
  const sort = SORT_KEYS.find((key) => key === value);
  if (!sort || (!scores && SCORE_SORTS.includes(sort))) return defaultSortFor(scores);
  return sort;
}

export function parseView(params: Params, scores: boolean): ResultsView {
  const times = new Set(list(params.get("time")).map((t) => t.toLowerCase()));
  const airlines = new Set(
    list(params.get("airline"))
      .map((a) => a.toUpperCase())
      .filter((a) => /^[A-Z0-9]{2}$/.test(a)),
  );
  const min = Number(params.get("min"));
  return {
    scores,
    sort: usableSort(params.get("sort"), scores),
    times: TIME_BUCKETS.filter((b) => times.has(b)),
    airlines: [...airlines].sort(),
    wide: params.get("wide") === "1",
    min: scores && (min === 75 || min === 85) ? min : 0,
  };
}

/**
 * The same view for another day whose scores may or may not exist yet: the
 * default sort stays "the default", and what needs scores is dropped when the
 * other day has none.
 */
export function viewForDay(view: ResultsView, scores: boolean): ResultsView {
  if (scores === view.scores) return view;
  const sort = view.sort === defaultSortFor(view.scores) ? defaultSortFor(scores) : usableSort(view.sort, scores);
  return { ...view, scores, sort, min: scores ? view.min : 0 };
}

/** Query parameters for a view (defaults dropped). */
export function viewParams(view: ResultsView): Record<string, string | undefined> {
  return {
    sort: view.sort === defaultSortFor(view.scores) ? undefined : view.sort,
    time: view.times.length ? view.times.join(",") : undefined,
    airline: view.airlines.length ? view.airlines.join(",") : undefined,
    wide: view.wide ? "1" : undefined,
    min: view.min ? String(view.min) : undefined,
  };
}

/** /c/search for a route and day with this sort and these filters (commas kept readable). */
export function resultsHref(day: RouteDay, view: ResultsView): string {
  return searchHref(day, viewParams(view)).replace(/%2C/gi, ",");
}

export function activeFilterCount(view: ResultsView): number {
  return view.times.length + view.airlines.length + (view.wide ? 1 : 0) + (view.min ? 1 : 0);
}

export function withoutFilters(view: ResultsView): ResultsView {
  return { scores: view.scores, sort: view.sort, times: [], airlines: [], wide: false, min: 0 };
}

export function toggled<T>(values: readonly T[], value: T, order: readonly T[]): T[] {
  const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  return order.filter((v) => next.includes(v));
}

export function matchesView(option: FlightOption, view: ResultsView): boolean {
  const { flight } = option;
  if (view.times.length && !view.times.includes(timeBucket(flight.departTime))) return false;
  if (view.airlines.length && !view.airlines.includes(flight.airline.code)) return false;
  if (view.wide && flight.aircraft.bodyType !== "wide") return false;
  if (view.scores && view.min && flight.smoothness.score < view.min) return false;
  return true;
}

const byDeparture = (a: FlightOption, b: FlightOption) =>
  a.flight.departTime.localeCompare(b.flight.departTime) || a.key.localeCompare(b.key);

const COMPARE: Record<SortKey, (a: FlightOption, b: FlightOption) => number> = {
  smoothest: (a, b) => b.flight.smoothness.score - a.flight.smoothness.score || byDeparture(a, b),
  // Never by score: before the forecast is out a hidden score must not order the list.
  cheapest: (a, b) => a.fareUsd - b.fareUsd || byDeparture(a, b),
  fastest: (a, b) => a.flight.blockMin - b.flight.blockMin || byDeparture(a, b),
  departure: byDeparture,
};

/** The flights this view shows, in its order (a new array — the cached results are frozen). Ties go by departure time. */
export function applyView(options: readonly FlightOption[], view: ResultsView): FlightOption[] {
  const sort = !view.scores && SCORE_SORTS.includes(view.sort) ? "departure" : view.sort;
  return options.filter((o) => matchesView(o, view)).sort(COMPARE[sort]);
}

/** "smoothest first" etc. — how the list is ordered, for its accessible name. */
export const SORT_ORDER_TEXT: Record<SortKey, string> = {
  smoothest: "smoothest first",
  cheapest: "lowest fare first",
  fastest: "shortest first",
  departure: "earliest departure first",
};

// ── Filter options (from the whole day, not the filtered list) ──────────────

export interface AirlineFacet {
  code: string;
  name: string;
  count: number;
  lowestFareUsd: number;
}

export interface Facets {
  total: number;
  /** Buckets with at least one flight, in TIME_BUCKETS order. */
  times: Array<{ bucket: TimeBucket; count: number }>;
  /** By name. */
  airlines: AirlineFacet[];
  wideCount: number;
  /** Flights at or above each minimum. */
  atLeast: Record<MinScore, number>;
}

export function buildFacets(options: readonly FlightOption[]): Facets {
  const times = new Map<TimeBucket, number>();
  const airlines = new Map<string, AirlineFacet>();
  let wideCount = 0;
  const atLeast: Record<MinScore, number> = { 0: options.length, 75: 0, 85: 0 };
  for (const option of options) {
    const { flight } = option;
    const bucket = timeBucket(flight.departTime);
    times.set(bucket, (times.get(bucket) ?? 0) + 1);
    const current = airlines.get(flight.airline.code);
    if (current) {
      current.count += 1;
      current.lowestFareUsd = Math.min(current.lowestFareUsd, option.fareUsd);
    } else {
      airlines.set(flight.airline.code, {
        code: flight.airline.code,
        name: flight.airline.name,
        count: 1,
        lowestFareUsd: option.fareUsd,
      });
    }
    if (flight.aircraft.bodyType === "wide") wideCount += 1;
    if (flight.smoothness.score >= 75) atLeast[75] += 1;
    if (flight.smoothness.score >= 85) atLeast[85] += 1;
  }
  return {
    total: options.length,
    times: TIME_BUCKETS.filter((b) => times.has(b)).map((bucket) => ({ bucket, count: times.get(bucket)! })),
    airlines: [...airlines.values()].sort((a, b) => a.name.localeCompare(b.name)),
    wideCount,
    atLeast,
  };
}
