"use client";

import { ChevronRight } from "lucide-react";
import type { Rating } from "@preflight/shared/ratings";
import { cn } from "@/lib/cn";
import { D_TIER, dTierTone, ratingPhrase } from "./tone";

interface RatingPillProps {
  rating: Rating;
  size?: "sm" | "md";
  /** When set, the pill is a button that opens the rating's detail (RatingSheet). */
  onOpen?: () => void;
  /** Just the tier ("Smooth", "Large jet") — for a table whose row already names the category. */
  labelOnly?: boolean;
  className?: string;
}

/**
 * A rating as a soft tinted pill (leaf / sun / amber): "Very smooth cruise", "Large jet". Tappable
 * where the detail sheet is offered (the chevron says so); plain text elsewhere.
 */
export function RatingPill({ rating, size = "md", onOpen, labelOnly = false, className }: RatingPillProps) {
  const tone = D_TIER[dTierTone(rating)];
  const base = cn(
    "inline-flex max-w-full items-center gap-1 rounded-full font-semibold leading-tight ring-1 ring-inset",
    size === "sm" ? "min-h-8 px-2.5 text-[12px]" : "min-h-9 px-3 text-[13px]",
    tone.bg,
    tone.text,
    tone.ring,
    className,
  );
  const text = labelOnly ? rating.label : ratingPhrase(rating);
  if (!onOpen) return <span className={base}>{text}</span>;
  // The pill keeps its visual height; a pseudo-element stretches the hit area to 44 px (WCAG 2.5.8).
  const hit = size === "sm" ? "before:-inset-y-1.5" : "before:-inset-y-1";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      className={cn(base, "relative transition-colors before:absolute before:inset-x-0 before:content-[''] hover:brightness-95 active:brightness-90", hit)}
    >
      <span className="truncate">{text}</span>
      <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-70" />
    </button>
  );
}
