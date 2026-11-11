"use client";

import { ArrowDown, ArrowUp, Info, Minus } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { CATEGORY_LABELS, type Rating, type RatingFactor } from "@preflight/shared/ratings";
import { Sheet } from "@/components/c/common/Sheet";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { RatingPill } from "./RatingPill";
import { D_TIER, dTierTone, type RatingFrom } from "./tone";

/*
 * The detail behind one rating (version D): the plain meaning first, then its
 * basis, "how this is worked out" (the factors with a calm up / down / neutral
 * marker — leaf, amber, sky; never red) and the numbers — one tap away, never
 * the headline (docs/ITERATION_2.md).
 *
 * The sheet portals to <body>, outside the themed root, so what the page's
 * stylesheet adds to it (app/d/d-flight.css) is written under html[data-d-on].
 * On open the tier block settles (d-settle) and the reasons rise 6 px one
 * after another, 50 ms apart (d-rating-reason reads its place from
 * --d-flight-i). Position only: every word is readable in the first frame,
 * and closing is immediate.
 */

interface RatingSheetProps {
  rating: Rating;
  /** "DL 2165 · JFK → LAX · Nov 26" (components/c/flight/copy.ts flightContext). */
  flightLabel: string;
  onClose: () => void;
}

const EFFECT: Record<RatingFactor["effect"], { icon: typeof ArrowUp; className: string; text: string }> = {
  up: { icon: ArrowUp, className: "bg-leaf-100 text-leaf-ink", text: "helps" },
  down: { icon: ArrowDown, className: "bg-amber-100 text-amber-ink", text: "weighs on it" },
  // White, not sky: the rows these markers sit on are sky, and a sky disc would vanish into them.
  neutral: { icon: Minus, className: "bg-white text-sky-ink", text: "neutral" },
};

const EYEBROW = "mt-5 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-mute";

export function RatingSheet({ rating, flightLabel, onClose }: RatingSheetProps) {
  const tone = D_TIER[dTierTone(rating)];
  return (
    <Sheet title={CATEGORY_LABELS[rating.category]} description={flightLabel} onClose={onClose}>
      <div className={cn("d-settle d-rating-tier rounded-[20px] p-4", tone.bg)}>
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-ink">
            <CategoryIcon category={rating.category} />
          </span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[24px] font-extrabold leading-tight tracking-[-0.015em]", tone.text)}>{rating.label}</p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{rating.meaning}</p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-ink-mute">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {rating.basisText}
        </p>
      </div>

      <h3 className={EYEBROW}>How this is worked out</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {rating.factors.map((factor, index) => {
          const effect = EFFECT[factor.effect];
          const Icon = effect.icon;
          return (
            <li
              key={factor.title}
              className="d-rating-reason flex gap-3 rounded-2xl bg-canvas/60 px-3.5 py-3"
              style={{ "--d-flight-i": index } as CSSProperties}
            >
              <span aria-hidden className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full", effect.className)}>
                <Icon className="size-3.5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold leading-snug text-ink">
                  {factor.title}
                  <span className="sr-only"> — {effect.text}</span>
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-soft">{factor.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {rating.numbers.length ? (
        <>
          <h3 className={EYEBROW}>The numbers</h3>
          <dl className="mt-2 divide-y divide-line rounded-2xl bg-canvas/60">
            {rating.numbers.map((n) => (
              <div key={n.label} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
                <dt className="text-[13px] text-ink-mute">{n.label}</dt>
                <dd className="text-right text-[13px] font-bold text-ink tabular-nums">{n.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-ink-mute">Prototype · illustrative data. A real product would draw these from past flights, published schedules and the week&rsquo;s forecasts.</p>
    </Sheet>
  );
}

interface RatingButtonProps {
  rating: Rating;
  flightLabel: string;
  from: RatingFrom;
  size?: "sm" | "md";
  /** Just the tier on the pill (see RatingPill). */
  labelOnly?: boolean;
  className?: string;
}

/** A pill that opens the rating's sheet; logs d_rating_open once per open (docs/ANALYTICS.md). */
export function RatingButton({ rating, flightLabel, from, size, labelOnly, className }: RatingButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RatingPill
        rating={rating}
        size={size}
        labelOnly={labelOnly}
        className={className}
        onOpen={() => {
          setOpen(true);
          track("d_rating_open", { category: rating.category, tier: rating.tier, basis: rating.basis, from });
        }}
      />
      {open ? <RatingSheet rating={rating} flightLabel={flightLabel} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
