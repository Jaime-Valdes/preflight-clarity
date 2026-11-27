import { addDays, weekdayIndex } from "@preflight/shared/dates";

/*
 * Version D's landing, v3 (2026-11-27, after the Nov 19–23 ad test): the search on the first screen,
 * three example routes, a sample flight, and the priorities moved to the results. Every event from a
 * /d page carries `landing_version` (lib/analytics.ts), so the funnel can be split before / after.
 */

/** Stamped on every event sent from a /d page. */
export const LANDING_VERSION = "v3";

/** The search form's date: a week from today (version C keeps its own default, tomorrow). */
export const D_FORM_DAYS_AHEAD = 7;

export function dDefaultSearchDate(today: string): string {
  return addDays(today, D_FORM_DAYS_AHEAD);
}

/** One-tap example routes under the search, in this order (`position` in d_example_route is 1-based). */
export const EXAMPLE_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["JFK", "LAX"],
  ["LGA", "BOS"],
  ["JFK", "DEN"],
];

/** Friday. */
const EXAMPLE_WEEKDAY = 5;

/**
 * The example routes' and the sample flight's day: the first Friday at least a week out. It moves
 * once a week rather than every day, so the three examples cost about a dozen real route-days a month
 * (docs/REAL_DATA.md: a route-day is 4 of the 400 monthly AeroDataBox units) instead of ~90.
 */
export function exampleDate(today: string): string {
  const start = addDays(today, D_FORM_DAYS_AHEAD);
  return addDays(start, (EXAMPLE_WEEKDAY - weekdayIndex(start) + 7) % 7);
}

/** Set once this browser has opened D's results (any search: form, example, sample, or a link). */
const SEARCHED_KEY = "pfc.d.searched.v1";

export function markSearched(): void {
  try {
    if (!window.localStorage.getItem(SEARCHED_KEY)) window.localStorage.setItem(SEARCHED_KEY, new Date().toISOString());
  } catch {
    searchedInMemory = true;
  }
}

let searchedInMemory = false;

export function hasSearched(): boolean {
  try {
    return searchedInMemory || window.localStorage.getItem(SEARCHED_KEY) !== null;
  } catch {
    return searchedInMemory;
  }
}
