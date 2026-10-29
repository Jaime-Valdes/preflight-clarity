import type { Rating, RatingCategory } from "@preflight/shared/ratings";
import type { Tone } from "@/lib/theme";

/*
 * How a rating looks (version D, docs/ITERATION_2.md): the calm palette only.
 * Tier value 3–4 → calm (sea-glass), 2 → breeze (sky), 0–1 → sand (soft sand,
 * gentle). Never red, never a number above the detail layer.
 */

export function ratingTone(rating: Pick<Rating, "value">): Tone {
  return rating.value >= 3 ? "calm" : rating.value >= 2 ? "breeze" : "sand";
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
