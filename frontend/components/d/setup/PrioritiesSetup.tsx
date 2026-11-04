"use client";

import { ArrowRight, Check, Pencil, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { CATEGORY_LABELS, CATEGORY_PROMPTS, RATING_CATEGORIES, type RatingCategory } from "@preflight/shared/ratings";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { ProgressDashes } from "@/components/d/brand/ProgressDashes";
import { track } from "@/lib/analytics";
import { useHydrated } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { completeOrder, orderKey, savePriorities, skipPriorities, usePriorities } from "@/lib/d/priorities";

interface PrioritiesSetupProps {
  /** Called after "Next", "Update" or "Skip for now" (the home page moves on to the search form). */
  onDone?: () => void;
  className?: string;
}

/** The second of the home's three steps (the intro, this, where and when). */
const STEP = { total: 3, active: 1, label: "Step 2 of 3: what matters to you" } as const;

/**
 * "What matters to you on a flight?" — the four rating categories, tapped in
 * order of importance (docs/ITERATION_2.md, feature 1). Framed as preferences,
 * never as fears; skippable; remembered per browser. Once answered, a compact
 * summary with "Change" takes its place. Look: docs/ui-d-theme.md.
 */
export function PrioritiesSetup({ onDone, className }: PrioritiesSetupProps) {
  const hydrated = useHydrated();
  const priorities = usePriorities();
  const [editing, setEditing] = useState(false);

  // The browser's answer is only known on the client. Until then a quiet card the size of the summary
  // holds the place: a returning visitor never sees the question flash and give way to their answer,
  // and a first visit sees the question one tick later.
  if (!hydrated) return <SetupPlaceholder className={className} />;

  const showForm = !priorities.answered || editing;

  if (!showForm) {
    return (
      <section aria-labelledby="d-priorities-title" className={cn("rounded-[24px] bg-surface p-5 shadow-soft", className)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <ProgressDashes total={STEP.total} active={STEP.active} label={STEP.label} />
            <h2 id="d-priorities-title" className="mt-3 text-[17px] font-extrabold leading-snug tracking-tight text-ink">
              {priorities.chosen ? "What matters to you" : "Rated in the usual order"}
            </h2>
            <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[15px] leading-snug text-ink-soft">
              {priorities.order.map((category, i) => (
                <li key={category} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-flex size-6 items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-white tabular-nums">
                    {i + 1}
                  </span>
                  <span className="sr-only">{i + 1}.</span>
                  {CATEGORY_LABELS[category]}
                </li>
              ))}
            </ol>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold text-ink ring-2 ring-inset ring-ink transition-[background-color,transform] duration-[120ms] hover:bg-ink/5 active:scale-[0.98]"
          >
            <Pencil aria-hidden className="size-4" />
            Change
          </button>
        </div>
      </section>
    );
  }

  return (
    <RankingForm
      initial={priorities.chosen ? priorities.order : []}
      changing={priorities.answered}
      onDone={(completed, order) => {
        setEditing(false);
        track("d_setup", { completed, order: orderKey(order), changed: priorities.answered });
        onDone?.();
      }}
      className={className}
    />
  );
}

interface RankingFormProps {
  initial: readonly RatingCategory[];
  /** The visitor answered before (the button says "Update"). */
  changing: boolean;
  /** `order`: the four categories as saved (the default order after a skip). */
  onDone: (completed: boolean, order: readonly RatingCategory[]) => void;
  className?: string;
}

function RankingForm({ initial, changing, onDone, className }: RankingFormProps) {
  const [ranked, setRanked] = useState<readonly RatingCategory[]>(initial);
  const titleId = useId();
  const hintId = useId();

  function toggle(category: RatingCategory) {
    setRanked((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));
  }

  function finish() {
    onDone(true, savePriorities(ranked));
  }

  function skip() {
    skipPriorities();
    onDone(false, RATING_CATEGORIES);
  }

  return (
    <section aria-labelledby={titleId} className={cn("rounded-[24px] bg-surface p-5 shadow-soft sm:p-7", className)}>
      <ProgressDashes total={STEP.total} active={STEP.active} label={STEP.label} />
      <h2 id={titleId} className="mt-4 text-balance text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[30px]">
        What matters most to you on a flight?
      </h2>
      <p id={hintId} className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-ink-soft">
        Tap in order of importance. Flights are then sorted and rated for you. You can change this any time.
      </p>
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-2" aria-describedby={hintId}>
        {RATING_CATEGORIES.map((category) => {
          const rank = ranked.indexOf(category);
          const picked = rank >= 0;
          return (
            <li key={category}>
              <button
                type="button"
                aria-pressed={picked}
                onClick={() => toggle(category)}
                className={cn(
                  "flex min-h-16 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-[background-color,transform] duration-[120ms] active:scale-[0.98]",
                  picked ? "bg-ink text-white" : "bg-canvas/70 text-ink hover:bg-canvas",
                )}
              >
                {/* Unpicked: the category's outlined icon; picked: its place in the order. */}
                <span
                  aria-hidden
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-ink",
                    picked ? "text-[15px] font-extrabold tabular-nums" : "ring-2 ring-ink",
                  )}
                >
                  {picked ? rank + 1 : <CategoryIcon category={category} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px] font-bold leading-snug">{CATEGORY_LABELS[category]}</span>
                  <span className={cn("mt-0.5 block text-[13px] leading-snug", picked ? "text-white/75" : "text-ink-mute")}>
                    {CATEGORY_PROMPTS[category]}
                  </span>
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
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <button
          type="button"
          disabled={ranked.length === 0}
          onClick={finish}
          className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-[17px] font-bold text-white transition-transform duration-[120ms] active:scale-[0.98] disabled:bg-slate sm:w-auto sm:min-w-[14rem]"
        >
          {changing ? "Update" : "Next"}
          {changing ? <Check aria-hidden className="size-5" /> : <ArrowRight aria-hidden className="size-5" />}
        </button>
        {ranked.length > 0 ? (
          <button
            type="button"
            onClick={() => setRanked([])}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold text-ink-mute transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <RotateCcw aria-hidden className="size-4" />
            Start over
          </button>
        ) : (
          <button
            type="button"
            onClick={skip}
            className="inline-flex h-11 items-center justify-center rounded-full px-4 text-sm font-bold text-ink-mute transition-colors hover:bg-ink/5 hover:text-ink"
          >
            Skip for now
          </button>
        )}
      </div>
      {/* Keeps the sort honest when fewer than four are ranked. */}
      <p className="sr-only">Unranked categories follow in this order: {completeOrder(ranked).map((c) => CATEGORY_LABELS[c]).join(", ")}.</p>
    </section>
  );
}

/**
 * The summary card's shape (the dashes, the heading, the four labels, the
 * Change button) in quiet bars, shown until the browser's answer is known —
 * so the card above the search form keeps its height for a returning visitor.
 */
function SetupPlaceholder({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-[24px] bg-surface p-5 shadow-soft", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="h-1.5 w-[4.75rem] rounded-full bg-canvas" />
          <div className="my-1 mt-4 h-[15px] w-44 rounded-full bg-line/70" />
          {/* The four labels' sizes ("Space & quiet", "Smooth takeoff & landing", "Smooth cruise", "Aircraft size")
              with their number badges, so the bars wrap into the same rows as the real list at every width. */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
            <div className="h-6 w-[130px] rounded-full bg-canvas" />
            <div className="h-6 w-[204px] rounded-full bg-canvas" />
            <div className="h-6 w-[131px] rounded-full bg-canvas" />
            <div className="h-6 w-[125px] rounded-full bg-canvas" />
          </div>
        </div>
        <div className="h-11 w-[106px] shrink-0 rounded-full bg-canvas" />
      </div>
    </div>
  );
}
