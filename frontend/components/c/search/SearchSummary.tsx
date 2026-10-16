"use client";

import { ArrowLeftRight, ArrowRight, Pencil } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { getAirport } from "@preflight/shared/airports";
import { formatShortDate } from "@preflight/shared/dates";
import { Sheet } from "@/components/c/common/Sheet";
import { searchHref, type RouteDay } from "@/lib/c/model";
import { cn } from "@/lib/cn";
import type { SearchDraft } from "./query";
import { SearchForm } from "./SearchForm";

interface SearchSummaryProps {
  day: RouteDay;
  today: string;
  /** Query parameters a new search keeps (the sort). */
  carry: Record<string, string | undefined>;
}

const PILL =
  "inline-flex h-11 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold text-ink-900 ring-1 ring-inset ring-line-strong transition-colors hover:bg-canvas";

/**
 * The search at the top of the results: "New York (JFK) → Los Angeles (LAX) ·
 * Thu, Nov 26 · 1 traveller", a swap link and "Change" — the form opens
 * inline on laptops and as a full-screen sheet on phones.
 */
export function SearchSummary({ day, today, carry }: SearchSummaryProps) {
  const formId = useId();
  const changeRef = useRef<HTMLButtonElement>(null);
  const [mode, setMode] = useState<"closed" | "inline" | "sheet">("closed");
  const [draft, setDraft] = useState<SearchDraft>(day);
  const origin = getAirport(day.origin);
  const destination = getAirport(day.destination);
  const reversed: RouteDay = { origin: day.destination, destination: day.origin, date: day.date };

  // Back/forward puts another search under the form: close it (it would still hold the old values).
  useEffect(() => {
    const close = () => setMode("closed");
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);

  function open() {
    setDraft({ origin: day.origin, destination: day.destination, date: day.date });
    setMode(window.matchMedia("(min-width: 1024px)").matches ? "inline" : "sheet");
  }

  function closeInline() {
    setMode("closed");
    requestAnimationFrame(() => changeRef.current?.focus());
  }

  function onInlineKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // A suggestion list closes first (the field prevents default).
    if (e.key === "Escape" && !e.defaultPrevented) {
      e.preventDefault();
      closeInline();
    }
  }

  return (
    <section aria-labelledby="c-results-title" className="rounded-3xl bg-surface p-4 shadow-soft ring-1 ring-line/80 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1
            id="c-results-title"
            className="flex flex-wrap items-center gap-x-2 text-lg font-bold leading-snug text-ink-900 sm:text-xl"
          >
            <span>
              {origin?.city ?? day.origin} <span className="font-semibold text-ink-500">({day.origin})</span>
            </span>
            <ArrowRight aria-hidden className="size-4 shrink-0 text-ink-400" />
            <span className="sr-only">to</span>
            <span>
              {destination?.city ?? day.destination} <span className="font-semibold text-ink-500">({day.destination})</span>
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-500 tabular-nums">
            {formatShortDate(day.date)} · 1 traveller · Nonstop · Economy
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href={searchHref(reversed, carry)}
            className={PILL}
            aria-label={`Swap: ${destination?.city ?? day.destination} to ${origin?.city ?? day.origin}`}
          >
            <ArrowLeftRight aria-hidden className="size-4 text-ink-500" />
            Swap
          </Link>
          <button
            ref={changeRef}
            type="button"
            onClick={mode === "inline" ? closeInline : open}
            aria-expanded={mode !== "closed"}
            aria-controls={mode === "inline" ? formId : undefined}
            className={cn(PILL, mode === "inline" && "bg-canvas")}
          >
            <Pencil aria-hidden className="size-4 text-ink-500" />
            Change
          </button>
        </div>
      </div>

      {mode === "inline" ? (
        <div id={formId} onKeyDown={onInlineKeyDown} className="mt-4 border-t border-line/70 pt-4">
          <SearchForm
            idPrefix="change"
            today={today}
            draft={draft}
            onDraftChange={setDraft}
            carry={carry}
            onSearched={closeInline}
          />
          <button
            type="button"
            onClick={closeInline}
            className="mt-2 h-11 rounded-full px-3 text-sm font-semibold text-ink-500 transition-colors hover:bg-line/50 hover:text-ink-900"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {mode === "sheet" ? (
        <Sheet
          kind="full"
          title="Change search"
          description="Nonstop flights, one way, one traveller."
          onClose={() => setMode("closed")}
        >
          <SearchForm
            idPrefix="change-sheet"
            today={today}
            draft={draft}
            onDraftChange={setDraft}
            carry={carry}
            onSearched={() => setMode("closed")}
            className="pt-2"
          />
        </Sheet>
      ) : null}
    </section>
  );
}
