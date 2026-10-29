import { fareAt, type FlightOption } from "@preflight/shared/search";
import { forYouScore, rateFlight, type Rating, type RatingCategory } from "@preflight/shared/ratings";
import { hrefsFor, type RouteDay } from "@/lib/c/model";
import { defaultSortFor, matchesView, parseView, viewParams, type Bounds, type ResultsView } from "@/components/c/search/view";

/*
 * Version D's results view (docs/ITERATION_2.md): the same hard filters as
 * version C (departure window, highest fare, airlines, wide-body) with D's own
 * sort — "For you" follows the visitor's priorities — and no smoothness-score
 * filter (D never shows the score as a headline). Pure; the URL is the state.
 */

export type DSortKey = "foryou" | "cheapest" | "fastest" | "departure";
export const D_SORT_KEYS: readonly DSortKey[] = ["foryou", "cheapest", "fastest", "departure"];
export const D_DEFAULT_SORT: DSortKey = "foryou";
export const D_SORT_LABELS: Record<DSortKey, string> = {
  foryou: "For you",
  cheapest: "Cheapest",
  fastest: "Fastest",
  departure: "Departure time",
};
/** One calm line under the list saying what the order means. */
export const D_SORT_ORDER_TEXT: Record<DSortKey, string> = {
  foryou: "Sorted for what matters to you; ties go to the cheaper flight.",
  cheapest: "Cheapest first.",
  fastest: "Shortest flight first.",
  departure: "Earliest departure first.",
};

export interface DResultsView {
  /** The filters (C's view with its sort fixed at the day's default and no score filter). */
  filters: ResultsView;
  sort: DSortKey;
}

interface Params {
  get(name: string): string | null;
}

export function parseDSort(value: string | null): DSortKey {
  return D_SORT_KEYS.find((key) => key === value) ?? D_DEFAULT_SORT;
}

/** The view in the query string (unknown values fall back; limits at the day's edges are dropped like C's). */
export function parseDView(params: Params, scores: boolean, bounds?: Bounds): DResultsView {
  const filters = parseView(params, scores, bounds);
  return { filters: { ...filters, sort: defaultSortFor(scores), min: 0 }, sort: parseDSort(params.get("sort")) };
}

/** Query parameters for a view (defaults dropped). */
export function dViewParams(view: DResultsView): Record<string, string | undefined> {
  const { sort: _sort, min: _min, ...filters } = viewParams(view.filters);
  void _sort;
  void _min;
  return { ...filters, sort: view.sort === D_DEFAULT_SORT ? undefined : view.sort };
}

/** /d/search for a route and day with this view (commas kept readable). `extra`: parameters to keep (campaign tags). */
export function dResultsHref(day: RouteDay, view: DResultsView, extra: Record<string, string | undefined> = {}): string {
  return hrefsFor("/d")
    .search(day, { ...extra, ...dViewParams(view) })
    .replace(/%2C/gi, ",");
}

export function dWithoutFilters(view: DResultsView): DResultsView {
  return { ...view, filters: { ...view.filters, depFrom: null, depTo: null, maxPrice: null, airlines: [], wide: false, min: 0 } };
}

export function dActiveFilterCount(view: DResultsView): number {
  const f = view.filters;
  return (f.depFrom !== null ? 1 : 0) + (f.depTo !== null ? 1 : 0) + (f.maxPrice !== null ? 1 : 0) + (f.airlines.length ? 1 : 0) + (f.wide ? 1 : 0);
}

/** The ratings of every option on the day, by option key (deterministic; compute once per day with useMemo). */
export function ratingsByKey(options: readonly FlightOption[], today: string): Map<string, Rating[]> {
  const map = new Map<string, Rating[]>();
  for (const option of options) map.set(option.key, rateFlight({ option, today }));
  return map;
}

function minutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

/**
 * The options that pass the filters, in the view's order. "For you" ranks by
 * the priorities-weighted rating score, then the cheaper fare, then departure
 * time, so the list is stable and ties favour the cheaper flight.
 */
export function applyDView(
  options: readonly FlightOption[],
  view: DResultsView,
  daysUntil: number,
  order: readonly RatingCategory[],
  ratings: Map<string, Rating[]>,
): FlightOption[] {
  const shown = options.filter((option) => matchesView(option, view.filters, daysUntil));
  const fare = (o: FlightOption) => fareAt(o, daysUntil);
  const byDeparture = (a: FlightOption, b: FlightOption) => minutes(a.flight.departTime) - minutes(b.flight.departTime);
  const score = (o: FlightOption) => forYouScore(ratings.get(o.key) ?? [], order);
  switch (view.sort) {
    case "foryou":
      return shown.sort((a, b) => score(b) - score(a) || fare(a) - fare(b) || byDeparture(a, b));
    case "cheapest":
      return shown.sort((a, b) => fare(a) - fare(b) || byDeparture(a, b));
    case "fastest":
      return shown.sort((a, b) => a.flight.blockMin - b.flight.blockMin || fare(a) - fare(b) || byDeparture(a, b));
    case "departure":
      return shown.sort(byDeparture);
  }
}

/** The cheapest fare among the options on the day (null with none). */
export function cheapestFare(options: readonly FlightOption[], daysUntil: number): number | null {
  let min: number | null = null;
  for (const option of options) {
    const fare = fareAt(option, daysUntil);
    if (min === null || fare < min) min = fare;
  }
  return min;
}

/** "+$42 vs cheapest" for the card, "Cheapest" at the floor. */
export function priceDeltaText(fare: number, cheapest: number | null): string {
  if (cheapest === null || fare <= cheapest) return "Cheapest";
  return `+$${(fare - cheapest).toLocaleString("en-US")} vs cheapest`;
}
