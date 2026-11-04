import type { Rating, RatingCategory } from "@preflight/shared/ratings";
import type { Tone } from "@/lib/theme";

/*
 * How a rating looks in version D (docs/ui-d-theme.md): the top tiers in leaf
 * green, the middle tier in warm sun, the lower tiers in a soft amber. Never
 * red, never a number above the detail layer.
 */

export type DTier = "leaf" | "sun" | "amber";

/** Tier value 3–4 → leaf, 2 → sun, 0–1 → amber. */
export function dTierTone(rating: Pick<Rating, "value">): DTier {
  return rating.value >= 3 ? "leaf" : rating.value >= 2 ? "sun" : "amber";
}

/** Class bundles on the D tokens: a light tint to sit on, a dark text of the same hue, a solid dot. */
export const D_TIER: Record<DTier, { bg: string; text: string; ring: string; dot: string }> = {
  leaf: { bg: "bg-leaf-100", text: "text-leaf-ink", ring: "ring-leaf", dot: "bg-leaf" },
  sun: { bg: "bg-sun-100", text: "text-sun-ink", ring: "ring-sun", dot: "bg-sun" },
  amber: { bg: "bg-amber-100", text: "text-amber-ink", ring: "ring-amber", dot: "bg-amber" },
};

/**
 * The same three steps on the shared semantic tokens (TONE_CLASSES), for the
 * components built on them: under the D theme calm is leaf, dusk is cream/sun
 * and sand is amber (app/globals.css).
 */
export function ratingTone(rating: Pick<Rating, "value">): Tone {
  return rating.value >= 3 ? "calm" : rating.value >= 2 ? "dusk" : "sand";
}

/** Short category nouns for pills and rows. */
export const CATEGORY_SHORT: Record<RatingCategory, string> = {
  cruise: "Cruise",
  takeoff_landing: "Takeoff & landing",
  aircraft: "Aircraft",
  space: "Space & quiet",
};

/** One phrase for a pill: "Very smooth cruise", "Smooth takeoff & landing", "Large jet", "Roomy and quiet cabin". */
export function ratingPhrase(rating: Pick<Rating, "category" | "label">): string {
  switch (rating.category) {
    case "cruise":
      return `${rating.label} cruise`;
    case "takeoff_landing":
      return `${rating.label} takeoff & landing`;
    case "aircraft":
      return rating.label;
    case "space":
      return /cabin$/i.test(rating.label) ? rating.label : `${rating.label} cabin`;
  }
}

/** Where a rating was opened from (analytics). */
export type RatingFrom = "results" | "flight" | "compare";
