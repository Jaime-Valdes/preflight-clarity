"use client";

import { ArrowRight, ArrowUpDown, CalendarDays } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { resolveAirport } from "@preflight/shared/airports";
import { addDays, daysBetween, formatLongDate, isISODate } from "@preflight/shared/dates";
import type { FlightInput, Timeframe } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { cn } from "@/lib/cn";
import { AirportField } from "./AirportField";
import { fadeUp, StepHeader } from "./StepHeader";

export const MAX_DAYS_AHEAD = 365;

/** Default departure offset (days) from the pre-survey timeframe. */
export function defaultOffsetDays(timeframe: Timeframe | null): number {
  switch (timeframe) {
    case "lt1w":
      return 5;
    case "1to4w":
      return 18;
    case "1to3m":
      return 47;
    case "3mplus":
      return 120;
    default:
      return 47;
  }
}

export interface SetupErrors {
  origin?: string;
  destination?: string;
  date?: string;
}

export type SetupValidation = { ok: true; input: FlightInput } | { ok: false; errors: SetupErrors };

/**
 * Whether two typed endpoints are the same airport however they were written
 * ("JFK" vs "New York", "lhr" vs "Heathrow"). Unknown places compare by city
 * ("Springfield" vs "Springfield, IL" match; "Springfield" vs "Sprague" share
 * a synthetic code but differ).
 */
function sameEndpoint(origin: string, destination: string): boolean {
  if (origin.toUpperCase() === destination.toUpperCase()) return true;
  const a = resolveAirport(origin);
  const b = resolveAirport(destination);
  if (a.known !== b.known) return false;
  return a.known ? a.code === b.code : a.city.toLowerCase() === b.city.toLowerCase();
}

export function validateSetup(draft: FlightInput, today: string): SetupValidation {
  const origin = draft.origin.trim();
  const destination = draft.destination.trim();
  const errors: SetupErrors = {};
  if (!origin) errors.origin = "Where does the flight leave from?";
  if (!destination) errors.destination = "Where is the flight going?";
  else if (origin && sameEndpoint(origin, destination)) {
    errors.destination = "Choose a destination that's different from the origin.";
  }
  if (!draft.date) errors.date = "When is the flight?";
  else if (!isISODate(draft.date)) errors.date = "That date doesn't look right.";
  else if (draft.date < today) errors.date = "Pick a date from today onwards.";
  else if (daysBetween(today, draft.date) > MAX_DAYS_AHEAD) errors.date = "Pick a date within the next 12 months.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: { origin, destination, date: draft.date } };
}

interface FlightSetupScreenProps {
  today: string;
  draft: FlightInput;
  onDraftChange: (draft: FlightInput) => void;
  onContinue: (input: FlightInput) => void;
}

/** Origin, destination and date for the flight the briefing will be about. */
export function FlightSetupScreen({ today, draft, onDraftChange, onContinue }: FlightSetupScreenProps) {
  const dateId = useId();
  const dateHintId = useId();
  const [attempted, setAttempted] = useState(false);
  /** performance.now() at mount: a tap within ~400 ms is the tail of a double tap on the previous screen. */
  const shownAt = useRef<number | null>(null);
  useEffect(() => {
    shownAt.current = performance.now();
  }, []);
  const validation = validateSetup(draft, today);
  const errors: SetupErrors = attempted && !validation.ok ? validation.errors : {};
  const maxDate = addDays(today, MAX_DAYS_AHEAD);
  const dateValid = isISODate(draft.date) && draft.date >= today && draft.date <= maxDate;
  const daysAway = dateValid ? daysBetween(today, draft.date) : null;

  function submit() {
    if (shownAt.current !== null && performance.now() - shownAt.current < 400) return;
    if (validation.ok) {
      onContinue(validation.input);
      return;
    }
    setAttempted(true);
    // Bring the first field that needs attention into view without popping the keyboard over the hint.
    const first = validation.errors.origin ? "setup-origin" : validation.errors.destination ? "setup-destination" : dateId;
    document.getElementById(first)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function swap() {
    onDraftChange({ ...draft, origin: draft.destination, destination: draft.origin });
  }

  return (
    <Screen
      footer={
        <Button block onClick={submit} icon={<ArrowRight aria-hidden className="size-4" />}>
          Continue
        </Button>
      }
    >
      <StepHeader
        stage={2}
        eyebrow="Your flight"
        title="Which flight should we look at?"
        sub="The flight you just rated — your next real one, or the one you imagined. We'll put together a briefing for it."
      />
      <div className="flex flex-col gap-3">
        <Card className="animate-fade-up" style={fadeUp()}>
          <AirportField
            id="setup-origin"
            label="From"
            value={draft.origin}
            onChange={(v) => onDraftChange({ ...draft, origin: v })}
            hint={errors.origin}
            invalid={!!errors.origin}
          />
          <AirportField
            id="setup-destination"
            label="To"
            value={draft.destination}
            onChange={(v) => onDraftChange({ ...draft, destination: v })}
            hint={errors.destination}
            invalid={!!errors.destination}
            className="mt-4"
            labelAction={
              <button
                type="button"
                onClick={swap}
                aria-label="Swap origin and destination"
                className="-my-2 flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ink-500 transition-colors hover:bg-line/50 hover:text-ink-900"
              >
                <ArrowUpDown aria-hidden className="size-4" />
                Swap
              </button>
            }
          />
        </Card>

        <Card className="animate-fade-up" style={fadeUp(60)}>
          <label htmlFor={dateId} className="mb-1.5 block text-[13px] font-semibold text-ink-700">
            Departure date
          </label>
          <div className="relative">
            <CalendarDays aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-[1] size-4 -translate-y-1/2 text-ink-400" />
            <input
              id={dateId}
              type="date"
              value={draft.date}
              min={today}
              max={maxDate}
              onChange={(e) => onDraftChange({ ...draft, date: e.target.value })}
              aria-describedby={dateHintId}
              aria-invalid={errors.date ? true : undefined}
              className={cn(
                "relative h-12 w-full appearance-none rounded-2xl bg-surface pl-11 pr-4 text-left text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-breeze-500 focus:outline-none",
                "[&::-webkit-date-and-time-value]:text-left",
                // Chrome/Android: stretch the invisible native picker trigger over the whole field so a tap anywhere opens it.
                "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
              )}
            />
          </div>
          <p id={dateHintId} className={cn("mt-1.5 text-[13px] leading-snug", errors.date ? "text-sand-700" : "text-ink-500")}>
            {errors.date ? (
              // A fresh node, so the error is announced when it appears.
              <span role="alert">{errors.date}</span>
            ) : daysAway !== null
                ? `${formatLongDate(draft.date)} · ${daysAway === 0 ? "today" : daysAway === 1 ? "tomorrow" : `in ${daysAway} days`}`
                : "Any date in the next 12 months."}
          </p>
        </Card>
      </div>
    </Screen>
  );
}
