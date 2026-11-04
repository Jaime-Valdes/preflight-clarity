"use client";

import { ArrowRight, Info, MapPin, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { getAirport } from "@preflight/shared/airports";
import { CATEGORY_LABELS, orderByPriorities, type Rating, type RatingCategory } from "@preflight/shared/ratings";
import { searchFlights, type FlightOption, type SearchResults as DayResults } from "@preflight/shared/search";
import { availabilityAt, daysToDeparture, hasLeft } from "@/components/c/common/availability";
import { Sheet } from "@/components/c/common/Sheet";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { DateStrip } from "@/components/c/search/DateStrip";
import { Filters } from "@/components/c/search/Filters";
import { checkQuery, issueMessage, type QueryCheck, type SearchDraft } from "@/components/c/search/query";
import { airportSwapNote, nearbyRoutes, routeHasNoNonstops, sameArea } from "@/components/c/search/routes";
import { SearchForm } from "@/components/c/search/SearchForm";
import { SearchSummary } from "@/components/c/search/SearchSummary";
import { SortTabs } from "@/components/c/search/SortTabs";
import { airlineName, buildFacets, campaignParams, type Facets, type ResultsView } from "@/components/c/search/view";
import { keepClearOfTray } from "@/components/c/shell/CompareTray";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { DLoading } from "@/components/d/brand/Loading";
import { track } from "@/lib/analytics";
import { useCompareList } from "@/lib/c/compare-store";
import { formatFare, formatMinutes12 } from "@/lib/c/format";
import { itemId, type CompareItem, type RouteDay } from "@/lib/c/model";
import { usePriorities, type Priorities } from "@/lib/d/priorities";
import {
  applyDView,
  cheapestFare,
  D_SORT_KEYS,
  D_SORT_LABELS,
  D_SORT_ORDER_TEXT,
  dActiveFilterCount,
  dResultsHref,
  dWithoutFilters,
  parseDView,
  ratingsByKey,
  type DResultsView,
  type DSortKey,
} from "@/lib/d/view";
import { useNowMs, useTodayISO } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { DResultCard } from "./DResultCard";
import { carryFor, signupContext, smoothestForYou } from "./marks";

type Params = ReturnType<typeof useSearchParams>;

/**
 * /d/search — results for one route and day in version D (docs/ITERATION_2.md):
 * version C's time-aware search with the flights rated in plain words for what
 * matters to this visitor, sorted "For you" by default. Reads the query string
 * (inside the page's <Suspense>), shows the skeleton until today's date is
 * known on the client, then either the results or a calm message with the
 * search form (the same checks and wording as version C). Only from, to, date
 * and the sort / filter parameters are read; anything else in the link
 * (utm_* tags and the like) is ignored here and kept on the page's own links.
 */
export function DResults() {
  const params = useSearchParams();
  const today = useTodayISO();
  if (!today) return <DLoading />;
  const check = checkQuery(params, today);
  if (!check.day) return <InvalidSearch key={params.toString()} check={check} today={today} params={params} />;
  return <Results day={check.day} params={params} today={today} />;
}

function dayKey(day: RouteDay): string {
  return `${day.origin}.${day.destination}.${day.date}`;
}

function parseDayKey(key: string): RouteDay | null {
  const [origin, destination, date] = key.split(".");
  return origin && destination && date ? { origin, destination, date } : null;
}

type Search = { ok: true; results: DayResults } | { ok: false; error: unknown };

function runSearch(origin: string, destination: string, date: string): Search {
  try {
    return { ok: true, results: searchFlights({ origin, destination, date }) };
  } catch (error) {
    return { ok: false, error };
  }
}

const NO_OPTIONS: readonly FlightOption[] = [];
const NO_RATINGS: readonly Rating[] = [];

/** Ids that clearing or removing a filter sends focus to (never <body>). */
const FILTERS_TITLE_ID = "d-filters-title";
const FILTERS_BUTTON_ID = "d-filters-button";
const COUNT_ID = "d-results-count";
const ORDER_ID = "d-results-order";

/** Opens a sheet; Back/forward (a different page under it) closes it again. */
function useSheetState(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);
  return [open, setOpen];
}

function Results({ day, params, today }: { day: RouteDay; params: Params; today: string }) {
  const router = useRouter();
  const compare = useCompareList();
  const priorities = usePriorities();
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useSheetState();
  const nowMs = useNowMs();
  // Where focus goes once a filter change has rendered (the control used may be gone).
  const focusNext = useRef<string | null>(null);
  const { origin, destination, date } = day;
  // Time-aware (docs/FEASIBILITY.md): the ratings use the route's history weeks out and the
  // flight's own forecast within 2 days; the only thing the page itself needs to know is
  // whether that forecast exists (for the compare event) and whether the airframe is assigned.
  const daysUntil = daysToDeparture(today, date);
  const avail = availabilityAt(today, date);
  const scores = avail.turbulence;
  // Campaign tags in the link stay on this page's own links (filters, nearby dates).
  const campaign = useMemo(() => campaignParams(params), [params]);

  const search = useMemo(() => runSearch(origin, destination, date), [origin, destination, date]);
  // The date strip is computed after the day's own results (first paint first).
  const stripDay = parseDayKey(useDeferredValue(dayKey(day), ""));

  const dayOptions = search.ok ? search.results.options : NO_OPTIONS;
  // Flights that have already left (today, in their origin's time) aren't offered: no fare, no
  // Compare. Sorting, filters, the ratings and the counts only see the flights still to leave.
  const mayHaveLeft = daysUntil <= 1;
  const options = useMemo(
    () => (mayHaveLeft ? dayOptions.filter((o) => !hasLeft(o.flight, nowMs)) : dayOptions),
    [dayOptions, mayHaveLeft, nowMs],
  );
  const leftCount = dayOptions.length - options.length;
  const dayWord = date === today ? "today" : "this day";
  // Fares are today's (fareAt: the booking lead time moves them), so the facets, the sort and the
  // price cap all take the days until departure.
  const facets = useMemo(() => buildFacets(options, daysUntil), [options, daysUntil]);
  const urlView = useMemo(() => parseDView(params, scores, facets.bounds), [params, scores, facets.bounds]);
  // Sort and filters live in the URL; the optimistic copy shows a change on this frame while the URL catches up.
  const [view, setOptimisticView] = useOptimistic(urlView);
  // Every flight's four ratings, once per day (deterministic: the same flight and date always rate the same).
  const ratings = useMemo(() => ratingsByKey(options, today), [options, today]);
  const { order } = priorities;
  const shown = useMemo(() => applyDView(options, view, daysUntil, order, ratings), [options, view, daysUntil, order, ratings]);
  // "+$42 vs cheapest" is against the day's cheapest flight, whatever the filters — the same number the
  // flight page and the choice event use, so it never moves as filters come and go.
  const cheapest = useMemo(() => cheapestFare(options, daysUntil), [options, daysUntil]);
  const smoothest = useMemo(() => smoothestForYou(shown, ratings, order), [shown, ratings, order]);
  const filterCount = dActiveFilterCount(view);
  const total = options.length;
  // No flights this day: is it the day, or does nobody fly this route nonstop at all?
  const routeEmpty = useMemo(
    () => search.ok && dayOptions.length === 0 && routeHasNoNonstops({ origin, destination, date }),
    [search.ok, dayOptions.length, origin, destination, date],
  );
  const swapNote = airportSwapNote(day, dayOptions);
  const carry = carryFor(view);

  useEffect(() => {
    if (!search.ok) console.error(search.error);
  }, [search]);

  useEffect(() => {
    const id = focusNext.current;
    const target = id ? document.getElementById(id) : null;
    if (target) {
      focusNext.current = null;
      target.focus();
    }
  });

  function changeView(next: DResultsView, focusId?: string) {
    if (focusId) focusNext.current = focusId;
    track("d_results_view", {
      sort: next.sort,
      dep_from: next.filters.depFrom,
      dep_to: next.filters.depTo,
      max_price: next.filters.maxPrice,
      airlines: next.filters.airlines.join(","),
      wide: next.filters.wide,
    });
    startTransition(() => {
      setOptimisticView(next);
      router.replace(dResultsHref(day, next, campaign), { scroll: false });
    });
  }

  const changeFilters = (filters: ResultsView, focusId?: string) => changeView({ ...view, filters }, focusId);
  const changeSort = (sort: DSortKey) => {
    track("d_sort", { sort, from: "tabs" });
    changeView({ ...view, sort });
  };
  const clearFilters = (focusId?: string) => changeView(dWithoutFilters(view), focusId);
  // D's sorts don't depend on the day's forecast, so the same view serves every nearby date.
  const hrefFor = (d: string) => dResultsHref({ ...day, date: d }, view, campaign);

  if (routeEmpty) {
    return (
      <div className="flex flex-col gap-4 sm:gap-5">
        <SearchSummary day={day} today={today} carry={carry} />
        <p role="status" className="sr-only">
          No nonstop flights on this route
        </p>
        <NoNonstops day={day} carry={carry} />
        <InterestCard placement="d_results" context={signupContext(day, 0)} className="mt-2" />
      </div>
    );
  }

  const countText =
    total === 0
      ? leftCount > 0
        ? `No more nonstop flights ${dayWord}`
        : "No nonstop flights this day"
      : `${shown.length === total ? total : `${shown.length} of ${total}`} nonstop ${total === 1 ? "flight" : "flights"} · prices are illustrative`;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <SearchSummary day={day} today={today} carry={carry} />

      <PrioritiesStrip priorities={priorities} />

      <DateStrip day={day} stripDay={stripDay} today={today} nowMs={nowMs} hrefFor={hrefFor} showScores={false} />

      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside
          aria-labelledby={FILTERS_TITLE_ID}
          className="hidden rounded-[24px] bg-surface p-5 shadow-soft lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
            <h2 id={FILTERS_TITLE_ID} tabIndex={-1} className="rounded-md text-[17px] font-extrabold tracking-tight text-ink">
              Filters
            </h2>
            {filterCount > 0 ? (
              <button
                type="button"
                onClick={() => clearFilters(FILTERS_TITLE_ID)}
                className="-mr-2 h-11 rounded-full px-3 text-sm font-bold text-ink underline decoration-2 underline-offset-4 transition-colors hover:bg-ink/5"
              >
                Clear all
              </button>
            ) : null}
          </div>
          <Filters idPrefix="side" facets={facets} view={view.filters} onChange={(f) => changeFilters(f)} hideScoreFilter />
        </aside>

        <section aria-labelledby="d-flights-title" className="min-w-0">
          <h2 id="d-flights-title" className="sr-only">
            Flights
          </h2>

          <SortTabs keys={D_SORT_KEYS} labels={D_SORT_LABELS} value={view.sort} onChange={changeSort} />

          <div className="mt-2 flex min-h-11 items-center justify-between gap-3">
            <div className="min-w-0">
              <p id={COUNT_ID} role="status" tabIndex={-1} className="rounded-md text-sm leading-snug text-ink-500">
                {countText}
              </p>
              {leftCount > 0 && total > 0 ? (
                <p className="mt-0.5 text-xs leading-snug text-ink-500">
                  <span className="tabular-nums">{leftCount}</span> earlier {leftCount === 1 ? "flight has" : "flights have"}{" "}
                  left {dayWord}
                </p>
              ) : null}
            </div>
            <button
              id={FILTERS_BUTTON_ID}
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-bold text-ink ring-2 ring-inset ring-ink transition-[background-color,transform] duration-[120ms] hover:bg-ink/5 active:scale-[0.98] lg:hidden"
            >
              <SlidersHorizontal aria-hidden className="size-4" strokeWidth={2.25} />
              Filters
              {filterCount > 0 ? (
                <>
                  <span
                    aria-hidden
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-ink px-1.5 text-[11px] font-bold text-white tabular-nums"
                  >
                    {filterCount}
                  </span>
                  <span className="sr-only">({filterCount} on)</span>
                </>
              ) : null}
            </button>
          </div>

          {swapNote ? (
            <p className="mt-2 flex items-start gap-2 rounded-2xl bg-breeze-50/70 px-3.5 py-2.5 text-[13px] leading-snug text-ink-700 ring-1 ring-inset ring-breeze-100">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-breeze-700" />
              <span>{swapNote}</span>
            </p>
          ) : null}

          {filterCount > 0 ? (
            <ActiveFilters
              view={view.filters}
              facets={facets}
              onChange={changeFilters}
              onClear={() => clearFilters(FILTERS_BUTTON_ID)}
              lastFocusId={FILTERS_BUTTON_ID}
              className="mt-1 lg:hidden"
            />
          ) : null}

          <div className="mt-3">
            {!search.ok ? (
              <Notice
                title="These flights couldn’t be put together"
                text="Something went wrong building this day’s illustrative flights. Try a nearby date or another route."
              />
            ) : total === 0 && leftCount > 0 ? (
              <Notice
                title={`The last nonstop flight ${dayWord} has left`}
                text="Pick a later date above, or change the search."
              />
            ) : total === 0 ? (
              <Notice
                title="No nonstop flights this day"
                text="Pick a nearby date above, or change the search."
              />
            ) : shown.length === 0 ? (
              <Notice
                title="No flights match these filters"
                text={`There ${total === 1 ? "is 1 nonstop flight" : `are ${total} nonstop flights`} this day. Clear a filter or two to see more.`}
                action={
                  <button
                    type="button"
                    onClick={() => clearFilters(COUNT_ID)}
                    className="mt-5 inline-flex h-12 items-center rounded-full bg-ink px-6 text-[15px] font-bold text-white transition-transform duration-[120ms] active:scale-[0.98]"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <>
                <ol aria-label="Flights" aria-describedby={ORDER_ID} className="flex flex-col gap-3">
                  {shown.map((option, index) => {
                    // The flight's own airports: a long flight "from LGA" leaves from JFK, and is one flight either way.
                    const item: CompareItem = {
                      origin: option.flight.origin.code,
                      destination: option.flight.destination.code,
                      date,
                      key: option.key,
                    };
                    const id = itemId(item);
                    const inCompare = compare.has(id);
                    return (
                      <li key={option.key} className="animate-d-rise" style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
                        <DResultCard
                          option={option}
                          item={item}
                          daysUntil={daysUntil}
                          ratings={orderByPriorities(ratings.get(option.key) ?? NO_RATINGS, order)}
                          cheapest={cheapest}
                          smoothestForYou={smoothest.has(option.key)}
                          chosen={priorities.chosen}
                          campaign={campaign}
                          airframe={avail.airframe}
                          position={index + 1}
                          inCompare={inCompare}
                          compareLocked={compare.isFull && !inCompare}
                          onToggleCompare={(control) => {
                            track("d_compare_toggle", { from: "results", added: !inCompare, key: item.key, has_scores: scores });
                            compare.toggle(item);
                            keepClearOfTray(control);
                          }}
                        />
                      </li>
                    );
                  })}
                </ol>
                <p id={ORDER_ID} className="mt-3 text-xs leading-snug text-ink-500">
                  {D_SORT_ORDER_TEXT[view.sort]}
                </p>
              </>
            )}
          </div>
        </section>
      </div>

      {/* After the day's flights (docs/INTEREST.md). In flow, so the sticky tray never covers its button. */}
      <InterestCard placement="d_results" context={signupContext(day, total)} className="mt-2" />

      {filtersOpen ? (
        <Sheet
          title="Filters"
          onClose={() => setFiltersOpen(false)}
          footer={
            <>
              {/* The page's own status line is inert behind the sheet; this one speaks while it's open. */}
              <p role="status" className={cn("text-center text-[13px] text-ink-500", shown.length === 0 && "mb-2.5")}>
                {shown.length === 0 ? (
                  "No flights match these filters."
                ) : (
                  <span className="sr-only">
                    {shown.length} of {total} flights match.
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2">
                {/* aria-disabled, not disabled: focus stays on it after clearing (a disabled button drops it to <body>). */}
                <button
                  type="button"
                  onClick={() => {
                    if (filterCount > 0) clearFilters();
                  }}
                  aria-disabled={filterCount === 0 || undefined}
                  className="h-12 shrink-0 rounded-full px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-line/50 aria-disabled:cursor-default aria-disabled:text-ink-300 aria-disabled:hover:bg-transparent"
                >
                  Clear all
                </button>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="h-12 flex-1 rounded-full bg-night-900 px-5 text-[15px] font-semibold text-white shadow-lift transition-colors hover:bg-night-800 active:bg-night-950"
                >
                  {shown.length === 0 ? "Close" : `Show ${shown.length} ${shown.length === 1 ? "flight" : "flights"}`}
                </button>
              </div>
            </>
          }
        >
          <Filters idPrefix="sheet" facets={facets} view={view.filters} onChange={(f) => changeFilters(f)} hideScoreFilter className="pt-2" />
        </Sheet>
      ) : null}
    </div>
  );
}

/** The categories as they read mid-sentence: "Space & quiet first, then takeoff & landing". */
const PRIORITY_WORDS: Record<RatingCategory, string> = {
  cruise: "smooth cruise",
  takeoff_landing: "takeoff & landing",
  aircraft: "aircraft size",
  space: "space & quiet",
};

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * One quiet sentence saying what the flights are rated for — the visitor's
 * order from the home's setup — with the way back to change it. Short on
 * phones (the two categories the cards show; all four from sm), so the first
 * card's ratings stay on the first screen. Before the visitor has ranked
 * anything, the usual order and an invitation rather than "Change".
 */
function PrioritiesStrip({ priorities }: { priorities: Priorities }) {
  const hrefs = useHrefs();
  const { chosen, order } = priorities;
  const [first = "", second = "", third = "", fourth = ""] = order.map((category) => PRIORITY_WORDS[category]);
  const heading = chosen ? "Rated for you" : "Rated in the usual order";
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-surface py-2.5 pl-3.5 pr-4 shadow-soft">
      <CloudMascot className="w-10 shrink-0 sm:w-11" />
      <p className="min-w-0 text-[13px] leading-snug text-ink-soft sm:text-[14px]">
        {/* Screen readers get the whole order, numbered; the sentence is the same thing at a glance. */}
        <span className="sr-only">
          {heading}: {order.map((category, i) => `${i + 1}. ${CATEGORY_LABELS[category]}`).join(", ")}.{" "}
        </span>
        <span aria-hidden>
          <span className="font-bold text-ink">{heading}:</span> {sentenceCase(first)} first, then {second}
          <span className="hidden sm:inline">
            , {third} and {fourth}
          </span>
          {" · "}
        </span>
        <Link
          href={hrefs.home}
          className="relative inline-block whitespace-nowrap font-bold text-ink underline decoration-2 underline-offset-4 before:absolute before:inset-x-0 before:-inset-y-3.5 before:content-['']"
        >
          {chosen ? "Change what matters" : "Choose what matters"}
        </Link>
      </p>
    </div>
  );
}

/** An empty state: the mascot, one bold line, one quiet line, and (sometimes) one way on. */
function Notice({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return (
    <div className="animate-d-rise rounded-[24px] bg-surface px-5 py-8 text-center shadow-soft">
      <CloudMascot className="mx-auto w-24" />
      <p className="mt-4 text-balance text-[20px] font-extrabold leading-snug tracking-tight text-ink">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[42ch] text-[15px] leading-relaxed text-ink-soft">{text}</p>
      {action}
    </div>
  );
}

/**
 * A route no airline flies nonstop: say so calmly and offer nearby routes that
 * have flights (when there are some) — version C's wording and suggestions
 * (routes.ts). Two airports in one metro area get their own sentence.
 */
function NoNonstops({ day, carry }: { day: RouteDay; carry: Record<string, string | undefined> }) {
  const hrefs = useHrefs();
  const { origin: from, destination: to, date } = day;
  const suggestions = useMemo(() => nearbyRoutes({ origin: from, destination: to, date }), [from, to, date]);
  const area = useMemo(() => sameArea({ origin: from, destination: to, date }), [from, to, date]);
  const origin = getAirport(day.origin);
  const destination = getAirport(day.destination);
  const city = (code: string) => getAirport(code)?.city ?? code;
  return (
    <section
      aria-labelledby="d-no-nonstops"
      className="animate-d-rise rounded-[24px] bg-surface px-5 py-8 text-center shadow-soft sm:px-8"
    >
      <CloudMascot className="mx-auto w-24" />
      <h2 id="d-no-nonstops" className="mt-4 text-balance text-[20px] font-extrabold leading-snug tracking-tight text-ink">
        {area ? "No flights between these airports" : "No nonstop flights on this route"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[48ch] text-[15px] leading-relaxed text-ink-soft">
        {area ? (
          <>
            {day.origin} and {day.destination} are{" "}
            {area.city ? `both in ${area.city}` : `only about ${Math.round(area.km / 1.609)} miles apart`} — there are no
            flights between them.
          </>
        ) : (
          <>
            No airline flies {origin?.city ?? day.origin} ({day.origin}) to {destination?.city ?? day.destination} (
            {day.destination}) without a stop, and this tool only shows nonstop flights.
            {suggestions.length ? " Try a nearby major airport:" : null}
          </>
        )}
      </p>
      {suggestions.length ? (
        <ul className="mx-auto mt-4 grid max-w-xl gap-2 text-left sm:grid-cols-2">
          {suggestions.map((route) => (
            <li key={`${route.origin}-${route.destination}`} className="min-w-0">
              <Link
                href={hrefs.search(route, carry)}
                className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-canvas/70 px-4 py-2 transition-colors hover:bg-canvas"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold tracking-wide text-ink">
                    {route.origin}
                    <ArrowRight aria-hidden className="size-3.5 shrink-0 text-ink-mute" />
                    <span className="sr-only"> to </span>
                    {route.destination}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-mute">
                    {city(route.origin)} – {city(route.destination)}
                  </span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-ink" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mx-auto mt-4 flex max-w-[48ch] items-start justify-center gap-1.5 text-xs leading-relaxed text-ink-mute">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <span>{suggestions.length ? "Or use “Change” above to pick another route." : "Use “Change” above to pick another route."}</span>
      </p>
    </section>
  );
}

function chipId(key: string): string {
  return `d-filter-chip-${key}`;
}

/** The filters that are on, as chips a tap removes (phones — the sidebar shows them in place). */
function ActiveFilters({
  view,
  facets,
  onChange,
  onClear,
  lastFocusId,
  className,
}: {
  view: ResultsView;
  facets: Facets;
  /** `focusId`: where focus goes once the chip is gone. */
  onChange: (view: ResultsView, focusId: string) => void;
  onClear: () => void;
  /** Where focus goes when the last chip goes. */
  lastFocusId: string;
  className?: string;
}) {
  const chips: Array<{ key: string; label: string; next: ResultsView }> = [
    ...(view.depFrom !== null ? [{ key: "dep-from", label: `From ${formatMinutes12(view.depFrom)}`, next: { ...view, depFrom: null } }] : []),
    ...(view.depTo !== null ? [{ key: "dep-to", label: `Until ${formatMinutes12(view.depTo)}`, next: { ...view, depTo: null } }] : []),
    ...(view.maxPrice !== null ? [{ key: "max-price", label: `Up to ${formatFare(view.maxPrice)}`, next: { ...view, maxPrice: null } }] : []),
    ...view.airlines.map((code) => ({
      key: `airline-${code}`,
      label: airlineName(code, facets),
      next: { ...view, airlines: view.airlines.filter((x) => x !== code) },
    })),
    ...(view.wide ? [{ key: "wide", label: "Wide-body only", next: { ...view, wide: false } }] : []),
  ];
  return (
    <ul aria-label="Filters on" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip, index) => (
        <li key={chip.key}>
          <button
            id={chipId(chip.key)}
            type="button"
            onClick={() => {
              // The chip that takes its place (or the one before it); with none left, the Filters button.
              const next = chips[index + 1] ?? chips[index - 1];
              onChange(chip.next, next ? chipId(next.key) : lastFocusId);
            }}
            aria-label={`Remove filter: ${chip.label}`}
            className="relative inline-flex h-9 items-center gap-1 rounded-full bg-breeze-50 pl-3 pr-2 text-[13px] font-semibold text-breeze-700 ring-1 ring-inset ring-breeze-100 transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:bg-breeze-100"
          >
            {chip.label}
            <X aria-hidden className="size-3.5" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={onClear}
          className="relative h-9 rounded-full px-2.5 text-[13px] font-semibold text-ink-500 transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:text-ink-900"
        >
          Clear all
        </button>
      </li>
    </ul>
  );
}

/** A search link that can't be shown: the same calm messages as version C, with the form to fix it. */
function InvalidSearch({ check, today, params }: { check: QueryCheck; today: string; params: Params }) {
  const [draft, setDraft] = useState<SearchDraft>(check.draft);
  const message = issueMessage(check.issue ?? "empty", check.raw, today);
  // No day yet, so no forecast distance: only the sort is carried, and "For you" counts as the default.
  const view = parseDView(params, true);
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <section
        aria-labelledby="d-search-title"
        className="animate-d-rise rounded-[24px] bg-surface p-5 shadow-soft sm:p-7"
      >
        <div className="flex items-start gap-4">
          <CloudMascot className="w-16 shrink-0 sm:w-20" />
          <div className="min-w-0">
            <h1 id="d-search-title" className="text-balance text-[22px] font-extrabold leading-snug tracking-tight text-ink sm:text-[26px]">
              {message.title}
            </h1>
            <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">{message.text}</p>
          </div>
        </div>
        <div className="mt-5 border-t-2 border-dashed border-slate/50 pt-5">
          <SearchForm
            idPrefix="fix"
            today={today}
            draft={draft}
            onDraftChange={setDraft}
            carry={carryFor(view)}
            showHints={check.issue !== "empty"}
          />
        </div>
      </section>
      <InterestCard placement="d_results" context="" className="mt-2" />
    </div>
  );
}
