"use client";

import { ChevronRight } from "lucide-react";
import type { Rating } from "@preflight/shared/ratings";
import { cn } from "@/lib/cn";
import { TONE_CLASSES } from "@/lib/theme";
import { ratingPhrase, ratingTone } from "./tone";

interface RatingPillProps {
  rating: Rating;
  size?: "sm" | "md";
  /** When set, the pill is a button that opens the rating's detail (RatingSheet). */
  onOpen?: () => void;
  className?: string;
}

/**
 * A rating as a calm tinted pill: "Very smooth cruise", "Large jet". Tappable
 * where the detail sheet is offered (the chevron says so); plain text elsewhere.
 */
export function RatingPill({ rating, size = "md", onOpen, className }: RatingPillProps) {
  const tone = TONE_CLASSES[ratingTone(rating)];
  const base = cn(
    "inline-flex max-w-full items-center gap-1 rounded-full font-semibold leading-tight ring-1 ring-inset",
    size === "sm" ? "min-h-8 px-2.5 text-[12px]" : "min-h-9 px-3 text-[13px]",
    tone.bg,
    tone.text,
    tone.ring,
    className,
  );
  const text = ratingPhrase(rating);
  if (!onOpen) return <span className={base}>{text}</span>;
  return (
    <button type="button" onClick={onOpen} aria-haspopup="dialog" className={cn(base, "transition-colors hover:brightness-95 active:brightness-90")}>
      <span className="truncate">{text}</span>
      <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-70" />
    </button>
  );
}
