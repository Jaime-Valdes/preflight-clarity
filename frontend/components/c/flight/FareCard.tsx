"use client";

import { ArrowRight, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { formatTime12 } from "@preflight/shared/dates";
import type { FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { Card } from "@/components/ui/Card";
import { useCompareList } from "@/lib/c/compare-store";
import { formatFare } from "@/lib/c/format";
import { MAX_COMPARE, compareHref, itemId, type CompareItem } from "@/lib/c/model";
import { cn } from "@/lib/cn";
import { LINK_BUTTON, dayOffsetMark } from "./copy";

interface FareCardProps {
  option: FlightOption;
  item: CompareItem;
  /** In-page link to the "Other flights this day" list. */
  othersHref: string;
  className?: string;
}

type FocusTarget = { target: "add" | "remove" };

/**
 * Version C flight page: the illustrative fare and the compare actions —
 * "Add to compare", or "In compare ✓" with "Remove" and a link to the compare
 * page. Nothing can be booked; the copy says so quietly.
 */
export function FareCard({ option, item, othersHref, className }: FareCardProps) {
  const list = useCompareList();
  const id = itemId(item);
  const inList = list.has(id);
  const full = list.isFull && !inList;
  const count = list.items.length;
  const [announcement, setAnnouncement] = useState("");
  // A new object per request, so the same target can be asked for twice in a row.
  const [focus, setFocus] = useState<FocusTarget | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const noteId = useId();
  const { flight } = option;

  // The control that was pressed is replaced by its counterpart: keep keyboard and screen-reader focus on it.
  useEffect(() => {
    if (!focus) return;
    (focus.target === "add" ? addRef : removeRef).current?.focus();
  }, [focus]);

  const add = () => {
    // Full: the button stays focusable (aria-disabled) so its note is read; pressing it does nothing.
    if (full) return;
    if (list.add(item)) {
      setAnnouncement(`Added to compare. ${count + 1} of ${MAX_COMPARE} flights picked.`);
      setFocus({ target: "remove" });
    } else {
      setAnnouncement(`You can compare up to ${MAX_COMPARE} flights.`);
    }
  };

  const remove = () => {
    list.remove(id);
    setAnnouncement("Removed from compare.");
    setFocus({ target: "add" });
  };

  const offset = dayOffsetMark(flight.arriveDayOffset);

  return (
    <Card className={cn("p-5", className)}>
      {/* On laptops this card stays in view while the sections scroll: say which flight it is. */}
      <p className="mb-4 hidden items-center gap-2.5 border-b border-line/70 pb-4 text-sm lg:flex">
        <AirlineMark code={flight.airline.code} size="sm" />
        <span className="min-w-0">
          <span className="block font-semibold leading-snug text-ink-900 tabular-nums">{flight.flightNumber}</span>
          <span className="block text-xs text-ink-500 tabular-nums">
            {formatTime12(flight.departTime)} → {formatTime12(flight.arriveTime)}
            {offset ? <sup className="ml-0.5 text-[10px] font-semibold">{offset}</sup> : null}
          </span>
        </span>
      </p>

      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Fare</h2>
        <span className="text-xs text-ink-500">One-way · economy · 1 traveller</span>
      </div>
      <p className="mt-1.5 text-[32px] font-bold leading-none tracking-tight text-ink-900 tabular-nums">
        {formatFare(option.fareUsd)}
      </p>
      <p className="mt-2 text-xs leading-snug text-ink-500">Illustrative price. Nothing can be booked here.</p>

      <div className="mt-4">
        {inList ? (
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-full bg-calm-50 py-0.5 pl-4 pr-0.5 ring-1 ring-inset ring-calm-100">
            <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-calm-700">
              <Check aria-hidden className="size-4" strokeWidth={2.5} />
              In compare
            </span>
            <button
              ref={removeRef}
              type="button"
              onClick={remove}
              aria-label="Remove from compare"
              className="h-11 rounded-full px-4 text-sm font-semibold text-ink-700 transition-colors hover:bg-surface hover:text-ink-900"
            >
              Remove
            </button>
          </div>
        ) : (
          <button
            ref={addRef}
            type="button"
            onClick={add}
            aria-disabled={full || undefined}
            aria-describedby={full ? noteId : undefined}
            className={cn(
              "inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors duration-200",
              full
                ? "cursor-not-allowed bg-canvas text-ink-500 ring-1 ring-inset ring-line"
                : "bg-night-900 text-white shadow-lift hover:bg-night-800 active:bg-night-950",
            )}
          >
            <Plus aria-hidden className="size-4" strokeWidth={2.5} />
            Add to compare
          </button>
        )}
      </div>

      {full ? (
        <div className="mt-3">
          <p id={noteId} className="text-xs leading-snug text-ink-500">
            You&rsquo;ve picked {MAX_COMPARE} flights, the most that fit side by side. Remove one to add this flight.
          </p>
          <Link href={compareHref(list.items)} className={cn(LINK_BUTTON.secondary, "mt-3 w-full")}>
            Compare your {MAX_COMPARE} flights
          </Link>
        </div>
      ) : inList && count >= 2 ? (
        <Link href={compareHref(list.items)} className={cn(LINK_BUTTON.primary, "mt-3 w-full")}>
          Compare {count} flights
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : inList ? (
        <p className="mt-3 text-xs leading-snug text-ink-500">
          Pick at least one more flight to see them side by side —{" "}
          <a href={othersHref} className="font-semibold text-calm-700 underline-offset-2 hover:underline">
            other flights this day
          </a>
          .
        </p>
      ) : null}

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </Card>
  );
}
