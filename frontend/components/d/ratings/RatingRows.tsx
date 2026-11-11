"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Rating } from "@preflight/shared/ratings";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { animateOnce } from "@/components/d/motion/motion";
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

/** How much of a row has to be on screen before its badge stamps: by then the badge itself is in view. */
const STAMP_AT = 0.5;

/**
 * The four ratings as rows: the category's outlined icon on its tier's tint,
 * the category, the tier in words, the one-line meaning and the basis; a tap
 * opens the detail sheet. Used on the flight page (and anywhere all four are
 * listed).
 *
 * Motion (docs/ui-d-cinematic.md, "Small interactions"): a row rises its last
 * 16 px as it scrolls in (d-reveal), lifts under a mouse and gives under a
 * press (d-row), and its icon badge stamps once when the row is half on
 * screen. Every row gets the same, whatever its rating: the only input is
 * whether the row is in view.
 */
export function RatingRows({ ratings, flightLabel, from, className }: RatingRowsProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // One observer for the list. A row is watched until it has been seen once; animateOnce stays quiet under reduced motion.
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          observer.unobserve(entry.target);
          animateOnce(entry.target.querySelector("[data-rating-badge]"), "stamp");
        }
      },
      { threshold: STAMP_AT },
    );
    for (const row of Array.from(list.children)) observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return (
    <ul ref={listRef} className={cn("flex flex-col gap-3", className)}>
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
        className="d-row d-reveal d-rating-row flex w-full items-start gap-3.5 rounded-[24px] bg-surface p-4 text-left shadow-soft sm:px-5"
      >
        <span
          aria-hidden
          data-rating-badge
          className={cn("mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full ring-2 ring-ink", tone.bg)}
        >
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
