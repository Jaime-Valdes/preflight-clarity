"use client";

import { ArrowRight, Check, RotateCcw, X } from "lucide-react";
import { useId, useState } from "react";
import { CATEGORY_LABELS, CATEGORY_PROMPTS, RATING_CATEGORIES, type RatingCategory } from "@preflight/shared/ratings";
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

/**
 * "Tune this to what worries you most" — the four rating categories, tapped in order of importance
 * (docs/ITERATION_2.md, feature 1), opened from the results page (landing v3, lib/d/landing.ts; it was
 * the home's second step until 2026-11-27). Optional and skippable; remembered per browser; the list
 * under it re-sorts as soon as it is saved. Sends d_setup as the home did, with `from: "results"`.
 * The card is a seat for the roaming cloud. Look: docs/ui-d-cinematic.md.
 */
export function PrioritiesTuner({ onClose, className }: PrioritiesTunerProps) {
  const priorities = usePriorities();
  return (
    <div data-cloud-seat className={cn("rounded-[24px] bg-surface p-5 shadow-soft sm:p-7", className)}>
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
  const titleId = useId();
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
    <section aria-labelledby={titleId}>
      <div className="flex items-start justify-between gap-3">
        <h2 id={titleId} className="text-balance text-[22px] font-extrabold leading-[1.15] tracking-[-0.02em] text-ink sm:text-[26px]">
          Tune this to what worries you most
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close without changes"
          className="-mr-2 -mt-1.5 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-canvas hover:text-ink"
        >
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <p id={hintId} className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-ink-soft">
        Tap what matters most to you on a flight, in order. The flights below re-sort for you. You can change this any time.
      </p>
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-2" aria-describedby={hintId}>
        {RATING_CATEGORIES.map((category, index) => {
          const rank = ranked.indexOf(category);
          const picked = rank >= 0;
          return (
            // The four tiles settle into place one after another when the question opens (position only).
            <li key={category} className="d-settle" style={{ animationDelay: `${index * 50}ms` }}>
              {/* The look, the fill that grows out of the badge and the badge's own disc (white, or a gold coin once
                  picked) are .d-home-tile in app/d/d-home.css: pseudo-elements, nothing added in here. */}
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => toggle(category)}
                className="d-home-tile flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left"
              >
                {/* What stands on the disc. Unpicked: the category's outlined icon; picked: its place in the order.
                    Keyed by which of the two it is, so a tap brings the new one in with a pop (the same pop both
                    ways) while a rank that only changes its number stays put. */}
                <span
                  key={picked ? "rank" : "icon"}
                  aria-hidden
                  className={cn(
                    "d-home-badge flex size-9 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold tabular-nums",
                    touched.has(category) && "d-pop",
                  )}
                >
                  {picked ? rank + 1 : <CategoryIcon category={category} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold leading-snug">{CATEGORY_LABELS[category]}</span>
                  <span className="d-home-tile-note mt-0.5 block text-[13px] leading-snug">{CATEGORY_PROMPTS[category]}</span>
                </span>
                {picked ? <span className="sr-only">, ranked {rank + 1} of 4</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 min-h-5 text-[13px] leading-snug text-ink-mute" aria-live="polite">
        {ranked.length === 0
          ? ""
          : ranked.length < 4
            ? `${ranked.length} of 4 picked — the rest follow in the usual order.`
            : "All four ranked."}
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        {/* Disabled until something is ranked: the kit gives the disabled attribute its sky-deep look. */}
        <button type="button" disabled={ranked.length === 0} onClick={finish} className={cn(D_PILL_PRIMARY, "h-14 w-full px-6 text-[17px] sm:w-auto sm:min-w-[14rem]")}>
          {changing ? "Update" : "Sort my flights"}
          {changing ? <Check aria-hidden className="size-5" /> : <ArrowRight aria-hidden className="size-5" />}
        </button>
        {ranked.length > 0 ? (
          <button type="button" onClick={startOver} className={cn(D_LINK, "inline-flex h-11 items-center gap-1.5 self-center rounded-lg px-2 text-[15px] sm:self-auto")}>
            <RotateCcw aria-hidden className="size-4" />
            Start over
          </button>
        ) : (
          <button type="button" onClick={skip} className={cn(D_LINK, "inline-flex h-11 items-center self-center rounded-lg px-2 text-[15px] sm:self-auto")}>
            Skip for now
          </button>
        )}
      </div>
      {/* Keeps the sort honest when fewer than four are ranked. */}
      <p className="sr-only">Unranked categories follow in this order: {completeOrder(ranked).map((c) => CATEGORY_LABELS[c]).join(", ")}.</p>
    </section>
  );
}
