"use client";

import { ArrowRight, CalendarClock, CalendarDays, Compass, Info, MapPin, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useMemo, useOptimistic, useState, useTransition, type ReactNode } from "react";
import { getAirport } from "@preflight/shared/airports";
import { getForecastStatus } from "@preflight/shared/forecast";
import { searchFlights, type FlightOption, type SearchResults as DayResults } from "@preflight/shared/search";
import { availabilityOn, daysAhead, TURBULENCE_LEAD, turbulenceFromDate } from "@/components/c/common/availability";
import { Sheet } from "@/components/c/common/Sheet";
import { keepClearOfTray } from "@/components/c/shell/CompareTray";
import { useCompareList } from "@/lib/c/compare-store";
import { TIME_BUCKET_LABELS } from "@/lib/c/format";
import { itemId, searchHref, type CompareItem, type RouteDay } from "@/lib/c/model";
import { useTodayISO } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { DateStrip } from "./DateStrip";
import { Filters } from "./Filters";
import { checkQuery, issueMessage, type QueryCheck, type SearchDraft } from "./query";
import { ResultCard } from "./ResultCard";
import { airportSwapNote, nearbyRoutes, routeHasNoNonstops } from "./routes";
import { SearchForm } from "./SearchForm";
import { SearchSummary } from "./SearchSummary";
import { ResultsSkeleton } from "./Skeletons";
import { SortTabs } from "./SortTabs";
import {
  activeFilterCount,
  applyView,
  buildFacets,
  defaultSortFor,
  parseView,
  resultsHref,
  SCORE_SORTS,
  SORT_ORDER_TEXT,
  viewForDay,
  withoutFilters,
  type ResultsView,
} from "./view";

type Params = ReturnType<typeof useSearchParams>;

/**
 * /c/search — results for one route and day. Reads the query string (inside
 * the page's <Suspense>), shows the skeleton until today's date is known on
 * the client, then either the results or a calm message with the search form.
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

function Results({ day, params, today }: { day: RouteDay; params: Params; today: string }) {
  const router = useRouter();
  const compare = useCompareList();
  const [, startTransition] = useTransition();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { origin, destination, date } = day;
  // Time-aware (docs/VERSION_C.md): flight-specific turbulence only exists from 2 days before departure.
  const scores = availabilityOn(date, today).turbulence;
  const forecastFrom = turbulenceFromDate(date);

  const search = useMemo(() => runSearch(origin, destination, date), [origin, destination, date]);
  const urlView = useMemo(() => parseView(params, scores), [params, scores]);
  // Sort and filters live in the URL; the optimistic copy shows a change on this frame while the URL catches up.
  const [view, setOptimisticView] = useOptimistic(urlView);
  // The date strip is computed after the day's own results (first paint first).
  const stripDay = parseDayKey(useDeferredValue(dayKey(day), ""));

  const options = search.ok ? search.results.options : NO_OPTIONS;
  const facets = useMemo(() => buildFacets(options), [options]);
  const shown = useMemo(() => applyView(options, view), [options, view]);
  const filterCount = activeFilterCount(view);
  const total = options.length;
  // No flights this day: is it the day, or does nobody fly this route nonstop at all?
  const routeEmpty = useMemo(
    () => search.ok && total === 0 && routeHasNoNonstops({ origin, destination, date }),
    [search.ok, total, origin, destination, date],
  );
  const swapNote = airportSwapNote(day, options);
  const history = options[0]?.flight.turbulence.history ?? null;

  useEffect(() => {
    if (!search.ok) console.error(search.error);
  }, [search]);

  function changeView(next: ResultsView) {
    startTransition(() => {
      setOptimisticView(next);
      router.replace(resultsHref(day, next), { scroll: false });
    });
  }

  const clearFilters = () => changeView(withoutFilters(view));
  const hrefFor = (d: string) => resultsHref({ ...day, date: d }, viewForDay(view, availabilityOn(d, today).turbulence));

  if (routeEmpty) {
    return (
      <div className="flex flex-col gap-4 sm:gap-5">
        <SearchSummary day={day} today={today} carry={carryFor(view)} />
        <p role="status" className="sr-only">
          No nonstop flights on this route
        </p>
        <NoNonstops day={day} carry={carryFor(view)} />
      </div>
    );
  }

  const countText =
    total === 0
      ? "No nonstop flights this day"
      : `${shown.length === total ? total : `${shown.length} of ${total}`} nonstop ${total === 1 ? "flight" : "flights"} · prices are illustrative`;

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <SearchSummary day={day} today={today} carry={carryFor(view)} />

      <DateStrip day={day} stripDay={stripDay} today={today} hrefFor={hrefFor} />

      <div className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <aside
          aria-labelledby="c-filters-title"
          className="hidden rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80 lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-6.5rem)] lg:overflow-y-auto lg:overscroll-contain"
        >
          <div className="mb-4 flex min-h-11 items-center justify-between gap-3">
            <h2 id="c-filters-title" className="text-base font-bold text-ink-900">
              Filters
            </h2>
            {filterCount > 0 ? (
              <button
                type="button"
                onClick={clearFilters}
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
            scoresNote={`From ${forecastFrom}, when the turbulence forecast for these flights comes out (${TURBULENCE_LEAD}).`}
          />
        </aside>

        <section aria-labelledby="c-flights-title" className="min-w-0">
          <h2 id="c-flights-title" className="sr-only">
            Flights
          </h2>
          {!scores && total > 0 ? (
            <ScoresLater
              forecastFrom={forecastFrom}
              daysAway={daysAhead(date, today)}
              history={history}
              className="mb-3"
            />
          ) : null}

          <SortTabs
            value={view.sort}
            onChange={(sort) => changeView({ ...view, sort })}
            unavailable={scores ? undefined : SCORE_SORTS}
            note={scores ? undefined : `Smoothest from ${forecastFrom} · ${TURBULENCE_LEAD}`}
          />

          <div className="mt-2 flex min-h-11 items-center justify-between gap-3">
            <div className="min-w-0">
              <p role="status" className="text-sm leading-snug text-ink-500">
                {countText}
              </p>
              {scores && history && total > 0 ? (
                <p className="mt-0.5 text-xs leading-snug text-ink-500">
                  Scores from the latest turbulence forecasts ·{" "}
                  {getForecastStatus(daysAhead(date, today), history).confidenceLabel.toLowerCase()}
                </p>
              ) : null}
            </div>
            <button
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
            <ActiveFilters view={view} facets={facets} onChange={changeView} onClear={clearFilters} className="mt-1 lg:hidden" />
          ) : null}

          <div className="mt-3">
            {!search.ok ? (
              <Notice
                icon={<Compass />}
                title="These flights couldn’t be put together"
                text="Something went wrong building this day’s illustrative flights. Try a nearby date or another route."
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
                    onClick={clearFilters}
                    className="mt-4 inline-flex h-11 items-center rounded-full bg-night-900 px-5 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-night-800"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <ol aria-label={`Flights, ${SORT_ORDER_TEXT[view.sort]}`} className="flex flex-col gap-3">
                {shown.map((option) => {
                  const item: CompareItem = { origin, destination, date, key: option.key };
                  const id = itemId(item);
                  const inCompare = compare.has(id);
                  return (
                    <li key={option.key}>
                      <ResultCard
                        option={option}
                        item={item}
                        scores={scores}
                        forecastFrom={forecastFrom}
                        forecastLead={TURBULENCE_LEAD}
                        inCompare={inCompare}
                        compareLocked={compare.isFull && !inCompare}
                        onToggleCompare={(control) => {
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
                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={filterCount === 0}
                  className="h-12 shrink-0 rounded-full px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-line/50 disabled:text-ink-300 disabled:hover:bg-transparent"
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
            scoresNote={`From ${forecastFrom}, when the turbulence forecast for these flights comes out (${TURBULENCE_LEAD}).`}
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
  history,
  className,
}: {
  forecastFrom: string;
  daysAway: number;
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
          This day is {daysAway} days away. The turbulence forecast for each flight comes out {TURBULENCE_LEAD}; until
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

/** A route no airline flies nonstop: say so calmly and offer nearby routes that have flights. */
function NoNonstops({ day, carry }: { day: RouteDay; carry: Record<string, string | undefined> }) {
  const { origin: from, destination: to, date } = day;
  const suggestions = useMemo(() => nearbyRoutes({ origin: from, destination: to, date }), [from, to, date]);
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
        No nonstop flights on this route
      </h2>
      <p className="mx-auto mt-1.5 max-w-[48ch] text-sm leading-relaxed text-ink-500">
        No airline flies {origin?.city ?? day.origin} ({day.origin}) to {destination?.city ?? day.destination} (
        {day.destination}) without a stop, and this tool only shows nonstop flights. Try a nearby major airport
        {suggestions.length ? ":" : "."}
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
        <span>Or use “Change” above to pick another route.</span>
      </p>
    </section>
  );
}

function ActiveFilters({
  view,
  facets,
  onChange,
  onClear,
  className,
}: {
  view: ResultsView;
  facets: ReturnType<typeof buildFacets>;
  onChange: (view: ResultsView) => void;
  onClear: () => void;
  className?: string;
}) {
  const chips: Array<{ key: string; label: string; next: ResultsView }> = [
    ...view.times.map((t) => ({
      key: `time-${t}`,
      label: TIME_BUCKET_LABELS[t].label,
      next: { ...view, times: view.times.filter((x) => x !== t) },
    })),
    ...view.airlines.map((code) => ({
      key: `airline-${code}`,
      label: facets.airlines.find((a) => a.code === code)?.name ?? code,
      next: { ...view, airlines: view.airlines.filter((x) => x !== code) },
    })),
    ...(view.wide ? [{ key: "wide", label: "Wide-body only", next: { ...view, wide: false } }] : []),
    ...(view.min ? [{ key: "min", label: `Smoothness ${view.min}+`, next: { ...view, min: 0 as const } }] : []),
  ];
  return (
    <ul aria-label="Filters on" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {chips.map((chip) => (
        <li key={chip.key}>
          <button
            type="button"
            onClick={() => onChange(chip.next)}
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
  const message = issueMessage(check.issue ?? "empty", check.raw);
  // No day yet, so no forecast distance: only the sort is carried, and Smoothest counts as the default.
  const view = parseView(params, true);
  return (
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
  );
}
