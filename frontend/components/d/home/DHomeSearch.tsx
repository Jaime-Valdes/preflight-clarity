"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { getAirport } from "@preflight/shared/airports";
import { formatShortDate, formatTime12 } from "@preflight/shared/dates";
import { RATING_CATEGORIES, forYouScore } from "@preflight/shared/ratings";
import type { RouteHistoryDay } from "@preflight/shared/routeHistory";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { daysToDeparture } from "@/components/c/common/availability";
import type { SearchDraft } from "@/components/c/search/query";
import { SearchForm } from "@/components/c/search/SearchForm";
import { campaignParams } from "@/components/c/search/view";
import { useFlightSource, useHrefs } from "@/components/c/shell/ToolContext";
import { scheduleAttribution } from "@/components/d/brand/attribution";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { D_TIER, dTierTone } from "@/components/d/ratings/tone";
import { track } from "@/lib/analytics";
import { formatFare } from "@/lib/c/format";
import type { RouteDay } from "@/lib/c/model";
import { cn } from "@/lib/cn";
import { dDefaultSearchDate, EXAMPLE_ROUTES, exampleDate } from "@/lib/d/landing";
import { cheapestFare, priceDeltaText, ratingsByKey } from "@/lib/d/view";
import { useRouteDay } from "@/lib/flights/store";
import { useTodayISO } from "@/lib/hooks";

type Campaign = Record<string, string | undefined>;

/**
 * The /d landing's search block (landing v3, lib/d/landing.ts): the search form on a paper card, three
 * one-tap example routes under it, and one sample flight from the first example's day, so a visitor sees
 * what a result looks like before searching. Everything needs today's date (the form's range, the
 * example day), so quiet bars of the same size hold the place until it is known on the client. Campaign
 * tags in the link that opened the page (utm_*) travel on to the results, as on the old home.
 */
export function DHomeSearch() {
  return (
    <Suspense fallback={<Skeleton />}>
      <DHomeSearchClient />
    </Suspense>
  );
}

function DHomeSearchClient() {
  const params = useSearchParams();
  const today = useTodayISO();
  const campaign = useMemo(() => campaignParams(params), [params]);
  if (!today) return <Skeleton />;
  return <Ready today={today} campaign={campaign} />;
}

/** The paper card the form sits on (also a seat for the companion cloud). */
const CARD = "rounded-[24px] bg-surface p-4 shadow-soft sm:p-6";

function Ready({ today, campaign }: { today: string; campaign: Campaign }) {
  const [draft, setDraft] = useState<SearchDraft>(() => ({ origin: "", destination: "", date: dDefaultSearchDate(today) }));
  const date = exampleDate(today);
  return (
    <div className="flex flex-col gap-5">
      {/* It holds the airport suggestion lists, so it is never transformed, lifted or revealed. */}
      <div data-cloud-seat className={CARD}>
        <SearchForm idPrefix="home" today={today} draft={draft} onDraftChange={setDraft} carry={campaign} />
      </div>
      <ExampleRoutes date={date} campaign={campaign} />
      <SampleFlight today={today} date={date} campaign={campaign} />
    </div>
  );
}

function ExampleRoutes({ date, campaign }: { date: string; campaign: Campaign }) {
  const hrefs = useHrefs();
  return (
    <section aria-labelledby="d-examples-title">
      <h2 id="d-examples-title" className="text-[13px] font-bold text-ink-700">
        Or try an example <span className="font-normal text-ink-500">· {formatShortDate(date)}</span>
      </h2>
      <ul className="mt-2 grid grid-cols-3 gap-2">
        {EXAMPLE_ROUTES.map(([from, to], i) => {
          const origin = getAirport(from);
          const destination = getAirport(to);
          if (!origin || !destination) return null;
          return (
            <li key={`${from}-${to}`} className="min-w-0">
              <Link
                href={hrefs.search({ origin: from, destination: to, date }, campaign)}
                onClick={() => {
                  // A tapped example is a search too: d_search as the form sends it, marked "example", plus its own event.
                  track("d_search", { origin: from, destination: to, date, from: "example" });
                  track("d_example_route", { origin: from, destination: to, date, position: i + 1 });
                }}
                className="flex h-full min-h-14 flex-col justify-center rounded-2xl bg-surface px-3 py-2 shadow-soft transition-colors hover:bg-canvas"
              >
                <span className="flex items-center gap-1 text-[13px] font-bold tracking-wide text-ink-900">
                  {from}
                  <ArrowRight aria-hidden className="size-3.5 shrink-0 text-ink-500" />
                  <span className="sr-only"> to </span>
                  {to}
                </span>
                <span className="mt-0.5 truncate text-xs leading-snug text-ink-500">{destination.city}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The flight that leads on the usual order (ties: the earliest), from the day's options. */
function pickSample(options: readonly FlightOption[], today: string, history: RouteHistoryDay | null): { option: FlightOption; ratings: ReturnType<typeof ratingsByKey> } | null {
  if (options.length === 0) return null;
  const ratings = ratingsByKey(options, today, history);
  let best: FlightOption | null = null;
  let bestScore = -Infinity;
  for (const option of options) {
    const score = forYouScore(ratings.get(option.key) ?? [], RATING_CATEGORIES);
    if (score > bestScore || (score === bestScore && best && option.flight.departTime < best.flight.departTime)) {
      best = option;
      bestScore = score;
    }
  }
  return best ? { option: best, ratings } : null;
}

/**
 * One real result from the first example route's day, as a small card: the route, the cruise rating in
 * words, and the fare against the day's cheapest. The same day store as the results page, so tapping
 * it opens a page that is already loaded, and the day costs nothing extra. Nothing shows while the day
 * loads or when it has no flights.
 */
function SampleFlight({ today, date, campaign }: { today: string; date: string; campaign: Campaign }) {
  const hrefs = useHrefs();
  const [from, to] = EXAMPLE_ROUTES[0];
  const day: RouteDay = useMemo(() => ({ origin: from, destination: to, date }), [from, to, date]);
  const source = useFlightSource();
  const { provider, routeHistory } = useRouteDay(day);
  useEffect(() => {
    source.ensure(day);
  }, [day, source]);
  const options = useMemo(() => {
    try {
      return source.searchFlights(day)?.options ?? null;
    } catch {
      return [];
    }
  }, [day, source]);
  const daysUntil = daysToDeparture(today, date);
  const sample = useMemo(() => (options ? pickSample(options, today, routeHistory) : null), [options, today, routeHistory]);

  if (options === null) return <SampleSkeleton />;
  if (!sample) return null;

  const { option } = sample;
  const { flight } = option;
  const cruise = (sample.ratings.get(option.key) ?? []).find((r) => r.category === "cruise");
  if (!cruise) return null;
  const tone = D_TIER[dTierTone(cruise)];
  const fare = fareAt(option, daysUntil);
  const delta = priceDeltaText(fare, cheapestFare(options, daysUntil));
  const origin = getAirport(from);
  const destination = getAirport(to);

  return (
    <section aria-labelledby="d-sample-title">
      <h2 id="d-sample-title" className="text-[13px] font-bold text-ink-700">
        What you&rsquo;ll see <span className="font-normal text-ink-500">· a sample result</span>
      </h2>
      <Link
        href={hrefs.search(day, campaign)}
        onClick={() => {
          track("d_search", { origin: from, destination: to, date, from: "sample" });
          track("d_sample_flight", { origin: from, destination: to, date, tier: cruise.tier });
        }}
        className="d-lift mt-2 block rounded-[24px] bg-surface p-4 shadow-soft"
      >
        <div className="flex items-center gap-3">
          <AirlineMark code={flight.airline.code} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold leading-snug text-ink">
              <span aria-hidden>
                {from} → {to}
              </span>
              <span className="sr-only">
                {origin?.city ?? from} to {destination?.city ?? to}
              </span>
              <span className="font-semibold text-ink-soft"> · {flight.airline.name}</span>
            </p>
            <p className="text-[13px] leading-snug text-ink-mute tabular-nums">
              {formatShortDate(date)} · {formatTime12(flight.departTime)}
            </p>
          </div>
          <p className="shrink-0 text-right">
            <span className="block text-[20px] font-extrabold leading-none text-ink tabular-nums">{formatFare(fare)}</span>
            <span className="mt-1 block text-[12px] text-ink-mute tabular-nums">{delta}</span>
          </p>
        </div>
        <div className={cn("mt-3 flex items-center gap-3 rounded-2xl px-3 py-2.5", tone.bg)}>
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-ink">
            <CategoryIcon category="cruise" size="sm" />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[16px] font-extrabold leading-tight", tone.text)}>{cruise.label} cruise</p>
            {/* The one-line meaning from 640 px; on a phone the card stays short enough to show under the examples. */}
            <p className="mt-0.5 text-[13px] leading-snug text-ink-soft max-sm:hidden">{cruise.meaning}</p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-ink-700">
            See all
            <ArrowRight aria-hidden className="size-3.5" />
          </span>
        </div>
      </Link>
      <p className="mt-1.5 text-xs text-ink-500">Sample · {scheduleAttribution(provider)}</p>
    </section>
  );
}

function SampleSkeleton() {
  return (
    <div aria-hidden>
      <div className="h-5 w-48 rounded-full bg-canvas" />
      <div className="mt-2 h-[124px] rounded-[24px] bg-surface/70" />
    </div>
  );
}

/** The block's shape in quiet bars, until today's date is known. */
function Skeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <div className={CARD}>
        <div className="@container">
          <div className="grid grid-cols-1 gap-4 @min-[52rem]:grid-cols-[1fr_3rem_1fr_12.5rem_10rem] @min-[52rem]:gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={i === 1 ? "hidden @min-[52rem]:block" : undefined}>
                {i === 1 ? (
                  <div className="mt-[26px] size-12 rounded-full bg-canvas" />
                ) : (
                  <>
                    <div className="mb-1.5 h-[19.5px] w-12 rounded-full bg-canvas" />
                    <div className="h-12 rounded-2xl bg-canvas" />
                    {i === 3 ? <div className="mt-1.5 h-5 w-40 rounded-full bg-canvas" /> : null}
                  </>
                )}
              </div>
            ))}
            <div className="@min-[52rem]:pt-[26px]">
              <div className="h-14 rounded-full bg-line/70 @min-[52rem]:h-12" />
            </div>
          </div>
        </div>
      </div>
      <div>
        <div className="h-5 w-40 rounded-full bg-canvas" />
        <div className="mt-2 grid grid-cols-3 gap-2">
          {EXAMPLE_ROUTES.map(([from, to]) => (
            <div key={`${from}-${to}`} className="h-14 rounded-2xl bg-surface/70" />
          ))}
        </div>
      </div>
      <SampleSkeleton />
    </div>
  );
}
