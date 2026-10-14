"use client";

import { Check, ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";
import { formatDuration, formatLongDate, formatShortDate, formatTime12 } from "@preflight/shared/dates";
import type { AlternativeFlight, Flight, SectionContext, SectionProps } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { cn } from "@/lib/cn";
import { TONE_CLASSES } from "@/lib/theme";
import { useTracker } from "@/lib/tracking";
import {
  BODY_LABEL,
  compareTeaserLine,
  dayMarker,
  deltaLabel,
  fareLabel,
  relationLabel,
  scoreLabel,
  scoreTone,
  visibleAlternatives,
} from "./control/compare";
import { useExplore } from "./explore/context";

// ── Section body ────────────────────────────────────────────────────────────

export function CompareSection({ flight, ctx }: SectionProps) {
  const tracker = useTracker();
  const explore = useExplore();
  /** Variant B, or variant A showing the set-up flight: "your flight". An explored option is "this flight". */
  const ownFlight = explore?.showingOwnFlight ?? true;
  const [expanded, setExpanded] = useState<string[]>([]);
  const [held, setHeld] = useState<string[]>([]);
  const alternatives = visibleAlternatives(flight, ctx.daysUntil);

  function toggleExpanded(alt: AlternativeFlight) {
    const isOpen = expanded.includes(alt.id);
    setExpanded(isOpen ? expanded.filter((id) => id !== alt.id) : [...expanded, alt.id]);
    if (!isOpen) tracker?.event("alternative_viewed", "compare", alt.id);
  }

  function hold(alt: AlternativeFlight) {
    if (held.includes(alt.id)) return;
    setHeld([...held, alt.id]);
    tracker?.event("alternative_hold", "compare", alt.id);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-ink-700">
        Other flights between {flight.origin.city} and {flight.destination.city}, scored on the same scale as{" "}
        {ownFlight ? "yours" : "this one"} and ranked smoothest first.
      </p>

      <ReferenceRow flight={flight} label={ownFlight ? "Your flight" : "This flight"} />

      {alternatives.length > 0 ? (
        <div className="space-y-3">
          {alternatives.map((alt) => (
            <AlternativeCard
              key={alt.id}
              flight={flight}
              alt={alt}
              open={expanded.includes(alt.id)}
              isHeld={held.includes(alt.id)}
              onToggle={() => toggleExpanded(alt)}
              onHold={() => hold(alt)}
              onOpen={explore ? () => explore.openAlternative(alt) : undefined}
              ownFlight={ownFlight}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-2xl bg-canvas/70 px-4 py-3 text-sm text-ink-500 ring-1 ring-inset ring-line/70">
          No other flights were found on this route around your date.
        </p>
      )}

      <p className="text-xs leading-relaxed text-ink-500">
        {forecastNote(ctx)} Holding an option only keeps it here for you — nothing is booked or charged.
        {explore ? " Opening one adds it to the flights at the top so you can look through it." : null}
      </p>
    </div>
  );
}

/** One calm line for the collapsed header. */
export function compareTeaser(flight: Flight, ctx: SectionContext): string {
  return compareTeaserLine(flight, ctx.daysUntil);
}

function forecastNote(ctx: SectionContext): string {
  switch (ctx.forecast.mode) {
    case "history":
      return "Scores are early estimates from past flights on this route; they sharpen as your date gets closer.";
    case "outlook":
      return "Scores are a seasonal outlook and update daily from about 10 days before departure.";
    default:
      return "Scores use the latest forecast and are refreshed through the day.";
  }
}

// ── Your flight ─────────────────────────────────────────────────────────────

function ReferenceRow({ flight, label }: { flight: Flight; label: string }) {
  return (
    <div className="rounded-2xl bg-breeze-50/60 px-4 py-3.5 ring-1 ring-inset ring-breeze-100">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Pill tone="breeze">{label}</Pill>
            <span className="text-xs text-ink-500">{safeShortDate(flight.input.date)}</span>
          </div>
          <FlightLine airline={flight.airline.name} flightNumber={flight.flightNumber} />
          <TimesLine
            departTime={flight.departTime}
            arriveTime={flight.arriveTime}
            arriveDayOffset={flight.arriveDayOffset}
            blockMin={flight.blockMin}
          />
          <AircraftLine name={flight.aircraft.fullName} bodyType={flight.aircraft.bodyType} />
        </div>
        <ScoreBadge score={flight.smoothness.score} caption={<span className="text-ink-400">Smoothness</span>} />
      </div>
    </div>
  );
}

// ── Alternative card ────────────────────────────────────────────────────────

interface AlternativeCardProps {
  flight: Flight;
  alt: AlternativeFlight;
  open: boolean;
  isHeld: boolean;
  onToggle: () => void;
  onHold: () => void;
  /** Variant A: show this option as a full flight in the dashboard. */
  onOpen?: () => void;
  /** false while an explored option (not the participant's own flight) is on screen. */
  ownFlight: boolean;
}

function AlternativeCard({ flight, alt, open, isHeld, onToggle, onHold, onOpen, ownFlight }: AlternativeCardProps) {
  const delta = Math.round(alt.scoreDelta);
  const fare = fareLabel(alt.fareDiffUsd);
  const marker = dayMarker(alt.arriveDayOffset);

  return (
    <article
      className={cn(
        "rounded-2xl bg-surface shadow-soft ring-1 transition-shadow duration-300",
        isHeld ? "ring-calm-200" : "ring-line",
      )}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="w-full rounded-t-2xl px-4 pb-3 pt-4 text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Pill tone="neutral">{relationLabel(flight.input.date, alt.date)}</Pill>
              <span className="text-xs text-ink-500">{safeShortDate(alt.date)}</span>
            </div>
            <FlightLine airline={alt.airline.name} flightNumber={alt.flightNumber} />
            <TimesLine
              departTime={alt.departTime}
              arriveTime={alt.arriveTime}
              arriveDayOffset={alt.arriveDayOffset}
              blockMin={alt.blockMin}
            />
            <AircraftLine name={alt.aircraft} bodyType={alt.bodyType} />
          </div>
          <ScoreBadge
            score={alt.smoothnessScore}
            caption={
              <span className={cn("whitespace-nowrap", delta > 0 ? "text-calm-700" : "text-ink-500")}>
                {deltaLabel(delta)}
              </span>
            }
          />
        </div>

        <p className="mt-3 text-sm leading-relaxed text-ink-700">{alt.reason}</p>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="text-sm">
            <span className="font-semibold text-ink-900 tabular-nums">{fare}</span>
            {fare !== "Same fare" ? <span className="text-ink-500"> vs. {ownFlight ? "your fare" : "this flight’s fare"}</span> : null}
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500">
            {open ? "Hide details" : "Details"}
            <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
          </span>
        </div>
      </button>

      {open ? (
        <dl className="mx-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-xl bg-canvas/70 px-3.5 py-3 text-xs leading-snug ring-1 ring-inset ring-line/70">
          <Detail label="Date">{safeLongDate(alt.date)}</Detail>
          <Detail label="Departs">
            <span className="tabular-nums">{formatTime12(alt.departTime)}</span> · {flight.origin.code}
          </Detail>
          <Detail label="Arrives">
            <span className="tabular-nums">{formatTime12(alt.arriveTime)}</span>
            {marker ? <span className="text-ink-500"> ({marker} day)</span> : null} · {flight.destination.code}
          </Detail>
          <Detail label="Gate to gate">
            <span className="tabular-nums">{formatDuration(alt.blockMin)}</span>
          </Detail>
          <Detail label="Aircraft">
            {alt.aircraft} · {BODY_LABEL[alt.bodyType]}
          </Detail>
          <Detail label="Smoothness">
            <span className="tabular-nums">{alt.smoothnessScore} of 100</span> · {scoreLabel(alt.smoothnessScore)}
          </Detail>
          <Detail label={ownFlight ? "vs. your flight" : "vs. this flight"}>
            <span className="tabular-nums">{deltaLabel(delta)}</span> · <span className="tabular-nums">{fare}</span>
            {fare !== "Same fare" ? " fare" : null}
          </Detail>
        </dl>
      ) : null}

      <div className={cn("px-4 pb-4 pt-3", onOpen && "grid grid-cols-1 gap-2 min-[380px]:grid-cols-2")}>
        {onOpen ? (
          <Button
            size="md"
            block
            variant="secondary"
            onClick={onOpen}
            className="whitespace-nowrap px-2 text-[13px]"
          >
            Open this flight
          </Button>
        ) : null}
        <Button
          size="md"
          block
          variant={isHeld ? "soft" : "secondary"}
          aria-pressed={isHeld}
          onClick={onHold}
          className={onOpen ? "whitespace-nowrap px-2 text-[13px]" : undefined}
          icon={isHeld ? <Check aria-hidden className="size-4" strokeWidth={2.5} /> : undefined}
        >
          {isHeld ? "Held" : "Hold this option"}
        </Button>
      </div>
    </article>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function FlightLine({ airline, flightNumber }: { airline: string; flightNumber: string }) {
  return (
    <div className="mt-1.5 text-[15px] font-bold leading-snug text-ink-900">
      {airline} <span className="whitespace-nowrap font-semibold text-ink-500 tabular-nums">{flightNumber}</span>
    </div>
  );
}

function TimesLine({
  departTime,
  arriveTime,
  arriveDayOffset,
  blockMin,
}: {
  departTime: string;
  arriveTime: string;
  arriveDayOffset: number;
  blockMin: number;
}) {
  const marker = dayMarker(arriveDayOffset);
  return (
    <div className="mt-0.5 text-sm leading-snug text-ink-700 tabular-nums">
      <span className="font-semibold text-ink-900">
        <span className="whitespace-nowrap">{formatTime12(departTime)}</span>{" "}
        <span aria-hidden className="text-ink-400">
          →
        </span>{" "}
        <span className="whitespace-nowrap">
          {formatTime12(arriveTime)}
          {marker ? (
            <sup className="ml-0.5 text-[10px] font-semibold text-ink-500" title={`Arrives ${marker} day`}>
              {marker}
            </sup>
          ) : null}
        </span>
      </span>
      <span className="whitespace-nowrap text-ink-500"> · {formatDuration(blockMin)}</span>
    </div>
  );
}

function AircraftLine({ name, bodyType }: { name: string; bodyType: AlternativeFlight["bodyType"] }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
      <span>{name}</span>
      <Pill tone={bodyType === "wide" ? "calm" : "neutral"}>{BODY_LABEL[bodyType]}</Pill>
    </div>
  );
}

/** Score tile with a small caption under it ("Smoothness" for your flight, the delta for alternatives). */
function ScoreBadge({ score, caption }: { score: number; caption: ReactNode }) {
  const t = TONE_CLASSES[scoreTone(score)];
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div
        className={cn("flex size-14 flex-col items-center justify-center rounded-2xl ring-1 ring-inset", t.bg, t.ring)}
        aria-label={`Smoothness score ${score} of 100`}
      >
        <span className={cn("text-xl font-bold leading-none tabular-nums", t.text)}>{score}</span>
        <span className={cn("mt-0.5 text-[9px] font-semibold uppercase tracking-wide opacity-70", t.text)}>/ 100</span>
      </div>
      <span className="text-[10px] font-semibold uppercase tracking-wide tabular-nums">{caption}</span>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-semibold text-ink-500">{label}</dt>
      <dd className="text-ink-900">{children}</dd>
    </>
  );
}

function safeShortDate(iso: string): string {
  try {
    return formatShortDate(iso);
  } catch {
    return iso;
  }
}

function safeLongDate(iso: string): string {
  try {
    return formatLongDate(iso);
  } catch {
    return iso;
  }
}
