"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { getAirport } from "@preflight/shared/airports";
import { formatShortDate } from "@preflight/shared/dates";
import { useHrefs, useTool } from "@/components/c/shell/ToolContext";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { useTodayISO } from "@/lib/hooks";
import { defaultSearchDate, dateHint, type SearchDraft } from "./query";
import { SearchForm } from "./SearchForm";
import { campaignParams } from "./view";

/** Demo routes: shuttles, a mountain crossing, an ocean hop and two long-hauls. */
const POPULAR_ROUTES: ReadonlyArray<readonly [string, string]> = [
  ["JFK", "LAX"],
  ["LGA", "BOS"],
  ["ORD", "DEN"],
  ["ATL", "MCO"],
  ["LAX", "SFO"],
  ["SEA", "HNL"],
  ["JFK", "LHR"],
  ["SFO", "NRT"],
];

/**
 * Home: the search form and popular routes. Both need today's date (the date
 * picker's range, the routes' links), so a placeholder of the same size
 * shows until it is known on the client. Campaign tags in the link that
 * opened the page (utm_*) travel on to the results; the query string is read
 * inside this component's own Suspense boundary, so the rest of the page
 * still prerenders.
 */
/** The background the popular routes are drawn for: version C's night block (default) or version D's white card. */
export type HomeSearchTone = "dark" | "light";

/** The parts that change with the tone (the form itself is the same on both). */
const TONES: Record<HomeSearchTone, { card: string; heading: string; sub: string; route: string; codes: string; arrow: string; cities: string; skeletonHeading: string; skeletonRoute: string }> = {
  dark: {
    card: "rounded-3xl bg-surface p-4 text-ink-900 shadow-lift ring-1 ring-line/80 sm:p-5",
    heading: "text-[13px] font-semibold text-white/80",
    sub: "font-normal text-white/60",
    route: "bg-white/[0.08] ring-1 ring-inset ring-white/15 hover:bg-white/[0.16] focus-visible:outline-white",
    codes: "text-white",
    arrow: "text-calm-200",
    cities: "text-white/65",
    skeletonHeading: "bg-white/10",
    skeletonRoute: "bg-white/[0.08]",
  },
  light: {
    card: "text-ink-900",
    heading: "text-[13px] font-bold text-ink-700",
    sub: "font-normal text-ink-500",
    route: "bg-canvas/70 hover:bg-canvas",
    codes: "text-ink-900",
    arrow: "text-ink-500",
    cities: "text-ink-500",
    skeletonHeading: "bg-canvas",
    skeletonRoute: "bg-canvas/70",
  },
};

interface HomeSearchProps {
  /** Default "dark": version C's look, unchanged. Version D passes "light" and wraps the form in its own card. */
  tone?: HomeSearchTone;
}

export function HomeSearch({ tone = "dark" }: HomeSearchProps = {}) {
  return (
    <Suspense fallback={<HomeSearchSkeleton tone={tone} />}>
      <HomeSearchClient tone={tone} />
    </Suspense>
  );
}

function HomeSearchClient({ tone }: { tone: HomeSearchTone }) {
  const params = useSearchParams();
  const today = useTodayISO();
  const campaign = useMemo(() => campaignParams(params), [params]);
  if (!today) return <HomeSearchSkeleton tone={tone} />;
  return <HomeSearchReady today={today} campaign={campaign} tone={tone} />;
}

function HomeSearchReady({ today, campaign, tone }: { today: string; campaign: Record<string, string | undefined>; tone: HomeSearchTone }) {
  const t = TONES[tone];
  const tool = useTool();
  const hrefs = useHrefs();
  const [draft, setDraft] = useState<SearchDraft>(() => ({
    origin: "",
    destination: "",
    date: defaultSearchDate(today),
  }));
  // Popular routes open on the date in the form (or the default one while it can't be searched).
  const date = dateHint(draft.date, today) ? defaultSearchDate(today) : draft.date;

  return (
    <>
      <div className={t.card}>
        <SearchForm idPrefix="home" today={today} draft={draft} onDraftChange={setDraft} carry={campaign} />
      </div>

      <div className="mt-6">
        <h2 className={t.heading}>
          Popular routes <span className={t.sub}>· {formatShortDate(date)}</span>
        </h2>
        <ul className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {POPULAR_ROUTES.map(([from, to]) => {
            const origin = getAirport(from);
            const destination = getAirport(to);
            if (!origin || !destination) return null;
            return (
              <li key={`${from}-${to}`} className="min-w-0">
                <Link
                  href={hrefs.search({ origin: from, destination: to, date }, campaign)}
                  // A tapped route is a search too (docs/ANALYTICS.md): the same event the form sends, marked "popular".
                  onClick={() => track(`${tool.events}_search`, { origin: from, destination: to, date, from: "popular" })}
                  className={cn("flex h-full min-h-14 flex-col justify-center rounded-2xl px-3.5 py-2 transition-colors", t.route)}
                >
                  <span className={cn("flex items-center gap-1.5 text-[13px] font-bold tracking-wide", t.codes)}>
                    {from}
                    <ArrowRight aria-hidden className={cn("size-3.5 shrink-0", t.arrow)} />
                    <span className="sr-only"> to </span>
                    {to}
                  </span>
                  <span className={cn("mt-0.5 text-xs leading-snug", t.cities)}>
                    {origin.city} – {destination.city}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}

function HomeSearchSkeleton({ tone }: { tone: HomeSearchTone }) {
  const t = TONES[tone];
  return (
    <div aria-hidden>
      <div className={t.card}>
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
      <div className="mt-6">
        <div className={cn("h-5 w-40 rounded-full", t.skeletonHeading)} />
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: POPULAR_ROUTES.length }, (_, i) => (
            <div key={i} className={cn("h-14 rounded-2xl", t.skeletonRoute)} />
          ))}
        </div>
      </div>
    </div>
  );
}
