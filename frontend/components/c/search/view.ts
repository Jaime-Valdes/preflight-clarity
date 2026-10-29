import { getAirline } from "@preflight/shared/airlines";
import { timeToMinutes } from "@preflight/shared/dates";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import { DEFAULT_SORT, type RouteDay, SORT_KEYS, type SortKey, type ToolBase, hrefsFor } from "@/lib/c/model";
import { PRICE_STEP } from "@/lib/c/format";

/*
 * Version C results: sort and filters, kept in the /c/search query string —
 *   sort=smoothest|cheapest|fastest|departure   (the day's default is omitted)
 *   dep_from=0600                     (earliest departure, local "HHMM")
 *   dep_to=1030                       (latest departure, local "HHMM")
 *   max_price=250                     (highest fare, whole US dollars, in $10 steps)
 *   airline=AA,DL                     (IATA codes)
 *   wide=1                            (wide-body only)
 *   min=75|85                         (minimum smoothness score)
 * The departure window and the price cap are hard limits: a flight outside
 * them is not listed. Both default to the day's own span (the exact first and
 * last departure, cheapest and most expensive fare) — a value at or past that
 * edge changes nothing, so it is dropped from the view and the URL. The price
 * cap moves on the slider's $10 grid; an off-grid value in a link is rounded
 * to the nearest step, so the chip and the slider agree. Fares are what
 * the fare is today (fareAt: booking lead time moves it), so every fare-based
 * figure here takes the days until departure.
 * Time-aware (docs/VERSION_C.md): smoothness scores exist only from
 * TURBULENCE_FORECAST_DAYS before departure. Before that the Smoothest sort and
 * the minimum-smoothness filter don't apply, the default sort is Departure time,
 * and a stale sort=smoothest / min= in a link is ignored.
 * Pure — safe in render. Unknown parameters (utm_*, old time= buckets) are
 * ignored and never break parsing. Never sorts its input in place.
 */

export const MIN_SCORES = [0, 75, 85] as const;
export type MinScore = (typeof MIN_SCORES)[number];

export interface ResultsView {
  /** Whether this day's flights have smoothness scores yet (decides the default sort and what applies). */
  scores: boolean;
  sort: SortKey;
  /** Earliest departure, local minutes after midnight; null = the day's first departure. */
  depFrom: number | null;
  /** Latest departure, local minutes after midnight; null = the day's last departure. */
  depTo: number | null;
  /** Highest fare shown, whole dollars; null = no cap. */
  maxPrice: number | null;
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

/** "0630" (or "06:30") → 390; anything else → null. */
function parseClock(value: string | null): number | null {
  const m = /^(\d{2}):?(\d{2})$/.exec((value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** 390 → "0630" */
function clockParam(minutes: number): string {
  const m = Math.max(0, Math.min(1439, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, "0")}${String(m % 60).padStart(2, "0")}`;
}

/** "250" → 250, on the $10 grid ("463" → 460); anything else, or a cap that rounds to nothing, → null. */
function parsePrice(value: string | null): number | null {
  const n = Number((value ?? "").trim());
  if (!Number.isInteger(n) || n <= 0 || n >= 100000) return null;
  const snapped = Math.round(n / PRICE_STEP) * PRICE_STEP;
  return snapped > 0 ? snapped : null;
}

/** The day's own span, which the hard filters default to (from buildFacets). Exact values — the filters lay their grids over them. */
export interface Bounds {
  /** First and last departure, local minutes after midnight. */
  depFirst: number;
  depLast: number;
  /** Cheapest and most expensive fare today, whole dollars. */
  fareMin: number;
  fareMax: number;
}

/**
 * The view a query string asks for. With the day's `bounds`, a limit at or past
 * the day's own edge (earlier than the first departure, a cap above the dearest
 * fare, a window the wrong way round) is dropped: it would change nothing.
 */
export function parseView(params: Params, scores: boolean, bounds?: Bounds): ResultsView {
  const airlines = new Set(
    list(params.get("airline"))
      .map((a) => a.toUpperCase())
      .filter((a) => /^[A-Z0-9]{2}$/.test(a)),
  );
  const min = Number(params.get("min"));
  let depFrom = parseClock(params.get("dep_from"));
  let depTo = parseClock(params.get("dep_to"));
  let maxPrice = parsePrice(params.get("max_price"));
  if (depFrom !== null && depTo !== null && depFrom > depTo) {
    depFrom = null;
    depTo = null;
  }
  if (bounds) {
    if (depFrom !== null && depFrom <= bounds.depFirst) depFrom = null;
    if (depTo !== null && depTo >= bounds.depLast) depTo = null;
    if (maxPrice !== null && maxPrice >= bounds.fareMax) maxPrice = null;
  }
  return {
    scores,
    sort: usableSort(params.get("sort"), scores),
    depFrom,
    depTo,
    maxPrice,
    airlines: [...airlines].sort(),
    wide: params.get("wide") === "1",
    min: scores && (min === 75 || min === 85) ? min : 0,
  };
}

/**
 * The same view for another day whose scores may or may not exist yet: the
 * default sort stays "the default", and what needs scores is dropped when the
 * other day has none. The hard limits travel with it (the other day drops
 * any that change nothing there when it parses them).
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
    dep_from: view.depFrom !== null ? clockParam(view.depFrom) : undefined,
    dep_to: view.depTo !== null ? clockParam(view.depTo) : undefined,
    max_price: view.maxPrice !== null ? String(view.maxPrice) : undefined,
    airline: view.airlines.length ? view.airlines.join(",") : undefined,
    wide: view.wide ? "1" : undefined,
    min: view.min ? String(view.min) : undefined,
  };
}

/**
 * Campaign parameters in the current query string (utm_source, utm_medium…),
 * so a filter change or a nearby date — the same results page — keeps the
 * link's attribution for the page view that follows. Anything else is left out.
 */
export function campaignParams(params: Params & { keys?(): Iterable<string> }): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (!params.keys) return out;
  for (const name of params.keys()) {
    if (/^utm_[a-z]+$/.test(name) && !(name in out)) out[name] = params.get(name)?.slice(0, 200) || undefined;
  }
  return out;
}

/** The results page for a route and day with this sort and these filters (commas kept readable). `extra`: parameters to keep (campaign tags); `base`: the tool's path. */
export function resultsHref(day: RouteDay, view: ResultsView, extra: Record<string, string | undefined> = {}, base: ToolBase = "/c"): string {
  return hrefsFor(base).search(day, { ...extra, ...viewParams(view) }).replace(/%2C/gi, ",");
}

export function activeFilterCount(view: ResultsView): number {
  return (
    (view.depFrom !== null ? 1 : 0) +
    (view.depTo !== null ? 1 : 0) +
    (view.maxPrice !== null ? 1 : 0) +
    view.airlines.length +
    (view.wide ? 1 : 0) +
    (view.min ? 1 : 0)
  );
}

export function withoutFilters(view: ResultsView): ResultsView {
  return { scores: view.scores, sort: view.sort, depFrom: null, depTo: null, maxPrice: null, airlines: [], wide: false, min: 0 };
}

export function toggled<T>(values: readonly T[], value: T, order: readonly T[]): T[] {
  const next = values.includes(value) ? values.filter((v) => v !== value) : [...values, value];
  return order.filter((v) => next.includes(v));
}

export function matchesView(option: FlightOption, view: ResultsView, daysUntil: number): boolean {
  const { flight } = option;
  const depart = timeToMinutes(flight.departTime);
  if (view.depFrom !== null && depart < view.depFrom) return false;
  if (view.depTo !== null && depart > view.depTo) return false;
  if (view.maxPrice !== null && fareAt(option, daysUntil) > view.maxPrice) return false;
  if (view.airlines.length && !view.airlines.includes(flight.airline.code)) return false;
  if (view.wide && flight.aircraft.bodyType !== "wide") return false;
  if (view.scores && view.min && flight.smoothness.score < view.min) return false;
  return true;
}

const byDeparture = (a: FlightOption, b: FlightOption) =>
  a.flight.departTime.localeCompare(b.flight.departTime) || a.key.localeCompare(b.key);

type Compare = (a: FlightOption, b: FlightOption) => number;

function comparator(sort: SortKey, daysUntil: number): Compare {
  switch (sort) {
    case "smoothest":
      return (a, b) => b.flight.smoothness.score - a.flight.smoothness.score || byDeparture(a, b);
    // Never by score: before the forecast is out a hidden score must not order the list.
    case "cheapest":
      return (a, b) => fareAt(a, daysUntil) - fareAt(b, daysUntil) || byDeparture(a, b);
    case "fastest":
      return (a, b) => a.flight.blockMin - b.flight.blockMin || byDeparture(a, b);
    case "departure":
      return byDeparture;
  }
}

/** The flights this view shows, in its order (a new array — the cached results are frozen). Ties go by departure time. */
export function applyView(options: readonly FlightOption[], view: ResultsView, daysUntil: number): FlightOption[] {
  const sort = !view.scores && SCORE_SORTS.includes(view.sort) ? "departure" : view.sort;
  return options.filter((o) => matchesView(o, view, daysUntil)).sort(comparator(sort, daysUntil));
}

/** "smoothest first" etc. — how the list is ordered, for its accessible name. */
export const SORT_ORDER_TEXT: Record<SortKey, string> = {
  smoothest: "smoothest first",
  cheapest: "lowest fare first",
  fastest: "shortest first",
  departure: "earliest departure first",
};

// ── Marks: the flights that lead the list on one count ──────────────────────

export type Mark = "smoothest" | "cheapest" | "fastest";

export const MARK_ORDER: readonly Mark[] = ["smoothest", "cheapest", "fastest"];

/**
 * Which of the listed flights are the smoothest (only once scores exist), the
 * cheapest and the fastest — facts about the list on screen, so they follow
 * the filters. Tied flights are all marked, unless the tie covers more than a
 * third of the list: published block times sit on a 5-minute grid, so five of
 * fourteen flights can share the shortest one, and a pill on each tells
 * nothing apart (the compare page's leaders() blanks an all-column tie the
 * same way). One flight alone earns nothing.
 */
export function marksFor(shown: readonly FlightOption[], scores: boolean, daysUntil: number): Map<string, Mark[]> {
  const marks = new Map<string, Mark[]>();
  if (shown.length < 2) return marks;
  const lead = (mark: Mark, value: (o: FlightOption) => number, best: "max" | "min") => {
    const values = shown.map(value);
    const target = best === "max" ? Math.max(...values) : Math.min(...values);
    const tied = values.filter((v) => v === target).length;
    if (tied > 1 && tied * 3 > shown.length) return;
    shown.forEach((o, i) => {
      if (values[i] !== target) return;
      const list = marks.get(o.key) ?? [];
      list.push(mark);
      marks.set(o.key, list);
    });
  };
  if (scores) lead("smoothest", (o) => o.flight.smoothness.score, "max");
  lead("cheapest", (o) => fareAt(o, daysUntil), "min");
  lead("fastest", (o) => o.flight.blockMin, "min");
  return marks;
}

// ── Filter options (from the whole day, not the filtered list) ──────────────

export interface AirlineFacet {
  code: string;
  name: string;
  count: number;
  lowestFareUsd: number;
}

export interface Facets {
  total: number;
  /** By name. */
  airlines: AirlineFacet[];
  wideCount: number;
  /** Flights at or above each minimum. */
  atLeast: Record<MinScore, number>;
  /** The day's span: what the departure window and the price cap default to. */
  bounds: Bounds;
}

const EMPTY_BOUNDS: Bounds = { depFirst: 0, depLast: 1439, fareMin: 0, fareMax: 0 };

export function buildFacets(options: readonly FlightOption[], daysUntil: number): Facets {
  const airlines = new Map<string, AirlineFacet>();
  let wideCount = 0;
  let depFirst = Infinity;
  let depLast = -Infinity;
  let fareMin = Infinity;
  let fareMax = -Infinity;
  const atLeast: Record<MinScore, number> = { 0: options.length, 75: 0, 85: 0 };
  for (const option of options) {
    const { flight } = option;
    const fare = fareAt(option, daysUntil);
    const depart = timeToMinutes(flight.departTime);
    depFirst = Math.min(depFirst, depart);
    depLast = Math.max(depLast, depart);
    fareMin = Math.min(fareMin, fare);
    fareMax = Math.max(fareMax, fare);
    const current = airlines.get(flight.airline.code);
    if (current) {
      current.count += 1;
      current.lowestFareUsd = Math.min(current.lowestFareUsd, fare);
    } else {
      airlines.set(flight.airline.code, {
        code: flight.airline.code,
        name: flight.airline.name,
        count: 1,
        lowestFareUsd: fare,
      });
    }
    if (flight.aircraft.bodyType === "wide") wideCount += 1;
    if (flight.smoothness.score >= 75) atLeast[75] += 1;
    if (flight.smoothness.score >= 85) atLeast[85] += 1;
  }
  return {
    total: options.length,
    airlines: [...airlines.values()].sort((a, b) => a.name.localeCompare(b.name)),
    wideCount,
    atLeast,
    bounds: options.length === 0 ? EMPTY_BOUNDS : { depFirst, depLast, fareMin, fareMax },
  };
}

/** An airline's name for a filter row or chip — also for one that has no flights this day (never a bare code if known). */
export function airlineName(code: string, facets: Pick<Facets, "airlines">): string {
  return facets.airlines.find((a) => a.code === code)?.name ?? getAirline(code)?.name ?? code;
}
