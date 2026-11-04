"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Rating } from "@preflight/shared/ratings";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { RatingSheet } from "./RatingSheet";
import { CATEGORY_SHORT, D_TIER, dTierTone, type RatingFrom } from "./tone";

interface RatingRowsProps {
  /** Already in the visitor's priority order (orderByPriorities). */
  ratings: readonly Rating[];
  flightLabel: string;
  from: RatingFrom;
  className?: string;
}

/**
 * The four ratings as rows: the category's outlined icon on its tier's tint,
 * the category, the tier in words, the one-line meaning and the basis; a tap
 * opens the detail sheet. Used on the flight page (and anywhere all four are
 * listed).
 */
export function RatingRows({ ratings, flightLabel, from, className }: RatingRowsProps) {
  return (
    <ul className={cn("flex flex-col gap-2.5", className)}>
      {ratings.map((rating, index) => (
        <RatingRow key={rating.category} rating={rating} flightLabel={flightLabel} from={from} index={index} />
      ))}
    </ul>
  );
}

function RatingRow({ rating, flightLabel, from, index }: { rating: Rating; flightLabel: string; from: RatingFrom; index: number }) {
  const [open, setOpen] = useState(false);
  const tone = D_TIER[dTierTone(rating)];
  return (
    <li className="animate-d-rise" style={{ animationDelay: `${index * 60}ms` }}>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          track("d_rating_open", { category: rating.category, tier: rating.tier, basis: rating.basis, from });
        }}
        className="flex w-full items-start gap-3 rounded-[20px] bg-surface px-4 py-3.5 text-left shadow-soft transition-[background-color,transform] duration-[120ms] hover:bg-canvas/40 active:scale-[0.99]"
      >
        <span aria-hidden className={cn("mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full ring-2 ring-ink", tone.bg)}>
          <CategoryIcon category={rating.category} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-bold uppercase tracking-[0.08em] text-ink-mute">{CATEGORY_SHORT[rating.category]}</span>
          <span className={cn("mt-0.5 block text-[20px] font-extrabold leading-tight tracking-[-0.01em]", tone.text)}>{rating.label}</span>
          <span className="mt-1 block text-[14px] leading-relaxed text-ink-soft">{rating.meaning}</span>
          <span className="mt-1 block text-[12px] leading-snug text-ink-mute">{rating.basisText}</span>
        </span>
        <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-ink" />
      </button>
      {open ? <RatingSheet rating={rating} flightLabel={flightLabel} onClose={() => setOpen(false)} /> : null}
    </li>
  );
}
