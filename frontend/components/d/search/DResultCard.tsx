"use client";

import { ArrowRight, Check, ChevronDown, Plane, Plus } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { displayAircraftName } from "@preflight/shared/aircraft";
import { formatDuration, formatTime12 } from "@preflight/shared/dates";
import type { Rating } from "@preflight/shared/ratings";
import { fareAt, type FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { useHrefs } from "@/components/c/shell/ToolContext";
import { CategoryIcon } from "@/components/d/brand/CategoryIcon";
import { RatingPill } from "@/components/d/ratings/RatingPill";
import { CATEGORY_SHORT, D_TIER, dTierTone } from "@/components/d/ratings/tone";
import { track } from "@/lib/analytics";
import { formatFare } from "@/lib/c/format";
import { MAX_COMPARE, type CompareItem } from "@/lib/c/model";
import { priceDeltaText } from "@/lib/d/view";
import { cn } from "@/lib/cn";

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

/**
 * One flight in version D's results (docs/ITERATION_2.md; look: docs/ui-d-theme.md).
 * The eye lands on one thing: the rating that matters most to this visitor, in
 * words, on a soft tint with its outlined icon and its one-line meaning. The
 * second rating sits under it as a pill; "Why?" slides the basis and the
 * factors open in place. Then the times, and two quiet actions — Compare (a
 * toggle) and Details (a link). No score, no timeline, no forecast talk.
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

  function toggleWhy() {
    if (!why) track("d_rating_open", { category: lead.category, tier: lead.tier, basis: lead.basis, from: "results" });
    setWhy((v) => !v);
  }

  return (
    <article aria-labelledby={titleId} className="rounded-[24px] bg-surface p-5 shadow-soft">
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
            <span className="tabular-nums">{flight.flightNumber}</span> · {displayAircraftName(flight.aircraft)}
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

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          {second ? (
            <span className="inline-flex items-center gap-1.5">
              <CategoryIcon category={second.category} size="sm" />
              <RatingPill rating={second} size="sm" />
            </span>
          ) : null}
          <button
            type="button"
            aria-expanded={why}
            aria-controls={whyId}
            onClick={toggleWhy}
            className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-[14px] font-bold text-ink underline decoration-2 underline-offset-4 transition-transform duration-[120ms] active:scale-[0.98]"
          >
            Why?
            <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-300", why && "rotate-180")} />
          </button>
        </div>

        {/* Slides open in place: the basis and the reasons, in the same words the sheet uses. */}
        <div id={whyId} className={cn("grid transition-[grid-template-rows] duration-300 ease-out", why ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
          <div className="min-h-0 overflow-hidden">
            <div className="mt-3 border-t-2 border-ink/10 pt-3 text-[13px] leading-relaxed text-ink-soft" inert={!why}>
              <p className="font-semibold text-ink">{lead.basisText}</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {lead.factors.map((f) => (
                  <li key={f.title} className="flex gap-2">
                    <span aria-hidden className={cn("mt-[7px] size-1.5 shrink-0 rounded-full", tone.dot)} />
                    <span>
                      <span className="font-semibold text-ink">{f.title}.</span> {f.detail}
                    </span>
                  </li>
                ))}
              </ul>
              {second ? (
                <p className="mt-3 text-ink-mute">
                  <span className="font-semibold text-ink">{CATEGORY_SHORT[second.category]}:</span> {second.meaning} {second.basisText}.
                </p>
              ) : null}
              <p className="mt-2 text-ink-mute">The numbers and the other two ratings are on the flight page.</p>
            </div>
          </div>
        </div>
      </div>

      {/* The times, quietly. */}
      <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-1">
        <p>
          <span className="block whitespace-nowrap text-[17px] font-bold leading-none text-ink tabular-nums">{depart}</span>
          <span className="mt-1 block text-[12px] text-ink-mute">{flight.origin.code}</span>
        </p>
        <div className="min-w-0 text-center">
          <p className="whitespace-nowrap text-[12px] font-semibold text-ink-soft tabular-nums">{formatDuration(flight.blockMin)} · Nonstop</p>
          <div aria-hidden className="mt-1 flex items-center gap-1.5 text-ink">
            <span className="h-0.5 flex-1 rounded-full bg-slate/70" />
            <Plane className="size-3.5 rotate-45" strokeWidth={2.25} />
            <span className="h-0.5 flex-1 rounded-full bg-slate/70" />
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
            className={cn(
              "inline-flex h-11 items-center justify-center gap-1.5 rounded-full px-4 text-[14px] font-bold ring-2 ring-inset transition-[background-color,transform] duration-[120ms] active:scale-[0.98]",
              compareLocked
                ? "cursor-not-allowed bg-transparent text-ink-mute ring-slate"
                : inCompare
                  ? "bg-leaf-100 text-leaf-ink ring-leaf-ink"
                  : "bg-transparent text-ink ring-ink hover:bg-ink/5",
            )}
          >
            {inCompare ? <Check aria-hidden className="size-4" /> : <Plus aria-hidden className="size-4" />}
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
          className="inline-flex h-11 items-center gap-1 rounded-full px-2 text-[15px] font-bold text-ink underline-offset-4 transition-colors hover:underline"
        >
          Details
          <span className="sr-only"> for {flight.flightNumber}</span>
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </div>
    </article>
  );
}
