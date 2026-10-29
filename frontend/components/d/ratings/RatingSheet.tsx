"use client";

import { ArrowDown, ArrowUp, Info, Minus } from "lucide-react";
import { useState } from "react";
import { CATEGORY_LABELS, type Rating, type RatingFactor } from "@preflight/shared/ratings";
import { Sheet } from "@/components/c/common/Sheet";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { TONE_CLASSES } from "@/lib/theme";
import { RatingPill } from "./RatingPill";
import { ratingTone, type RatingFrom } from "./tone";

/*
 * The detail behind one rating (version D): the plain meaning first, then its
 * basis, "how this is worked out" (the factors with a calm up / down / neutral
 * marker) and the numbers — one tap away, never the headline (docs/ITERATION_2.md).
 */

interface RatingSheetProps {
  rating: Rating;
  /** "DL 2165 · JFK → LAX · Nov 26" (components/c/flight/copy.ts flightContext). */
  flightLabel: string;
  onClose: () => void;
}

const EFFECT: Record<RatingFactor["effect"], { icon: typeof ArrowUp; className: string; text: string }> = {
  up: { icon: ArrowUp, className: "bg-calm-50 text-calm-700 ring-calm-100", text: "helps" },
  down: { icon: ArrowDown, className: "bg-sand-50 text-sand-700 ring-sand-100", text: "weighs on it" },
  neutral: { icon: Minus, className: "bg-canvas text-ink-500 ring-line", text: "neutral" },
};

export function RatingSheet({ rating, flightLabel, onClose }: RatingSheetProps) {
  const tone = TONE_CLASSES[ratingTone(rating)];
  return (
    <Sheet title={CATEGORY_LABELS[rating.category]} description={flightLabel} onClose={onClose}>
      <div className={cn("rounded-2xl p-4 ring-1 ring-inset", tone.bg, tone.ring)}>
        <p className={cn("text-[22px] font-bold leading-tight tracking-tight", tone.text)}>{rating.label}</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-900">{rating.meaning}</p>
        <p className="mt-3 flex items-start gap-1.5 text-[13px] leading-snug text-ink-500">
          <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {rating.basisText}
        </p>
      </div>

      <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">How this is worked out</h3>
      <ul className="mt-2 flex flex-col gap-2">
        {rating.factors.map((factor) => {
          const effect = EFFECT[factor.effect];
          const Icon = effect.icon;
          return (
            <li key={factor.title} className="flex gap-3 rounded-2xl bg-canvas/70 px-3.5 py-3 ring-1 ring-inset ring-line/70">
              <span aria-hidden className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset", effect.className)}>
                <Icon className="size-3.5" strokeWidth={2.5} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold leading-snug text-ink-900">
                  {factor.title}
                  <span className="sr-only"> — {effect.text}</span>
                </p>
                <p className="mt-0.5 text-[13px] leading-snug text-ink-700">{factor.detail}</p>
              </div>
            </li>
          );
        })}
      </ul>

      {rating.numbers.length ? (
        <>
          <h3 className="mt-5 text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-500">The numbers</h3>
          <dl className="mt-2 divide-y divide-line/70 rounded-2xl ring-1 ring-inset ring-line/70">
            {rating.numbers.map((n) => (
              <div key={n.label} className="flex items-baseline justify-between gap-4 px-3.5 py-2.5">
                <dt className="text-[13px] text-ink-500">{n.label}</dt>
                <dd className="text-right text-[13px] font-semibold text-ink-900 tabular-nums">{n.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : null}

      <p className="mt-4 text-xs leading-relaxed text-ink-400">Prototype · illustrative data. A real product would draw these from past flights, published schedules and the week&rsquo;s forecasts.</p>
    </Sheet>
  );
}

interface RatingButtonProps {
  rating: Rating;
  flightLabel: string;
  from: RatingFrom;
  size?: "sm" | "md";
  className?: string;
}

/** A pill that opens the rating's sheet; logs d_rating_open once per open (docs/ANALYTICS.md). */
export function RatingButton({ rating, flightLabel, from, size, className }: RatingButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <RatingPill
        rating={rating}
        size={size}
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
