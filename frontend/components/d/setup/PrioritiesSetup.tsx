"use client";

import { ArrowRight, Check, Pencil, RotateCcw } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { CATEGORY_LABELS, CATEGORY_PROMPTS, RATING_CATEGORIES, type RatingCategory } from "@preflight/shared/ratings";
import { D_LINK, D_PILL_OUTLINE, D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { ProgressDashes } from "@/components/d/brand/ProgressDashes";
import { cloudReact } from "@/components/d/cloud/react";
import { track } from "@/lib/analytics";
import { useHydrated } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { completeOrder, orderKey, savePriorities, skipPriorities, usePriorities, type Priorities } from "@/lib/d/priorities";

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
 * summary with "Change" takes its place. Look: docs/ui-d-cinematic.md.
 *
 * One paper card holds whichever of the three is showing (the placeholder, the
 * question, the summary), so the card itself stays the same element throughout:
 * it is a seat for the roaming cloud, which keeps its place while the question
 * collapses into the summary. The card rises its last few pixels as it scrolls in.
 */
export function PrioritiesSetup({ onDone, className }: PrioritiesSetupProps) {
  const hydrated = useHydrated();
  const priorities = usePriorities();
  const [editing, setEditing] = useState(false);

  let body: ReactNode;
  if (!hydrated) {
    // The browser's answer is only known on the client. Until then quiet bars the size of the summary
    // hold the place: a returning visitor never sees the question flash and give way to their answer,
    // and a first visit sees the question one tick later.
    body = <SetupPlaceholder />;
  } else if (priorities.answered && !editing) {
    body = <Summary priorities={priorities} onChange={() => setEditing(true)} />;
  } else {
    body = (
      <RankingForm
        initial={priorities.chosen ? priorities.order : []}
        changing={priorities.answered}
        onDone={(completed, order) => {
          setEditing(false);
          track("d_setup", { completed, order: orderKey(order), changed: priorities.answered });
          onDone?.();
        }}
      />
    );
  }

  return (
    <div data-cloud-seat className={cn("d-reveal rounded-[24px] bg-surface p-5 shadow-soft sm:p-7", className)}>
      {body}
    </div>
  );
}

/** A rank as a small coin: gold for an order the visitor chose, plain paper and ink for the usual one. */
const COIN = "flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-extrabold tabular-nums";

/*
 * The summary's grid, shared with its placeholder. Phones: the dashes and "Change" make a header row,
 * then the heading and the chips each take the full width, so neither heading ever wraps beside the
 * button. From 640 px the heading sits under the dashes, beside the button. In the page the button
 * still comes last, after the list it changes.
 */
const SUMMARY_GRID = "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3";
const SUMMARY_DASHES = "self-center sm:self-start";
const SUMMARY_HEADING = "col-span-2 row-start-2 mt-2 sm:col-span-1 sm:mt-3";
const SUMMARY_LIST = "col-span-2 row-start-3 mt-3 flex flex-wrap gap-2";
const SUMMARY_BUTTON = "col-start-2 row-start-1 h-11 sm:row-span-2 sm:self-start";

/** The answer, once given: the four categories in order, each a chip with its rank, and "Change". */
function Summary({ priorities, onChange }: { priorities: Priorities; onChange: () => void }) {
  return (
    <section aria-labelledby="d-priorities-title" className={SUMMARY_GRID}>
      <ProgressDashes total={STEP.total} active={STEP.active} label={STEP.label} className={SUMMARY_DASHES} />
      <h2 id="d-priorities-title" className={cn(SUMMARY_HEADING, "text-[17px] font-extrabold leading-snug tracking-tight text-ink")}>
        {priorities.chosen ? "What matters to you" : "Rated in the usual order"}
      </h2>
      <ol className={cn(SUMMARY_LIST, "text-[14px] font-bold leading-none text-ink")}>
        {priorities.order.map((category, i) => (
          <li key={category} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-canvas/70 pl-1 pr-3">
            <span aria-hidden className={cn(COIN, priorities.chosen ? "d-home-coin" : "bg-surface text-ink ring-[1.5px] ring-inset ring-ink")}>
              {i + 1}
            </span>
            <span className="sr-only">{i + 1}.</span>
            {CATEGORY_LABELS[category]}
          </li>
        ))}
      </ol>
      <button type="button" onClick={onChange} className={cn(D_PILL_OUTLINE, SUMMARY_BUTTON, "px-4 text-sm")}>
        <Pencil aria-hidden className="size-4" />
        Change
      </button>
    </section>
  );
}

interface RankingFormProps {
  initial: readonly RatingCategory[];
  /** The visitor answered before (the button says "Update"). */
  changing: boolean;
  /** `order`: the four categories as saved (the default order after a skip). */
  onDone: (completed: boolean, order: readonly RatingCategory[]) => void;
}

function RankingForm({ initial, changing, onDone }: RankingFormProps) {
  const [ranked, setRanked] = useState<readonly RatingCategory[]>(initial);
  // The tiles tapped since the question opened. Only their badges arrive with a pop, so a question
  // that opens with ranks already on it (after "Change") opens still.
  const [touched, setTouched] = useState<ReadonlySet<RatingCategory>>(() => new Set<RatingCategory>());
  const titleId = useId();
  const hintId = useId();

  function toggle(category: RatingCategory) {
    setRanked((current) => (current.includes(category) ? current.filter((c) => c !== category) : [...current, category]));
    setTouched((current) => (current.has(category) ? current : new Set(current).add(category)));
    // The cloud's "noted": one nod, the same whether the tap gave the tile a rank or took it away.
    cloudReact("nod");
  }

  function startOver() {
    setTouched((current) => new Set([...current, ...ranked]));
    setRanked([]);
    cloudReact("nod");
  }

  function finish() {
    // The visitor finished a task of their own: the cloud is glad. Not for a skip.
    cloudReact("glad");
    onDone(true, savePriorities(ranked));
  }

  function skip() {
    skipPriorities();
    onDone(false, RATING_CATEGORIES);
  }

  return (
    <section aria-labelledby={titleId}>
      <ProgressDashes total={STEP.total} active={STEP.active} label={STEP.label} />
      <h2 id={titleId} className="mt-4 text-balance text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[30px]">
        What matters most to you on a flight?
      </h2>
      <p id={hintId} className="mt-2 max-w-[36rem] text-[15px] leading-relaxed text-ink-soft">
        Tap in order of importance. Flights are then sorted and rated for you. You can change this any time.
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
          {changing ? "Update" : "Next"}
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

/**
 * The summary's shape (the dashes, the heading, the four chips, the Change
 * button) in quiet bars, shown until the browser's answer is known — so the
 * card above the search form keeps its height for a returning visitor.
 */
function SetupPlaceholder() {
  return (
    <div aria-hidden className={SUMMARY_GRID}>
      <div className={cn(SUMMARY_DASHES, "h-1.5 w-[4.75rem] rounded-full bg-canvas")} />
      {/* The heading's line: 23.4 px tall, the bar centred in it. */}
      <div className={cn(SUMMARY_HEADING, "flex h-[23.4px] items-center")}>
        <div className="h-[15px] w-44 rounded-full bg-line/70" />
      </div>
      {/* The four chips' sizes in the usual order ("Smooth cruise", "Smooth takeoff & landing", "Aircraft size",
          "Space & quiet"), so the bars wrap into the same rows as the real list. */}
      <div className={SUMMARY_LIST}>
        <div className="h-8 w-[145px] rounded-full bg-canvas/70" />
        <div className="h-8 w-[217px] rounded-full bg-canvas/70" />
        <div className="h-8 w-[127px] rounded-full bg-canvas/70" />
        <div className="h-8 w-[139px] rounded-full bg-canvas/70" />
      </div>
      <div className={cn(SUMMARY_BUTTON, "w-[109px] rounded-full bg-canvas")} />
    </div>
  );
}
