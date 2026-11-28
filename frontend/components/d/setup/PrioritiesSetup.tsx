"use client";

import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { useId, useState } from "react";
import { CATEGORY_LABELS, RATING_CATEGORIES, type RatingCategory } from "@preflight/shared/ratings";
import { D_LINK, D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { cloudReact } from "@/components/d/cloud/react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { completeOrder, orderKey, savePriorities, skipPriorities, usePriorities } from "@/lib/d/priorities";

/** How the tune panel closed (d_tune_close's `how`). */
export type TuneClose = "done" | "skip" | "close";

interface PrioritiesTunerProps {
  /** After "Sort my flights" / "Update", "Skip for now" or the close button. */
  onClose: (how: TuneClose) => void;
  className?: string;
}

/** The heading the results page moves focus to when the card turns over to this side. */
export const TUNE_TITLE_ID = "d-tune-title";

/** The tiles are half a phone's width, so takeoff & landing drops its "Smooth" there. */
const TILE_LABELS: Record<RatingCategory, string> = {
  ...CATEGORY_LABELS,
  takeoff_landing: "Takeoff & landing",
};

/**
 * "What matters most to you?" — the four rating categories, tapped in order of importance
 * (docs/ITERATION_2.md, feature 1), on the back of the results page's "Rated for you" card: the card
 * turns over to this side and back (DResults.tsx PrioritiesCard), so it is laid out to take about the
 * same room as the front and the flights below stay where they are. Optional and skippable;
 * remembered per browser; the list re-sorts as soon as it is saved. Sends d_setup as the home did,
 * with `from: "results"`. No card of its own: the face it sits on is the card.
 */
export function PrioritiesTuner({ onClose, className }: PrioritiesTunerProps) {
  const priorities = usePriorities();
  return (
    <div className={className}>
      <RankingForm
        initial={priorities.chosen ? priorities.order : []}
        changing={priorities.answered}
        onClose={() => onClose("close")}
        onDone={(completed, order) => {
          track("d_setup", { completed, order: orderKey(order), changed: priorities.answered, from: "results" });
          onClose(completed ? "done" : "skip");
        }}
      />
    </div>
  );
}

interface RankingFormProps {
  initial: readonly RatingCategory[];
  /** The visitor answered before (the button says "Update"). */
  changing: boolean;
  /** `order`: the four categories as saved (the default order after a skip). */
  onDone: (completed: boolean, order: readonly RatingCategory[]) => void;
  /** The close button: nothing saved. */
  onClose: () => void;
}

function RankingForm({ initial, changing, onDone, onClose }: RankingFormProps) {
  const [ranked, setRanked] = useState<readonly RatingCategory[]>(initial);
  // The tiles tapped since the question opened. Only their badges arrive with a pop, so a question
  // that opens with ranks already on it (after "Change") opens still.
  const [touched, setTouched] = useState<ReadonlySet<RatingCategory>>(() => new Set<RatingCategory>());
  const hintId = useId();

  function toggle(category: RatingCategory) {
    setRanked((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));
    setTouched((current) => (current.has(category) ? current : new Set(current).add(category)));
    // The cloud's "noted" (beam and nod), the same whether the tap gave the tile a rank or took it away.
    cloudReact("noted");
  }

  function startOver() {
    setTouched((current) => new Set([...current, ...ranked]));
    setRanked([]);
    cloudReact("noted");
  }

  function finish() {
    // The visitor finished a task of their own: the cloud is glad (the beam face). A skip gets the generic tap.
    cloudReact("glad");
    onDone(true, savePriorities(ranked));
  }

  function skip() {
    skipPriorities();
    onDone(false, RATING_CATEGORIES);
  }

  return (
    <section aria-labelledby={TUNE_TITLE_ID} className="relative">
      {/* The close button sits in the corner, out of the flow, so the hint line has the side's full width. */}
      <div className="min-w-0">
        <h2 id={TUNE_TITLE_ID} tabIndex={-1} className="pr-10 text-[17px] font-extrabold leading-tight tracking-tight text-ink outline-none sm:text-[18px]">
          What matters most to you?
        </h2>
        {/* The hint and the count share one line, so the side keeps its height as tiles are tapped. */}
        <p id={hintId} className="mt-0.5 text-[13px] leading-snug text-ink-mute" aria-live="polite">
          {ranked.length === 0
            ? "Tap in order, most important first."
            : ranked.length < 4
              ? `${ranked.length} of 4 picked · the rest follow in order.`
              : "All four ranked."}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close without changes"
        className="absolute -right-2.5 -top-2.5 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-canvas hover:text-ink"
      >
        <X aria-hidden className="size-5" />
      </button>
      <ul className="mt-2 grid grid-cols-2 gap-1.5 lg:grid-cols-4" aria-describedby={hintId}>
        {RATING_CATEGORIES.map((category) => {
          const rank = ranked.indexOf(category);
          const picked = rank >= 0;
          return (
            <li key={category} className="flex">
              {/* The look, the fill that grows out of the badge and the badge's own disc (white, or a gold coin once
                  picked) are .d-home-tile in app/d/d-home.css, made smaller by .d-results-tile in d-results.css. */}
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => toggle(category)}
                className="d-home-tile d-results-tile flex min-h-11 w-full items-center gap-1.5 rounded-xl py-1 pl-2 pr-1.5 text-left"
              >
                {/* Unpicked: the category's outlined icon; picked: its place in the order. Keyed by which of the two
                    it is, so a tap brings the new one in with a pop while a rank that only changes its number stays put. */}
                <span
                  key={picked ? "rank" : "icon"}
                  aria-hidden
                  className={cn(
                    "d-home-badge flex size-6 shrink-0 items-center justify-center rounded-full text-[13px] font-extrabold tabular-nums",
                    touched.has(category) && "d-pop",
                  )}
                >
                  {picked ? rank + 1 : <CategoryIcon category={category} size="sm" />}
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-bold leading-[1.15]">{TILE_LABELS[category]}</span>
                {picked ? <span className="sr-only">, ranked {rank + 1} of 4</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {/* Disabled until something is ranked: the kit gives the disabled attribute its sky-deep look. */}
        <button type="button" disabled={ranked.length === 0} onClick={finish} className={cn(D_PILL_PRIMARY, "h-10 px-5 text-[15px]")}>
          {changing ? "Update" : "Sort my flights"}
          {changing ? <Check aria-hidden className="size-4" /> : <ArrowRight aria-hidden className="size-4" />}
        </button>
        {ranked.length > 0 ? (
          <button type="button" onClick={startOver} className={cn(D_LINK, "inline-flex h-10 items-center gap-1.5 rounded-lg px-2 text-[14px]")}>
            <RotateCcw aria-hidden className="size-4" />
            Start over
          </button>
        ) : (
          <button type="button" onClick={skip} className={cn(D_LINK, "inline-flex h-10 items-center rounded-lg px-2 text-[14px]")}>
            Skip for now
          </button>
        )}
      </div>
      {/* Keeps the sort honest when fewer than four are ranked. */}
      <p className="sr-only">Unranked categories follow in this order: {completeOrder(ranked).map((c) => CATEGORY_LABELS[c]).join(", ")}.</p>
    </section>
  );
}
