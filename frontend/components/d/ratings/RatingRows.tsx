"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Rating } from "@preflight/shared/ratings";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { TONE_CLASSES } from "@/lib/theme";
import { RatingSheet } from "./RatingSheet";
import { CATEGORY_SHORT, ratingTone, type RatingFrom } from "./tone";

interface RatingRowsProps {
  /** Already in the visitor's priority order (orderByPriorities). */
  ratings: readonly Rating[];
  flightLabel: string;
  from: RatingFrom;
  className?: string;
}

/**
 * The four ratings as rows: category, tier, the one-line meaning and the
 * basis; a tap opens the detail sheet. Used on the flight page (and anywhere
 * all four are listed).
 */
export function RatingRows({ ratings, flightLabel, from, className }: RatingRowsProps) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {ratings.map((rating) => (
        <RatingRow key={rating.category} rating={rating} flightLabel={flightLabel} from={from} />
      ))}
    </ul>
  );
}

function RatingRow({ rating, flightLabel, from }: { rating: Rating; flightLabel: string; from: RatingFrom }) {
  const [open, setOpen] = useState(false);
  const tone = TONE_CLASSES[ratingTone(rating)];
  return (
    <li>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          setOpen(true);
          track("d_rating_open", { category: rating.category, tier: rating.tier, basis: rating.basis, from });
        }}
        className="flex w-full items-start gap-3 rounded-2xl bg-surface px-4 py-3.5 text-left ring-1 ring-inset ring-line/80 transition-colors hover:bg-canvas active:bg-line/60"
      >
        <span aria-hidden className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", tone.solid)} />
        <span className="min-w-0 flex-1">
          <span className="block text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-500">{CATEGORY_SHORT[rating.category]}</span>
          <span className={cn("mt-0.5 block text-[17px] font-bold leading-snug", tone.text)}>{rating.label}</span>
          <span className="mt-1 block text-[14px] leading-relaxed text-ink-700">{rating.meaning}</span>
          <span className="mt-1 block text-[12px] leading-snug text-ink-400">{rating.basisText}</span>
        </span>
        <ChevronRight aria-hidden className="mt-1 size-4 shrink-0 text-ink-400" />
      </button>
      {open ? <RatingSheet rating={rating} flightLabel={flightLabel} onClose={() => setOpen(false)} /> : null}
    </li>
  );
}
