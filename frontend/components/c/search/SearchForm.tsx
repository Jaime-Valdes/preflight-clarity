"use client";

import { ArrowLeftRight, ArrowUpDown, CalendarDays, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { AirportField } from "@/components/flow/AirportField";
import type { RouteDay } from "@/lib/c/model";
import { useHrefs, useTool } from "@/components/c/shell/ToolContext";
import { cn } from "@/lib/cn";
import { dateHint, dateNote, maxSearchDate, validateDraft, WINDOW_TEXT, type SearchDraft } from "./query";
import { track } from "@/lib/analytics";

interface SearchFormProps {
  /** Prefix for the fields' ids — unique on the page ("home", "change"…). */
  idPrefix: string;
  today: string;
  draft: SearchDraft;
  onDraftChange: (draft: SearchDraft) => void;
  /** Extra query parameters for the results URL (e.g. the current sort). */
  carry?: Record<string, string | undefined>;
  /** After navigating to the results (e.g. to close a sheet). */
  onSearched?: (day: RouteDay) => void;
  /** Show the hints from the start (a search link that needs fixing). */
  showHints?: boolean;
  submitLabel?: string;
  className?: string;
}

const DATE_INPUT = cn(
  "relative h-12 w-full appearance-none rounded-2xl bg-surface pl-11 pr-4 text-left text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-breeze-500 focus:outline-none tabular-nums",
  "[&::-webkit-date-and-time-value]:text-left",
  // Chrome/Android: stretch the invisible native picker trigger over the whole field so a tap anywhere opens it.
  "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
);

/**
 * Version C search: From and To (catalogue airports only — a picked
 * suggestion; typed text that matches no airport is not kept), a swap, and a
 * native date picker (today … 330 days ahead, as far as schedules are published).
 * Stacked in narrow containers, one row in wide ones. Submitting opens
 * /c/search; hints appear after the first attempt, in calm wording.
 */
export function SearchForm({
  idPrefix,
  today,
  draft,
  onDraftChange,
  carry,
  onSearched,
  showHints = false,
  submitLabel = "Search flights",
  className,
}: SearchFormProps) {
  const router = useRouter();
  const tool = useTool();
  const hrefs = useHrefs();
  const [attempted, setAttempted] = useState(false);
  const ids = { origin: `${idPrefix}-origin`, destination: `${idPrefix}-destination`, date: `${idPrefix}-date` };
  const dateHintId = `${idPrefix}-date-hint`;
  const check = validateDraft(draft, today);
  const errors = (attempted || showHints) && !check.ok ? check.errors : {};
  const maxDate = maxSearchDate(today);
  const dateOk = !dateHint(draft.date, today);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!check.ok) {
      setAttempted(true);
      const first = check.errors.origin ? ids.origin : check.errors.destination ? ids.destination : ids.date;
      document.getElementById(first)?.focus();
      return;
    }
    track(`${tool.events}_search`, { origin: check.day.origin, destination: check.day.destination, date: check.day.date });
    router.push(hrefs.search(check.day, carry));
    onSearched?.(check.day);
  }

  function swap() {
    onDraftChange({ ...draft, origin: draft.destination, destination: draft.origin });
  }

  return (
    <form noValidate onSubmit={submit} className={cn("@container", className)} aria-label="Search flights">
      <div
        className={cn(
          "grid grid-cols-1 gap-4",
          // From 52rem of container width the fields sit in one row: From ⇄ To · Date · Search.
          "@min-[52rem]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(10.5rem,12.5rem)_auto] @min-[52rem]:items-start @min-[52rem]:gap-3",
        )}
      >
        <AirportField
          id={ids.origin}
          label="From"
          value={draft.origin}
          onChange={(origin) => onDraftChange({ ...draft, origin })}
          placeholder="City or airport"
          hint={errors.origin}
          invalid={!!errors.origin}
          quickPicks={false}
          allowFreeText={false}
        />

        {/* Wide: a round swap button between the two fields. */}
        <div className="hidden pt-[26px] @min-[52rem]:flex">
          <button
            type="button"
            onClick={swap}
            aria-label="Swap origin and destination"
            className="flex size-12 items-center justify-center rounded-full bg-surface text-ink-500 shadow-soft ring-1 ring-inset ring-line-strong transition-colors hover:bg-canvas hover:text-ink-900"
          >
            <ArrowLeftRight aria-hidden className="size-4" />
          </button>
        </div>

        <AirportField
          id={ids.destination}
          label="To"
          value={draft.destination}
          onChange={(destination) => onDraftChange({ ...draft, destination })}
          placeholder="City or airport"
          hint={errors.destination}
          invalid={!!errors.destination}
          quickPicks={false}
          allowFreeText={false}
          labelAction={
            <button
              type="button"
              onClick={swap}
              aria-label="Swap origin and destination"
              className={cn(
                "-my-2 flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ink-500 transition-colors hover:bg-line/50 hover:text-ink-900",
                "@min-[52rem]:hidden",
              )}
            >
              <ArrowUpDown aria-hidden className="size-4" />
              Swap
            </button>
          }
        />

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <label htmlFor={ids.date} className="text-[13px] font-semibold text-ink-700">
              Date
            </label>
          </div>
          <div className="relative">
            <CalendarDays
              aria-hidden
              className="pointer-events-none absolute left-4 top-1/2 z-[1] size-4 -translate-y-1/2 text-ink-400"
            />
            <input
              id={ids.date}
              type="date"
              value={draft.date}
              min={today}
              max={maxDate}
              onChange={(e) => onDraftChange({ ...draft, date: e.target.value })}
              aria-describedby={dateHintId}
              aria-invalid={errors.date ? true : undefined}
              className={DATE_INPUT}
            />
          </div>
          <p
            id={dateHintId}
            className={cn("mt-1.5 text-[13px] leading-snug tabular-nums", errors.date ? "text-sand-700" : "text-ink-500")}
          >
            {errors.date ? (
              // A fresh node, so the hint is announced when it appears.
              <span role="alert">{errors.date}</span>
            ) : dateOk ? (
              dateNote(draft.date, today)
            ) : (
              `Any day in ${WINDOW_TEXT}`
            )}
          </p>
        </div>

        <div className="@min-[52rem]:pt-[26px]">
          <button
            type="submit"
            className={cn(
              "inline-flex h-14 w-full select-none items-center justify-center gap-2 whitespace-nowrap rounded-full bg-night-900 px-6 text-base font-semibold text-white shadow-lift transition-colors duration-200 hover:bg-night-800 active:bg-night-950",
              "@min-[52rem]:h-12 @min-[52rem]:w-auto @min-[52rem]:text-[15px]",
            )}
          >
            <Search aria-hidden className="size-4" />
            {submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
