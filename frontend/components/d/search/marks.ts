import { forYouScore, type Rating, type RatingCategory } from "@preflight/shared/ratings";
import type { FlightOption } from "@preflight/shared/search";
import type { RouteDay } from "@/lib/c/model";
import { monthDay, routeText } from "@/components/c/flight/copy";
import { dViewParams, type DResultsView } from "@/lib/d/view";

/*
 * Version D results: small pure helpers for the list (docs/ITERATION_2.md).
 * Safe in render / useMemo.
 */

/**
 * The flights on screen that lead on the visitor's priorities (the "For you"
 * score) — a fact about the list on screen, so it follows the filters, like
 * version C's marks. Tied flights are all marked, unless the tie covers more
 * than a third of the list (ratings weeks out come from the route's history,
 * so several flights often rate the same, and a marker on each tells nothing
 * apart). One flight alone earns nothing.
 */
export function smoothestForYou(
  shown: readonly FlightOption[],
  ratings: ReadonlyMap<string, readonly Rating[]>,
  order: readonly RatingCategory[],
): ReadonlySet<string> {
  const keys = new Set<string>();
  if (shown.length < 2) return keys;
  const scores = shown.map((o) => forYouScore(ratings.get(o.key) ?? [], order));
  const best = Math.max(...scores);
  const tied = scores.filter((s) => s === best).length;
  if (tied > 1 && tied * 3 > shown.length) return keys;
  shown.forEach((o, i) => {
    if (scores[i] === best) keys.add(o.key);
  });
  return keys;
}

/** The sort a new search keeps ("For you", the default, isn't carried). */
export function carryFor(view: DResultsView): Record<string, string | undefined> {
  return { sort: dViewParams(view).sort };
}

/** What the sign-up card records as the visitor's context: "JFK → LAX · Nov 26 · 14 flights". */
export function signupContext(day: RouteDay, total: number): string {
  const flights = total === 0 ? "no nonstop flights" : `${total} ${total === 1 ? "flight" : "flights"}`;
  return `${routeText(day.origin, day.destination)} · ${monthDay(day.date)} · ${flights}`;
}
