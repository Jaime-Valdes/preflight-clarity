"use client";

import { ArrowUpDown, CalendarDays, CalendarRange, Check, Clock3, Map as MapIcon, Plane } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { addDays, daysBetween, formatLongDate, isISODate } from "@preflight/shared/dates";
import { departWindowOf, DEPART_WINDOWS, generateFlight } from "@preflight/shared/fakeFlight";
import type { AddedVia, DepartWindow, Flight, FlightInput, FlightPrefs } from "@preflight/shared/types";
import { AirportField } from "@/components/flow/AirportField";
import { MAX_DAYS_AHEAD, validateSetup, type SetupErrors } from "@/components/flow/FlightSetupScreen";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { Sheet } from "./Sheet";

export interface WhatIfRequest {
  input: FlightInput;
  prefs: FlightPrefs;
  addedVia: AddedVia;
}

interface WhatIfSheetProps {
  /** The flight on screen when the sheet was opened; every option starts from it. */
  current: Flight;
  today: string;
  /** Adds (or, for a flight already in the strip, shows) the flight; the dashboard closes the sheet when it succeeds. */
  onSubmit: (request: WhatIfRequest) => "added" | "existing" | "full" | "error";
  onClose: () => void;
}

type Choice = "day" | "time" | "wide" | "route";

const WINDOW_UI: Record<DepartWindow, { label: string; range: string }> = {
  morning: { label: "Morning", range: "6–11 AM" },
  afternoon: { label: "Afternoon", range: "11 AM–5 PM" },
  evening: { label: "Evening", range: "5–11 PM" },
};

const DATE_INPUT = cn(
  "relative h-12 w-full appearance-none rounded-2xl bg-surface pl-11 pr-4 text-left text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-breeze-500 focus:outline-none",
  "[&::-webkit-date-and-time-value]:text-left",
  "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-0",
);

function clampDate(iso: string, min: string, max: string): string {
  return iso < min ? min : iso > max ? max : iso;
}

function dateNote(iso: string, today: string): string {
  const days = daysBetween(today, iso);
  return `${formatLongDate(iso)} · ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`;
}

/**
 * "Try a different flight": four calm options, each building another
 * deterministic flight for the strip. Nothing here ranks or recommends.
 */
export function WhatIfSheet({ current, today, onSubmit, onClose }: WhatIfSheetProps) {
  const maxDate = addDays(today, MAX_DAYS_AHEAD);
  const currentWindow = departWindowOf(current.departTime);
  const isWide = current.aircraft.bodyType === "wide";

  const [choice, setChoice] = useState<Choice | null>(null);
  const [day, setDay] = useState(() => clampDate(addDays(current.input.date, 1), today, maxDate));
  const [depWindow, setDepWindow] = useState<DepartWindow | null>(null);
  const [route, setRoute] = useState<FlightInput>(() => ({ ...current.input }));
  const [attempted, setAttempted] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dayValid = isISODate(day) && day >= today && day <= maxDate;
  const routeCheck = validateSetup(route, today);
  const routeErrors: SetupErrors = attempted && !routeCheck.ok ? routeCheck.errors : {};

  // Whether a wide-body actually flies this route that day (some airports and carriers have none).
  const widePrefs = useMemo<FlightPrefs>(() => ({ bodyType: "wide", departWindow: currentWindow }), [currentWindow]);
  const wideAvailable = useMemo(() => {
    if (isWide || choice !== "wide") return true;
    try {
      return generateFlight(current.input, widePrefs).aircraft.bodyType === "wide";
    } catch {
      return false;
    }
  }, [choice, current.input, isWide, widePrefs]);

  function pick(next: Choice) {
    setChoice(next);
    setNote(null);
    setAttempted(false);
  }

  function request(): WhatIfRequest | null {
    switch (choice) {
      case "day":
        return dayValid ? { input: { ...current.input, date: day }, prefs: {}, addedVia: "whatif_day" } : null;
      case "time":
        return depWindow ? { input: current.input, prefs: { departWindow: depWindow }, addedVia: "whatif_time" } : null;
      case "wide":
        return wideAvailable ? { input: current.input, prefs: widePrefs, addedVia: "whatif_wide" } : null;
      case "route":
        return routeCheck.ok ? { input: routeCheck.input, prefs: {}, addedVia: "whatif_route" } : null;
      default:
        return null;
    }
  }

  function submit() {
    const req = request();
    if (!req) {
      if (choice === "route") setAttempted(true);
      return;
    }
    const result = onSubmit(req);
    if (result === "full") setNote("The strip holds up to 6 flights.");
    else if (result === "error") setNote("That flight couldn’t be put together. Try another choice.");
  }

  const ready =
    (choice === "day" && dayValid) ||
    (choice === "time" && depWindow !== null) ||
    (choice === "wide" && wideAvailable) ||
    choice === "route";

  return (
    <Sheet
      title="Try a different flight"
      description="Each choice builds another illustrative flight to look through. Your flight stays in the strip."
      onClose={onClose}
      footer={
        <>
          {note ? (
            <p role="status" className="mb-2.5 text-center text-[13px] leading-snug text-ink-500">
              {note}
            </p>
          ) : null}
          <Button block onClick={submit} disabled={!ready}>
            Show this flight
          </Button>
        </>
      }
    >
      <div className="mt-2 flex flex-col gap-2.5">
        <Option
          icon={<CalendarRange />}
          title="Same route, another day"
          sub={`${current.origin.code} → ${current.destination.code} on a date you choose`}
          selected={choice === "day"}
          onSelect={() => pick("day")}
        >
          <DateField
            label="Departure date"
            value={day}
            min={today}
            max={maxDate}
            onChange={setDay}
            hint={dayValid ? dateNote(day, today) : "Pick a date from today to 12 months ahead."}
            invalid={!dayValid}
          />
        </Option>

        <Option
          icon={<Clock3 />}
          title="A different time of day"
          sub="Morning, afternoon or evening departure, same day"
          selected={choice === "time"}
          onSelect={() => pick("time")}
        >
          <div role="radiogroup" aria-label="Departure time" className="grid grid-cols-3 gap-2">
            {DEPART_WINDOWS.map((w) => {
              const isCurrent = w === currentWindow;
              const on = depWindow === w;
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-disabled={isCurrent || undefined}
                  disabled={isCurrent}
                  onClick={() => {
                    setDepWindow(w);
                    setNote(null);
                  }}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center rounded-2xl px-1 py-2 text-center ring-1 ring-inset transition-colors",
                    isCurrent
                      ? "cursor-not-allowed bg-canvas text-ink-400 ring-line"
                      : on
                        ? "bg-night-900 text-white ring-night-900"
                        : "bg-surface text-ink-900 ring-line-strong hover:bg-canvas",
                  )}
                >
                  <span className="text-[13px] font-semibold">{WINDOW_UI[w].label}</span>
                  <span className={cn("mt-0.5 text-[11px]", isCurrent ? "text-ink-400" : on ? "text-white/70" : "text-ink-500")}>
                    {isCurrent ? "This flight" : WINDOW_UI[w].range}
                  </span>
                </button>
              );
            })}
          </div>
        </Option>

        {isWide ? null : (
          <Option
            icon={<Plane />}
            title="A larger plane"
            sub="A wide-body on the same route and day, where available"
            selected={choice === "wide"}
            onSelect={() => pick("wide")}
          >
            <p className="text-[13px] leading-snug text-ink-500" role="status">
              {wideAvailable
                ? `A wide-body ${WINDOW_UI[currentWindow].label.toLowerCase()} departure, ${current.origin.code} → ${current.destination.code}.`
                : "No larger plane flies this route on that day."}
            </p>
          </Option>
        )}

        <Option
          icon={<MapIcon />}
          title="A different route"
          sub="Any origin, destination and date"
          selected={choice === "route"}
          onSelect={() => pick("route")}
        >
          <AirportField
            id="whatif-origin"
            label="From"
            value={route.origin}
            onChange={(v) => setRoute((r) => ({ ...r, origin: v }))}
            hint={routeErrors.origin}
            invalid={!!routeErrors.origin}
            quickPicks={false}
          />
          <AirportField
            id="whatif-destination"
            label="To"
            value={route.destination}
            onChange={(v) => setRoute((r) => ({ ...r, destination: v }))}
            hint={routeErrors.destination}
            invalid={!!routeErrors.destination}
            quickPicks={false}
            className="mt-3"
            labelAction={
              <button
                type="button"
                onClick={() => setRoute((r) => ({ ...r, origin: r.destination, destination: r.origin }))}
                aria-label="Swap origin and destination"
                className="-my-2 flex h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-ink-500 transition-colors hover:bg-line/50 hover:text-ink-900"
              >
                <ArrowUpDown aria-hidden className="size-4" />
                Swap
              </button>
            }
          />
          <DateField
            className="mt-3"
            label="Departure date"
            value={route.date}
            min={today}
            max={maxDate}
            onChange={(v) => setRoute((r) => ({ ...r, date: v }))}
            hint={routeErrors.date ?? (routeCheck.ok || isISODate(route.date) ? safeDateNote(route.date, today) : undefined)}
            invalid={!!routeErrors.date}
          />
        </Option>
      </div>
    </Sheet>
  );
}

function safeDateNote(iso: string, today: string): string | undefined {
  try {
    return iso >= today ? dateNote(iso, today) : undefined;
  } catch {
    return undefined;
  }
}

function Option({
  icon,
  title,
  sub,
  selected,
  onSelect,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  // Bring a just-opened option's controls into view inside the sheet.
  useEffect(() => {
    if (!selected) return;
    const el = ref.current;
    const timer = window.setTimeout(() => el?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 60);
    return () => window.clearTimeout(timer);
  }, [selected]);
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-3xl bg-surface shadow-soft ring-1 transition-shadow duration-200",
        selected ? "ring-2 ring-night-900/80" : "ring-line/80",
      )}
    >
      <button
        type="button"
        aria-expanded={selected}
        aria-controls={selected ? panelId : undefined}
        onClick={onSelect}
        className="flex min-h-16 w-full items-center gap-3.5 rounded-3xl px-4 py-3 text-left"
      >
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100 [&_svg]:size-5"
        >
          {icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold leading-snug text-ink-900">{title}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-500">{sub}</span>
        </span>
        <span
          aria-hidden
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full ring-1 ring-inset",
            selected ? "bg-night-900 text-white ring-night-900" : "ring-line-strong",
          )}
        >
          {selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
      </button>
      {selected ? (
        <div id={panelId} className="px-4 pb-4 animate-fade-up">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
  hint,
  invalid,
  className,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
  hint?: string;
  invalid?: boolean;
  className?: string;
}) {
  const id = useId();
  const hintId = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink-700">
        {label}
      </label>
      <div className="relative">
        <CalendarDays aria-hidden className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? hintId : undefined}
          aria-invalid={invalid || undefined}
          className={DATE_INPUT}
        />
      </div>
      {hint ? (
        <p id={hintId} className={cn("mt-1.5 text-[13px] leading-snug", invalid ? "text-sand-700" : "text-ink-500")}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
