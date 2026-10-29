"use client";

import { ArrowRight, Check, Pencil, RotateCcw } from "lucide-react";
import { useId, useState } from "react";
import { CATEGORY_LABELS, CATEGORY_PROMPTS, RATING_CATEGORIES, type RatingCategory } from "@preflight/shared/ratings";
import { track } from "@/lib/analytics";
import { useHydrated } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { completeOrder, orderKey, savePriorities, skipPriorities, usePriorities } from "@/lib/d/priorities";

interface PrioritiesSetupProps {
  /** Called after "Next", "Update" or "Skip for now" (the home page moves on to the search form). */
  onDone?: () => void;
  className?: string;
}

/**
 * "What matters to you on a flight?" — the four rating categories, tapped in
 * order of importance (docs/ITERATION_2.md, feature 1). Framed as preferences,
 * never as fears; skippable; remembered per browser. Once answered, a compact
 * summary with "Change" takes its place.
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
      <section aria-labelledby="d-priorities-title" className={cn("rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80", className)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="d-priorities-title" className="text-[15px] font-bold text-ink-900">
              {priorities.chosen ? "What matters to you" : "Rated in the usual order"}
            </h2>
            <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5 text-[14px] text-ink-700">
              {priorities.order.map((category, i) => (
                <li key={category} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full bg-night-900 text-[11px] font-bold text-white tabular-nums">
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
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-breeze-700 transition-colors hover:bg-breeze-50"
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

  const next = ranked.length + 1;
  return (
    <section aria-labelledby={titleId} className={cn("rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80 sm:p-6", className)}>
      <h2 id={titleId} className="text-[20px] font-bold leading-snug tracking-tight text-ink-900">
        What matters most to you on a flight?
      </h2>
      <p id={hintId} className="mt-1.5 text-[14px] leading-relaxed text-ink-500">
        Tap in order of importance. Flights are then sorted and rated for you. You can change this any time.
      </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-describedby={hintId}>
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
                  "flex min-h-14 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-colors duration-150",
                  picked
                    ? "bg-night-900 text-white shadow-soft"
                    : "bg-surface text-ink-900 ring-1 ring-inset ring-line-strong hover:bg-canvas active:bg-line/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums",
                    picked ? "bg-white text-night-900" : "bg-canvas text-ink-400 ring-1 ring-inset ring-line-strong",
                  )}
                >
                  {picked ? rank + 1 : next}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold leading-snug">{CATEGORY_LABELS[category]}</span>
                  <span className={cn("mt-0.5 block text-[13px] leading-snug", picked ? "text-white/70" : "text-ink-500")}>
                    {CATEGORY_PROMPTS[category]}
                  </span>
                </span>
                {picked ? <span className="sr-only">, ranked {rank + 1} of 4</span> : null}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 min-h-4 text-[13px] leading-snug text-ink-500" aria-live="polite">
        {ranked.length === 0
          ? ""
          : ranked.length < 4
            ? `${ranked.length} of 4 picked — the rest follow in the usual order.`
            : "All four ranked."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={ranked.length === 0}
          onClick={finish}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-night-900 px-6 text-[15px] font-semibold text-white shadow-lift transition-colors hover:bg-night-800 active:bg-night-950 disabled:bg-ink-300 disabled:text-white/80 disabled:shadow-none"
        >
          {changing ? "Update" : "Next"}
          {changing ? <Check aria-hidden className="size-4" /> : <ArrowRight aria-hidden className="size-4" />}
        </button>
        {ranked.length > 0 ? (
          <button
            type="button"
            onClick={() => setRanked([])}
            className="inline-flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
          >
            <RotateCcw aria-hidden className="size-4" />
            Start over
          </button>
        ) : (
          <button
            type="button"
            onClick={skip}
            className="inline-flex h-11 items-center rounded-full px-4 text-sm font-semibold text-ink-500 transition-colors hover:bg-canvas hover:text-ink-900"
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
 * The summary card's shape (heading, the four labels, the Change button) in
 * quiet bars, shown until the browser's answer is known — so the card above the
 * search form keeps its height for a returning visitor.
 */
function SetupPlaceholder({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="my-[3px] h-4 w-40 rounded-full bg-line/70" />
          {/* The four labels' sizes ("Space & quiet", "Smooth takeoff & landing", "Smooth cruise", "Aircraft size"),
              so the bars wrap into the same rows as the real list at every width. */}
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
            <div className="h-[21px] w-[115px] rounded-full bg-canvas" />
            <div className="h-[21px] w-[188px] rounded-full bg-canvas" />
            <div className="h-[21px] w-[120px] rounded-full bg-canvas" />
            <div className="h-[21px] w-[102px] rounded-full bg-canvas" />
          </div>
        </div>
        <div className="h-11 w-[106px] shrink-0 rounded-full bg-canvas" />
      </div>
    </div>
  );
}
