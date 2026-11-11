"use client";

import { ArrowRight, Check, ChevronDown, Plus } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { formatDuration, formatTime12 } from "@preflight/shared/dates";
import type { Rating } from "@preflight/shared/ratings";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { D_LINK, D_PILL_OUTLINE, D_PILL_SELECTED } from "@/components/d/brand/buttons";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { PaperPlane } from "@/components/d/brand/FlightPath";
import { cloudReact } from "@/components/d/cloud/react";
import { D_MOVE_MS, EASE_OUT, prefersReducedMotion } from "@/components/d/motion/motion";
import { RatingPill } from "@/components/d/ratings/RatingPill";
import { CATEGORY_SHORT, D_TIER, dTierTone } from "@/components/d/ratings/tone";
import { track } from "@/lib/analytics";
import { formatFare } from "@/lib/c/format";
import { MAX_COMPARE, type CompareItem } from "@/lib/c/model";
import { priceDeltaText } from "@/lib/d/view";
import { cn } from "@/lib/cn";
import { usePopOnChange } from "./usePopOnChange";

interface DResultCardProps {
  option: FlightOption;
  /** The flight as a compare-list item (its own route, date, key). */
  item: CompareItem;
  /** Whole days until departure: sets today's fare (fareAt). */
  daysUntil: number;
  /** The flight's four ratings in the visitor's priority order (orderByPriorities); the first two are shown. */
  ratings: readonly Rating[];
  /** The day's cheapest fare today, for "+$42 vs cheapest" (null with no flights). */
  cheapest: number | null;
  /** Leads the flights on screen for the visitor's priorities (ties all marked). */
  smoothestForYou: boolean;
  /** The visitor ranked their priorities: the marker says "for you"; otherwise "overall". */
  chosen: boolean;
  /** Query parameters the Details link keeps (campaign tags from the link that opened the results). */
  campaign?: Record<string, string | undefined>;
  /** The airframe is assigned (≤ 1 day before departure): "assigned" instead of "scheduled". */
  airframe: boolean;
  /** 1-based place in the list, carried to the flight page (`?pos=`) for analytics. */
  position: number;
  inCompare: boolean;
  /** The compare list is full and this flight isn't in it. */
  compareLocked: boolean;
  /** Called with the toggle button (so the caller can keep it clear of the tray). */
  onToggleCompare: (control: HTMLButtonElement) => void;
}

/** How many of the visitor's ratings a card shows (the other two are on the flight page). */
const SHOWN_RATINGS = 2;

function dayOffset(offset: number): string | null {
  if (offset === 0) return null;
  return offset > 0 ? `+${offset}` : `−${Math.abs(offset)}`;
}

/** The reasons under "Why?" arrive one after another, this far apart. */
const REASON_STAGGER_MS = 40;

/**
 * "Why?" opened: its lines (the basis, each reason, the two closing lines) rise their last 6 px in turn while the
 * panel slides open. Position only, so no line is ever dimmed, and nothing is left on a line once it has arrived.
 * Played once from the tap, by script rather than by a CSS rule: a rule would play again whenever the card is
 * moved in the list or its page is shown again. Nothing under reduced motion.
 */
function riseInTurn(panel: HTMLElement | null) {
  if (!panel || prefersReducedMotion()) return;
  panel.querySelectorAll<HTMLElement>(".d-results-reason").forEach((line, index) => {
    if (typeof line.animate !== "function") return;
    line.animate([{ transform: "translateY(6px)" }, { transform: "translateY(0)" }], {
      duration: D_MOVE_MS,
      delay: index * REASON_STAGGER_MS,
      easing: EASE_OUT,
      fill: "backwards",
    });
  });
}

/**
 * One flight in version D's results (docs/ITERATION_2.md; look: docs/ui-d-cinematic.md).
 * The eye lands on one thing: the rating that matters most to this visitor, in
 * words, on a soft tint with its outlined icon and its one-line meaning. The
 * second rating sits under it as a pill; "Why?" slides the basis and the
 * factors open in place. Then the times, and two quiet actions — Compare (a
 * toggle) and Details (a link). No score, no timeline, no forecast talk.
 *
 * Everything that decorates or moves is the same on every card, whatever it
 * shows: the lift under a mouse, the last few pixels of rise as the card scrolls
 * in, the small plane that crosses the time line with the scroll, the pop of the
 * compare icon, the cloud's reactions. Only the rating block's tint says
 * anything about the flight. The card is a seat for the companion cloud, which
 * perches on its top edge: the first 9 px of the card stay empty padding.
 */
export function DResultCard({
  option,
  item,
  daysUntil,
  ratings,
  cheapest,
  smoothestForYou,
  chosen,
  campaign,
  airframe,
  position,
  inCompare,
  compareLocked,
  onToggleCompare,
}: DResultCardProps) {
  const hrefs = useHrefs();
  const { flight } = option;
  const titleId = useId();
  const noteId = useId();
  const whyId = useId();
  const [why, setWhy] = useState(false);
  const reasonsRef = useRef<HTMLDivElement>(null);
  // The plus and the check trade places with a small pop, but only when the flight has just gone in or out of
  // the compare list (from this button, or from the tray): a card that simply arrives keeps still.
  const [comparePop, comparePopped] = usePopOnChange(inCompare);
  const depart = formatTime12(flight.departTime);
  const arrive = formatTime12(flight.arriveTime);
  const offset = dayOffset(flight.arriveDayOffset);
  const fare = fareAt(option, daysUntil);
  const fareText = formatFare(fare);
  const delta = priceDeltaText(fare, cheapest);
  const isCheapest = delta === "Cheapest";
  const [lead, second] = ratings.slice(0, SHOWN_RATINGS);
  const tone = D_TIER[dTierTone(lead)];
  // "For you" only once the visitor has said what matters; until then the lead is on the usual order.
  const smoothestText = chosen ? "Smoothest for you" : "Smoothest overall";
  const compareIcon = cn("size-4", comparePop && "d-pop");

  function toggleWhy() {
    if (!why) {
      track("d_rating_open", { category: lead.category, tier: lead.tier, basis: lead.basis, from: "results" });
      // The cloud leans in to read along: the same lean for every flight.
      cloudReact("curious");
      riseInTurn(reasonsRef.current);
    }
    setWhy((v) => !v);
  }

  return (
    <article data-cloud-seat aria-labelledby={titleId} className="d-lift d-reveal rounded-[24px] bg-surface p-5 shadow-soft">
      {/* Who and how much. */}
      <div className="flex items-start gap-3">
        <AirlineMark code={flight.airline.code} />
        <div className="min-w-0 flex-1">
          <h3 id={titleId} className="text-[15px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">
            {flight.airline.name}
            <span className="sr-only">
              , {flight.flightNumber}, departs {depart}
              {smoothestForYou ? `, ${smoothestText.toLowerCase()} of these flights` : ""}
              {isCheapest ? ", cheapest this day" : ""}
            </span>
          </h3>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-mute">
            <span className="tabular-nums">{flight.flightNumber}</span> · {flight.aircraft.fullName}
            {flight.aircraft.bodyType === "wide" ? " · wide-body" : ""}
            <span className="sr-only"> · {airframe ? "assigned aircraft" : "scheduled aircraft"}</span>
          </p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-[24px] font-extrabold leading-none tracking-[-0.01em] text-ink tabular-nums">{fareText}</span>
          <span className={cn("mt-1 block text-[12px] tabular-nums", isCheapest ? "font-bold text-ink" : "text-ink-mute")}>{delta}</span>
        </p>
      </div>

      {/* The focal point: the rating that matters most, in words. */}
      <div className={cn("mt-4 rounded-2xl p-4", tone.bg)}>
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white ring-2 ring-ink">
            <CategoryIcon category={lead.category} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-mute">
              {CATEGORY_SHORT[lead.category]}
              {smoothestForYou ? <span className="font-semibold normal-case tracking-normal"> · {smoothestText}</span> : null}
            </p>
            <p className={cn("mt-0.5 text-[24px] font-extrabold leading-tight tracking-[-0.015em]", tone.text)}>{lead.label}</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{lead.meaning}</p>
          </div>
        </div>

        {/* One row on every card at every width: the second rating gives way (its words wrap) before "Why?" moves. */}
        <div className="mt-3 flex items-center gap-2 sm:gap-3">
          {second ? (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <CategoryIcon category={second.category} size="sm" className="max-sm:hidden" />
              <RatingPill rating={second} size="sm" />
            </span>
          ) : null}
          <button
            type="button"
            aria-expanded={why}
            aria-controls={whyId}
            onClick={toggleWhy}
            className={cn(D_LINK, "d-results-why ml-auto inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-1 text-[14px]")}
          >
            Why?
            <ChevronDown aria-hidden className={cn("size-4", why && "rotate-180")} />
          </button>
        </div>

        {/* Slides open in place: the basis and the reasons, in the same words the sheet uses. */}
        <div
          id={whyId}
          ref={reasonsRef}
          className={cn("grid transition-[grid-template-rows] duration-300 ease-out", why ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-3 border-t-2 border-ink/10 pt-3 text-[13px] leading-relaxed text-ink-soft" inert={!why}>
              <p className="d-results-reason font-semibold text-ink">{lead.basisText}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {lead.factors.map((f) => (
                  <li key={f.title} className="d-results-reason flex gap-2">
                    <span aria-hidden className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", tone.dot)} />
                    <span>
                      <span className="font-semibold text-ink">{f.title}.</span> {f.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {second ? (
                <p className="d-results-reason mt-3 text-ink-mute">
                  <span className="font-semibold text-ink">{CATEGORY_SHORT[second.category]}:</span> {second.meaning} {second.basisText}.
                </p>
              ) : null}
              <p className="d-results-reason mt-2 text-ink-mute">The numbers and the other two ratings are on the flight page.</p>
            </div>
          </div>
        </div>
      </div>

      {/* The times, quietly: a route between two stops, and a small plane that crosses it as the card crosses the screen. */}
      <div className="@container mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-1">
        <p>
          <span className="block whitespace-nowrap text-[17px] font-bold leading-none text-ink tabular-nums">{depart}</span>
          <span className="mt-1 block text-[12px] text-ink-mute">{flight.origin.code}</span>
        </p>
        <div className="min-w-0 text-center">
          {/* One line wherever it fits; on the narrowest phones it wraps instead of running into the arrival time. */}
          <p className="whitespace-nowrap text-[12px] font-semibold leading-snug text-ink-soft tabular-nums @max-[17rem]:whitespace-normal">
            {formatDuration(flight.blockMin)} · Nonstop
          </p>
          <div aria-hidden className="pointer-events-none relative mt-1 h-3.5 text-ink">
            <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-slate/70" />
            {/* A stop at each end of the line. The plane flies the stretch between them (the kit's scroll-driven
                plane, inset so it never half-covers a stop), and under a mouse it glides a little further. */}
            <span className="absolute left-0 top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-surface ring-2 ring-inset ring-ink" />
            <span className="absolute right-0 top-1/2 size-[7px] -translate-y-1/2 rounded-full bg-surface ring-2 ring-inset ring-ink" />
            <span className="d-results-plane absolute inset-x-[11px] inset-y-0">
              <span className="d-route-plane absolute inset-0">
                <span className="bg-surface px-1.5">
                  {/* D's one plane: the outlined paper plane of the hero, the wipe and the boarding pass, nose to the arrival. */}
                  <svg aria-hidden viewBox="-10.6 -8.4 23.2 16.8" className="block h-[11px] w-[15px] overflow-visible">
                    <PaperPlane />
                  </svg>
                </span>
              </span>
            </span>
          </div>
        </div>
        <p className="text-right">
          <span className="block whitespace-nowrap text-[17px] font-bold leading-none text-ink tabular-nums">
            {arrive}
            {offset ? (
              <sup className="ml-0.5 text-[11px] font-semibold text-ink-mute">
                {offset}
                <span className="sr-only"> day</span>
              </sup>
            ) : null}
          </span>
          <span className="mt-1 block text-[12px] text-ink-mute">{flight.destination.code}</span>
        </p>
      </div>

      {/* Two quiet actions. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <button
            type="button"
            aria-pressed={inCompare}
            aria-disabled={compareLocked || undefined}
            aria-describedby={compareLocked ? noteId : undefined}
            onClick={(e) => {
              if (!compareLocked) onToggleCompare(e.currentTarget);
            }}
            // One look at a time: the outline when off (and when the list is full), the selected look when on.
            className={cn(inCompare ? D_PILL_SELECTED : D_PILL_OUTLINE, "h-11 px-4 text-[14px]")}
          >
            {inCompare ? (
              <Check key="on" aria-hidden className={compareIcon} onAnimationEnd={comparePopped} />
            ) : (
              <Plus key="off" aria-hidden className={compareIcon} onAnimationEnd={comparePopped} />
            )}
            Compare
            <span className="sr-only"> {flight.flightNumber}</span>
          </button>
          {compareLocked ? (
            <p id={noteId} className="text-xs text-ink-mute">
              Up to {MAX_COMPARE} flights
            </p>
          ) : null}
        </div>
        <Link
          href={hrefs.flight(item, { ...campaign, pos: String(position) })}
          className={cn(D_LINK, "inline-flex h-11 items-center gap-1 rounded-full px-2 text-[15px]")}
        >
          Details
          <span className="sr-only"> for {flight.flightNumber}</span>
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </article>
  );
}
