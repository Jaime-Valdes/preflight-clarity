"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { getAirport } from "@preflight/shared/airports";
import { formatShortDate } from "@preflight/shared/dates";
import { searchHref } from "@/lib/c/model";
import { useTodayISO } from "@/lib/hooks";
import { defaultSearchDate, dateHint, type SearchDraft } from "./query";
import { SearchForm } from "./SearchForm";

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
 * shows until it is known on the client.
 */
export function HomeSearch() {
  const today = useTodayISO();
  if (!today) return <HomeSearchSkeleton />;
  return <HomeSearchReady today={today} />;
}

function HomeSearchReady({ today }: { today: string }) {
  const [draft, setDraft] = useState<SearchDraft>(() => ({
    origin: "",
    destination: "",
    date: defaultSearchDate(today),
  }));
  // Popular routes open on the date in the form (or the default one while it can't be searched).
  const date = dateHint(draft.date, today) ? defaultSearchDate(today) : draft.date;

  return (
    <>
      <div className="rounded-3xl bg-surface p-4 text-ink-900 shadow-lift ring-1 ring-line/80 sm:p-5">
        <SearchForm idPrefix="home" today={today} draft={draft} onDraftChange={setDraft} />
      </div>

      <div className="mt-6">
        <h2 className="text-[13px] font-semibold text-white/80">
          Popular routes <span className="font-normal text-white/60">· {formatShortDate(date)}</span>
        </h2>
        <ul className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {POPULAR_ROUTES.map(([from, to]) => {
            const origin = getAirport(from);
            const destination = getAirport(to);
            if (!origin || !destination) return null;
            return (
              <li key={`${from}-${to}`} className="min-w-0">
                <Link
                  href={searchHref({ origin: from, destination: to, date })}
                  className="flex min-h-14 flex-col justify-center rounded-2xl bg-white/[0.08] px-3.5 py-2 ring-1 ring-inset ring-white/15 transition-colors hover:bg-white/[0.16]"
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-bold tracking-wide text-white">
                    {from}
                    <ArrowRight aria-hidden className="size-3.5 shrink-0 text-calm-200" />
                    <span className="sr-only"> to </span>
                    {to}
                  </span>
                  <span className="mt-0.5 truncate text-xs text-white/65">
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

function HomeSearchSkeleton() {
  return (
    <div aria-hidden>
      <div className="rounded-3xl bg-surface p-4 shadow-lift ring-1 ring-line/80 sm:p-5">
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
        <div className="h-5 w-40 rounded-full bg-white/10" />
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {Array.from({ length: POPULAR_ROUTES.length }, (_, i) => (
            <div key={i} className="h-14 rounded-2xl bg-white/[0.08]" />
          ))}
        </div>
      </div>
    </div>
  );
}
