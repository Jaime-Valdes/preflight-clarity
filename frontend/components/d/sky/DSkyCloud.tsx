import { cn } from "@/lib/cn";

/*
 * The sky's scenery shapes (docs/ui-d-cinematic.md, "The sky"): flat silhouettes with no
 * outline and no face, so the outlined mascot stays the only character on the page.
 */

/** A wide cumulus, 160 x 96. */
const WIDE = "M30 80C10 80 6 58 24 54C20 38 40 28 52 38C58 18 92 16 100 36C116 26 140 38 132 56C150 58 152 80 132 80Z";
/** The mascot's own body, 120 x 96, without its outline. */
const ROUND = "M24 74C8 74 6 54 20 50C16 36 32 26 42 35C44 17 68 13 75 30C87 23 103 34 97 50C111 52 111 74 96 74Z";
/** A band of cloud tops, 1440 x 220, stretched to whatever box it is given. */
const DECK =
  "M0 120C60 70 150 70 200 110C240 60 340 50 400 100C450 60 560 60 610 105C660 55 780 50 830 100C890 60 990 65 1040 108C1100 60 1200 55 1250 102C1300 70 1390 70 1440 110L1440 220L0 220Z";

interface DSkyCloudProps {
  /** wide: the long cumulus. round: the mascot's silhouette. */
  shape?: "wide" | "round";
  /** White unless a `fill-…` class says otherwise. */
  className?: string;
}

/**
 * One scenery cloud. It fills the width of the box it is put in and keeps its proportions, so
 * size the parent, not the drawing. Decorative: hidden from assistive technology.
 */
export function DSkyCloud({ shape = "wide", className }: DSkyCloudProps) {
  return (
    <svg viewBox={shape === "wide" ? "0 0 160 96" : "0 0 120 96"} fill="#ffffff" aria-hidden="true" className={cn("d-sky-shape", className)}>
      <path d={shape === "wide" ? WIDE : ROUND} />
    </svg>
  );
}

interface DSkyDeckProps {
  /** The front band is the back band mirrored, so the two rows of cloud tops never line up. */
  mirrored?: boolean;
}

/** One band of the sky's cloud deck, stretched to the box the stylesheet gives it; its colour is the box's `fill`. */
export function DSkyDeck({ mirrored = false }: DSkyDeckProps) {
  return (
    <svg viewBox="0 0 1440 220" preserveAspectRatio="none" aria-hidden="true">
      <path d={DECK} transform={mirrored ? "translate(1440 0) scale(-1 1)" : undefined} />
    </svg>
  );
}
