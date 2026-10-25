"use client";

import { ArrowRight, CalendarClock, CalendarDays, Compass, Info, MapPin, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useOptimistic, useRef, useState, useTransition, type ReactNode } from "react";
import { getAirport } from "@preflight/shared/airports";
import { getForecastStatus } from "@preflight/shared/forecast";
import { searchFlights, type FlightOption, type SearchResults as DayResults } from "@preflight/shared/search";
import { availabilityAt, daysToDeparture, hasLeft, marker } from "@/components/c/common/availability";
import { Sheet } from "@/components/c/common/Sheet";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { keepClearOfTray } from "@/components/c/shell/CompareTray";
import { useCompareList } from "@/lib/c/compare-store";
import { formatFare, formatMinutes12 } from "@/lib/c/format";
import { itemId, searchHref, type CompareItem, type RouteDay } from "@/lib/c/model";
import { useNowMs, useTodayISO } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { monthDay, routeText } from "../flight/copy";
import { DateStrip } from "./DateStrip";
import { Filters } from "./Filters";
import { checkQuery, issueMessage, type QueryCheck, type SearchDraft } from "./query";
import { ResultCard } from "./ResultCard";
import { airportSwapNote, nearbyRoutes, routeHasNoNonstops, sameArea } from "./routes";
import { SearchForm } from "./SearchForm";
import { SearchSummary } from "./SearchSummary";
import { ResultsSkeleton } from "./Skeletons";
import { SortTabs } from "./SortTabs";
import { track } from "@/lib/analytics";
import {
  activeFilterCount,
  airlineName,
  applyView,
  buildFacets,
  campaignParams,
  defaultSortFor,
  marksFor,
  parseView,
  resultsHref,
  SCORE_SORTS,
  SORT_ORDER_TEXT,
  viewForDay,
  withoutFilters,
  type Mark,
  type ResultsView,
} from "./view";

type Params = ReturnType<typeof useSearchParams>;

/**
 * /c/search — results for one route and day. Reads the query string (inside
 * the page's <Suspense>), shows the skeleton until today's date is known on
 * the client, then either the results or a calm message with the search form.
 * Only from, to, date and the sort / filter parameters are read; anything
 * else in the link (utm_* tags and the like) is ignored here and kept on the
 * page's own links (campaignParams).
 */
export function SearchResults() {
  const params = useSearchParams();
  const today = useTodayISO();
  if (!today) return <ResultsSkeleton />;
  const check = checkQuery(params, today);
  if (!check.day) return <InvalidSearch key={params.toString()} check={check} today={today} params={params} />;
  return <Results day={check.day} params={params} today={today} />;
}

/** The sort a new search keeps (the day's default isn't carried: the new day picks its own). */
function carryFor(view: Pick<ResultsView, "sort" | "scores">): Record<string, string | undefined> {
  return { sort: view.sort === defaultSortFor(view.scores) ? undefined : view.sort };
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
const NO_MARKS: readonly Mark[] = [];

/** Ids that clearing or removing a filter sends focus to (never <body>). */
const FILTERS_TITLE_ID = "c-filters-title";
const FILTERS_BUTTON_ID = "c-filters-button";
const COUNT_ID = "c-results-count";

/** What the sign-up card records as the visitor's context: "JFK → LAX · Nov 26 · 14 flights". */
function signupContext(day: RouteDay, total: number): string {
  const flights = total === 0 ? "no nonstop flights" : `${total} ${total === 1 ? "flight" : "flights"}`;
  return `${routeText(day.origin, day.destination)} · ${monthDay(day.date)} · ${flights}`;
}

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
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useSheetState();
  const nowMs = useNowMs();
  // Where focus goes once a filter change has rendered (the control used may be gone).
  const focusNext = useRef<string | null>(null);
  const { origin, destination, date } = day;
  // Time-aware (docs/VERSION_C.md): flight-specific turbulence only exists from 2 days before departure.
  const daysUntil = daysToDeparture(today, date);
  const avail = availabilityAt(today, date);
  const scores = avail.turbulence;
  const { from: forecastFrom, lead: forecastLead } = marker("turbulence", date);
  // Campaign tags in the link stay on this page's own links (filters, nearby dates).
  const campaign = useMemo(() => campaignParams(params), [params]);

  const search = useMemo(() => runSearch(origin, destination, date), [origin, destination, date]);
  // The date strip is computed after the day's own results (first paint first).
  const stripDay = parseDayKey(useDeferredValue(dayKey(day), ""));

  const dayOptions = search.ok ? search.results.options : NO_OPTIONS;
  // Flights that have already left (today, in their origin's time) aren't offered: no fare, score, gate or
  // Compare. Sorting, filters and the counts only see the flights still to leave.
  const mayHaveLeft = daysToDeparture(today, date) <= 1;
  const options = useMemo(
    () => (mayHaveLeft ? dayOptions.filter((o) => !hasLeft(o.flight, nowMs)) : dayOptions),
    [dayOptions, mayHaveLeft, nowMs],
  );
  const leftCount = dayOptions.length - options.length;
  const dayWord = date === today ? "today" : "this day";
  // Fares are today's (fareAt: the booking lead time moves them), so the facets, the sort and the
  // price cap all take the days until departure.
  const facets = useMemo(() => buildFacets(options, daysUntil), [options, daysUntil]);
  const urlView = useMemo(() => parseView(params, scores, facets.bounds), [params, scores, facets.bounds]);
  // Sort and filters live in the URL; the optimistic copy shows a change on this frame while the URL catches up.
  const [view, setOptimisticView] = useOptimistic(urlView);
  const shown = useMemo(() => applyView(options, view, daysUntil), [options, view, daysUntil]);
  const marks = useMemo(() => marksFor(shown, scores, daysUntil), [shown, scores, daysUntil]);
  const filterCount = activeFilterCount(view);
  const total = options.length;
  // No flights this day: is it the day, or does nobody fly this route nonstop at all?
  const routeEmpty = useMemo(
    () => search.ok && dayOptions.length === 0 && routeHasNoNonstops({ origin, destination, date }),
    [search.ok, dayOptions.length, origin, destination, date],
  );
  const swapNote = airportSwapNote(day, dayOptions);
  const history = dayOptions[0]?.flight.turbulence.history ?? null;

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

  function changeView(next: ResultsView, focusId?: string) {
    if (focusId) focusNext.current = focusId;
    track("c_results_view", {
      sort: next.sort,
      dep_from: next.depFrom,
      dep_to: next.depTo,
      max_price: next.maxPrice,
      airlines: next.airlines.join(","),
      wide: next.wide,
      min_score: next.min ?? null,
    });
    startTransition(() => {
      setOptimisticView(next);
      router.replace(resultsHref(day, next, campaign), { scroll: false });
    });
  }

  const clearFilters = (focusId?: string) => changeView(withoutFilters(view), focusId);
  const hrefFor = (d: string) => resultsHref({ ...day, date: d }, viewForDay(view, availabilityAt(today, d).turbulence), campaign);
  const scoresNote = `From ${forecastFrom}, when the turbulence forecast for these flights comes out (${forecastLead}).`;

  if (routeEmpty) {
    return (
      <div className="flex flex-col gap-4 sm:gap-5">
        <SearchSummary day={day} today={today} carry={carryFor(view)} />
        <p role="status" className="sr-only">
          No nonstop flights on this route
        </p>
        <NoNonstops day={day} carry={carryFor(view)} />
        <InterestCard placement="c_results" context={signupContext(day, 0)} className="mt-2" />
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
      <SearchSummary day={day} today={today} carry={carryFor(view)} />

      <DateStrip day={day} stripDay={stripDay} today={today} nowMs={nowMs} hrefFor={hrefFor} />

      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside
          aria-labelledby="c-filters-title"
          className="hidden rounded-3xl bg-surface/60 p-5 ring-1 ring-line/60 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
            <h2 id={FILTERS_TITLE_ID} tabIndex={-1} className="rounded-md text-base font-bold text-ink-900">
              Filters
            </h2>
            {filterCount > 0 ? (
              <button
                type="button"
                onClick={() => clearFilters(FILTERS_TITLE_ID)}
                className="-mr-2 h-11 rounded-full px-3 text-sm font-semibold text-breeze-700 transition-colors hover:bg-breeze-50"
              >
                Clear all
              </button>
            ) : null}
          </div>
          <Filters
            idPrefix="side"
            facets={facets}
            view={view}
            onChange={changeView}
            scoresNote={scoresNote}
          />
        </aside>

        <section aria-labelledby="c-flights-title" className="min-w-0">
          <h2 id="c-flights-title" className="sr-only">
            Flights
          </h2>
          {!scores && total > 0 ? (
            <ScoresLater
              forecastFrom={forecastFrom}
              daysAway={daysToDeparture(today, date)}
              lead={forecastLead}
              history={history}
              className="mb-3"
            />
          ) : null}

          <SortTabs
            value={view.sort}
            onChange={(sort) => changeView({ ...view, sort })}
            unavailable={scores ? undefined : SCORE_SORTS}
            note={scores ? undefined : `Smoothest from ${forecastFrom} · ${forecastLead}`}
          />

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
              {scores && history && total > 0 ? (
                <p className="mt-0.5 text-xs leading-snug text-ink-500">
                  Scores from the latest turbulence forecasts ·{" "}
                  {getForecastStatus(daysToDeparture(today, date), history).confidenceLabel.toLowerCase()}
                </p>
              ) : null}
            </div>
            <button
              id={FILTERS_BUTTON_ID}
              type="button"
              onClick={() => setFiltersOpen(true)}
              aria-haspopup="dialog"
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-surface px-4 text-sm font-semibold text-ink-900 ring-1 ring-inset ring-line-strong transition-colors hover:bg-canvas lg:hidden"
            >
              <SlidersHorizontal aria-hidden className="size-4 text-ink-500" />
              Filters
              {filterCount > 0 ? (
                <>
                  <span
                    aria-hidden
                    className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-night-900 px-1.5 text-[11px] font-bold text-white tabular-nums"
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
              view={view}
              facets={facets}
              onChange={changeView}
              onClear={() => clearFilters(FILTERS_BUTTON_ID)}
              lastFocusId={FILTERS_BUTTON_ID}
              className="mt-1 lg:hidden"
            />
          ) : null}

          <div className="mt-3">
            {!search.ok ? (
              <Notice
                icon={<Compass />}
                title="These flights couldn’t be put together"
                text="Something went wrong building this day’s illustrative flights. Try a nearby date or another route."
              />
            ) : total === 0 && leftCount > 0 ? (
              <Notice
                icon={<CalendarDays />}
                title={`The last nonstop flight ${dayWord} has left`}
                text="Pick a later date above, or change the search."
              />
            ) : total === 0 ? (
              <Notice
                icon={<CalendarDays />}
                title="No nonstop flights this day"
                text="Pick a nearby date above, or change the search."
              />
            ) : shown.length === 0 ? (
              <Notice
                icon={<SlidersHorizontal />}
                title="No flights match these filters"
                text={`There ${total === 1 ? "is 1 nonstop flight" : `are ${total} nonstop flights`} this day. Clear a filter or two to see more.`}
                action={
                  <button
                    type="button"
                    onClick={() => clearFilters(COUNT_ID)}
                    className="mt-4 inline-flex h-11 items-center rounded-full bg-night-900 px-5 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-night-800"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <ol aria-label={`Flights, ${SORT_ORDER_TEXT[view.sort]}`} className="flex flex-col gap-3">
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
                    <li key={option.key}>
                      <ResultCard
                        option={option}
                        item={item}
                        daysUntil={daysUntil}
                        marks={marks.get(option.key) ?? NO_MARKS}
                        campaign={campaign}
                        scores={scores}
                        airframe={avail.airframe}
                        forecastFrom={forecastFrom}
                        forecastLead={forecastLead}
                        position={index + 1}
                        inCompare={inCompare}
                        compareLocked={compare.isFull && !inCompare}
                        onToggleCompare={(control) => {
                          track("c_compare_toggle", { from: "results", added: !inCompare, key: item.key, has_scores: scores });
                          compare.toggle(item);
                          keepClearOfTray(control);
                        }}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </section>
      </div>

      {/* After the day's flights (docs/INTEREST.md). In flow, so the sticky tray never covers its button. */}
      <InterestCard placement="c_results" context={signupContext(day, total)} className="mt-2" />

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
          <Filters
            idPrefix="sheet"
            facets={facets}
            view={view}
            onChange={changeView}
            scoresNote={scoresNote}
            className="pt-2"
          />
        </Sheet>
      ) : null}
    </div>
  );
}

function Notice({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl bg-surface px-5 py-8 text-center shadow-soft ring-1 ring-line/80">
      <span
        aria-hidden
        className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100 [&_svg]:size-5"
      >
        {icon}
      </span>
      <p className="mt-4 text-base font-bold text-ink-900">{title}</p>
      <p className="mx-auto mt-1.5 max-w-[42ch] text-sm leading-relaxed text-ink-500">{text}</p>
      {action}
    </div>
  );
}

/**
 * Before the turbulence forecast is out: when the scores appear, what can be
 * compared now, and how the route usually flies that month (labelled typical).
 */
function ScoresLater({
  forecastFrom,
  daysAway,
  lead,
  history,
  className,
}: {
  forecastFrom: string;
  daysAway: number;
  /** "2 days before departure" */
  lead: string;
  history: FlightOption["flight"]["turbulence"]["history"] | null;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-3xl bg-surface p-4 shadow-soft ring-1 ring-line/80", className)}>
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100"
      >
        <CalendarClock className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold leading-snug text-ink-900">Smoothness scores from {forecastFrom}</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-700">
          This day is {daysAway} days away. The turbulence forecast for each flight comes out {lead}; until
          then you can compare times, fares, aircraft and airlines.
        </p>
        {history ? (
          <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
            Typical for {history.month}: about <span className="tabular-nums">{history.smoothPct}%</span> of flights on this
            route have little or no turbulence (from about{" "}
            <span className="tabular-nums">{history.flightsAnalyzed.toLocaleString("en-US")}</span> past flights with
            turbulence reports).
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A route no airline flies nonstop: say so calmly and offer nearby routes that
 * have flights (when there are some). Two airports in one metro area get their own sentence.
 */
function NoNonstops({ day, carry }: { day: RouteDay; carry: Record<string, string | undefined> }) {
  const { origin: from, destination: to, date } = day;
  const suggestions = useMemo(() => nearbyRoutes({ origin: from, destination: to, date }), [from, to, date]);
  const area = useMemo(() => sameArea({ origin: from, destination: to, date }), [from, to, date]);
  const origin = getAirport(day.origin);
  const destination = getAirport(day.destination);
  const city = (code: string) => getAirport(code)?.city ?? code;
  return (
    <section
      aria-labelledby="c-no-nonstops"
      className="rounded-3xl bg-surface px-5 py-8 text-center shadow-soft ring-1 ring-line/80 sm:px-8"
    >
      <span
        aria-hidden
        className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100"
      >
        <Compass className="size-5" />
      </span>
      <h2 id="c-no-nonstops" className="mt-4 text-base font-bold text-ink-900">
        {area ? "No flights between these airports" : "No nonstop flights on this route"}
      </h2>
      <p className="mx-auto mt-1.5 max-w-[48ch] text-sm leading-relaxed text-ink-500">
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
                href={searchHref(route, carry)}
                className="flex min-h-14 items-center justify-between gap-3 rounded-2xl bg-canvas px-4 py-2 ring-1 ring-inset ring-line transition-colors hover:bg-line/40"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-bold tracking-wide text-ink-900">
                    {route.origin}
                    <ArrowRight aria-hidden className="size-3.5 shrink-0 text-ink-400" />
                    <span className="sr-only"> to </span>
                    {route.destination}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-500">
                    {city(route.origin)} – {city(route.destination)}
                  </span>
                </span>
                <ArrowRight aria-hidden className="size-4 shrink-0 text-breeze-700" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mx-auto mt-4 flex max-w-[48ch] items-start justify-center gap-1.5 text-xs leading-relaxed text-ink-500">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
        <span>{suggestions.length ? "Or use “Change” above to pick another route." : "Use “Change” above to pick another route."}</span>
      </p>
    </section>
  );
}

function chipId(key: string): string {
  return `c-filter-chip-${key}`;
}

function ActiveFilters({
  view,
  facets,
  onChange,
  onClear,
  lastFocusId,
  className,
}: {
  view: ResultsView;
  facets: ReturnType<typeof buildFacets>;
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
    ...(view.min ? [{ key: "min", label: `Smoothness ${view.min}+`, next: { ...view, min: 0 as const } }] : []),
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

function InvalidSearch({ check, today, params }: { check: QueryCheck; today: string; params: Params }) {
  const [draft, setDraft] = useState<SearchDraft>(check.draft);
  const message = issueMessage(check.issue ?? "empty", check.raw, today);
  // No day yet, so no forecast distance: only the sort is carried, and Smoothest counts as the default.
  const view = parseView(params, true);
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <section
        aria-labelledby="c-search-title"
        className="rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80 sm:p-6"
      >
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100"
          >
            <Compass className="size-5" />
          </span>
          <div className="min-w-0">
            <h1 id="c-search-title" className="text-xl font-bold leading-tight text-ink-900">
              {message.title}
            </h1>
            <p className="mt-1.5 max-w-[60ch] text-[15px] leading-relaxed text-ink-700">{message.text}</p>
          </div>
        </div>
        <div className="mt-5 border-t border-line/70 pt-5">
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
      <InterestCard placement="c_results" context="" className="mt-2" />
    </div>
  );
}
