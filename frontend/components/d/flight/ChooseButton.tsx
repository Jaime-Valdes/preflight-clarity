"use client";

import { Check, Heart } from "lucide-react";
import { useState } from "react";
import { priceRank, type Rating, type RatingCategory } from "@preflight/shared/ratings";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import { track } from "@/lib/analytics";
import { itemId, parseItemId, type CompareItem } from "@/lib/c/model";
import { chooseFlight, clearChoice, useChoice } from "@/lib/d/choice";
import { orderKey } from "@/lib/d/priorities";
import { cn } from "@/lib/cn";

/*
 * "I'd pick this flight" (docs/ITERATION_2.md): the one signal version D is
 * built to collect — would the visitor take this flight, given its ratings
 * and its price against the day's cheapest? A toggle, remembered per route
 * and day (lib/d/choice.ts); nothing is booked, and the copy says so. Logs
 * d_flight_chosen with the flight's tiers, price rank, the dollars over the
 * cheapest flight that day and, when the pick replaces an earlier one for the
 * same route and day, the replaced flight's key (docs/ANALYTICS.md).
 */

export type ChooseFrom = "flight" | "compare";

interface ChooseButtonProps {
  /** The flight as a compare item (its own airports, the date, the key). */
  item: CompareItem;
  option: FlightOption;
  /** The flights still to leave that day, for the price rank and the dollars over the cheapest. */
  options: readonly FlightOption[];
  /** Whole days from today to departure (0 = today): the fares at this lead time. */
  daysUntil: number;
  /** The flight's four ratings, in any order. */
  ratings: readonly Rating[];
  /** The visitor's priority order (logged as `priorities`). */
  order: readonly RatingCategory[];
  /** 1-based place in the results list the flight was opened from; null elsewhere. */
  position: number | null;
  from: ChooseFrom;
  /** "sm": a compact tile for a table cell — a short label, the full text for screen readers, no note under it. */
  size?: "md" | "sm";
  className?: string;
}

/** The four tiers as analytics properties (d_flight_view, d_flight_chosen). */
export function tierProps(ratings: readonly Rating[]): {
  cruise_tier: string | null;
  takeoff_landing_tier: string | null;
  aircraft_tier: string | null;
  space_tier: string | null;
} {
  const tier = (category: RatingCategory) => ratings.find((r) => r.category === category)?.tier ?? null;
  return {
    cruise_tier: tier("cruise"),
    takeoff_landing_tier: tier("takeoff_landing"),
    aircraft_tier: tier("aircraft"),
    space_tier: tier("space"),
  };
}

/** Where a fare stands among the day's fares: its rank (1 = cheapest, ties share it) and the dollars over the cheapest. */
export function priceStanding(price: number, fares: readonly number[]): { price_rank: number; dollars_over_cheapest: number } {
  const cheapest = fares.length ? Math.min(...fares) : price;
  return { price_rank: priceRank(fares, price), dollars_over_cheapest: Math.max(0, price - cheapest) };
}

export function ChooseButton({ item, option, options, daysUntil, ratings, order, position, from, size = "md", className }: ChooseButtonProps) {
  // The pick for this route and day, if any: this flight (chosen) or another one (which a pick here replaces).
  const current = useChoice(item);
  const chosen = current === itemId(item);
  const [announcement, setAnnouncement] = useState("");

  const toggle = () => {
    const next = !chosen;
    // A pick replaces any earlier pick for the same route and day; the event names it, so the funnel can
    // count one pick per route and day (the last event per browser) instead of two.
    const replaced = next && current ? (parseItemId(current)?.key ?? null) : null;
    if (next) chooseFlight(item);
    else clearChoice(item);
    const price = fareAt(option, daysUntil);
    track("d_flight_chosen", {
      key: item.key,
      origin: item.origin,
      destination: item.destination,
      date: item.date,
      days_until: daysUntil,
      ...tierProps(ratings),
      price,
      ...priceStanding(
        price,
        options.map((o) => fareAt(o, daysUntil)),
      ),
      position,
      from,
      priorities: orderKey(order),
      chosen: next,
      replaced_key: replaced,
    });
    setAnnouncement(
      next ? `${option.flight.flightNumber} noted as your pick. Nothing is booked.` : `Pick withdrawn for ${option.flight.flightNumber}.`,
    );
  };

  const compact = size === "sm";
  return (
    <div className={className}>
      <button
        type="button"
        aria-pressed={chosen}
        onClick={toggle}
        className={cn(
          "inline-flex w-full items-center justify-center font-semibold transition-colors duration-200",
          // A table cell is about 88 px wide on phones: a soft tile with a short label, never a wrapped blob.
          compact ? "min-h-11 rounded-2xl px-2 py-2 text-[13px] leading-tight" : "h-12 gap-2 rounded-full px-5 text-[15px]",
          chosen
            ? "bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-200 hover:bg-calm-100"
            : "bg-night-900 text-white shadow-lift hover:bg-night-800 active:bg-night-950",
        )}
      >
        {compact ? (
          <>
            <span aria-hidden className="flex flex-wrap items-center justify-center gap-x-1.5 text-center">
              {chosen ? (
                <>
                  <span className="inline-flex items-center gap-1">
                    Picked
                    <Check className="size-3.5 shrink-0" strokeWidth={2.5} />
                  </span>
                  <span className="font-normal text-calm-700/80">
                    <span className="hidden sm:inline">· </span>change
                  </span>
                </>
              ) : (
                "Pick"
              )}
            </span>
            <span className="sr-only">
              {chosen ? "Your pick · change" : "I’d pick this flight"} {option.flight.flightNumber}
            </span>
          </>
        ) : (
          <>
            {chosen ? (
              <>
                <Check aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
                <span className="min-w-0 text-center">
                  Your pick
                  <span className="font-normal text-calm-700/80"> · change</span>
                </span>
              </>
            ) : (
              <>
                <Heart aria-hidden className="size-4 shrink-0" />
                <span className="min-w-0 text-center">I&rsquo;d pick this flight</span>
              </>
            )}
            <span className="sr-only"> {option.flight.flightNumber}</span>
          </>
        )}
      </button>
      {compact ? null : (
        <p className={cn("mt-2 text-center text-xs leading-snug", chosen ? "text-calm-700" : "text-ink-500")}>
          {chosen ? "Noted — nothing is booked" : "Just a note for us — nothing is booked here."}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
