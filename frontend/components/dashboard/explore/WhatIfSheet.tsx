"use client";

import { ArrowUpDown, CalendarDays, CalendarRange, Check, Clock3, Map as MapIcon, Plane } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { addDays, daysBetween, formatLongDate, isISODate } from "@preflight/shared/dates";
import { departWindowOf, DEPART_WINDOWS, flightSeed, generateFlight } from "@preflight/shared/fakeFlight";
import { SCHEDULE_DAYS } from "@preflight/shared/forecast";
import { hashId } from "@preflight/shared/random";
import type { AddedVia, DepartWindow, Flight, FlightInput, FlightPrefs } from "@preflight/shared/types";
import { AirportField } from "@/components/flow/AirportField";
import { validateSetup, type SetupErrors, type SetupValidation } from "@/components/flow/FlightSetupScreen";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { MAX_EXPLORED_FLIGHTS } from "@/lib/tracking";
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

const NO_WIDE = "No larger plane is scheduled on this route that day.";

/** Schedules and fares are published about SCHEDULE_DAYS (330) days ahead; every date picker stops there. */
const DATE_RANGE_HINT = `Pick a date from today to ${SCHEDULE_DAYS} days ahead — about as far as airlines publish schedules.`;

/** The flow's checks, plus the schedule horizon (a typed date past the picker's max). */
function checkRoute(route: FlightInput, today: string, maxDate: string): SetupValidation {
  const check = validateSetup(route, today);
  if (!isISODate(route.date) || route.date <= maxDate) return check;
  return { ok: false, errors: { ...(check.ok ? {} : check.errors), date: DATE_RANGE_HINT } };
}

/** The window whose range ("5–11 PM"…) this departure falls inside; null outside all three (e.g. 11:15 PM). */
function windowContaining(time: string): DepartWindow | null {
  const h = Number(time.slice(0, 2));
  return h >= 6 && h < 23 ? departWindowOf(time) : null;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clampDate(iso: string, min: string, max: string): string {
  return iso < min ? min : iso > max ? max : iso;
}

function dateNote(iso: string, today: string): string {
  const days = daysBetween(today, iso);
  return `${formatLongDate(iso)} · ${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}`;
}

/** The id generateFlight would give this request, without generating it (null if it would reject the input). */
function flightIdOf(req: WhatIfRequest): string | null {
  try {
    return hashId(flightSeed(req.input, req.prefs));
  } catch {
    return null;
  }
}

/**
 * "Try a different flight": four calm options, each building another
 * deterministic flight for the strip. Nothing here ranks or recommends.
 */
export function WhatIfSheet({ current, today, onSubmit, onClose }: WhatIfSheetProps) {
  const maxDate = addDays(today, SCHEDULE_DAYS);
  const currentWindow = departWindowOf(current.departTime);
  /** The time-of-day choice that is this flight (disabled), if its departure falls inside one. */
  const thisWindow = windowContaining(current.departTime);
  const wideNoteId = useId();
  const isWide = current.aircraft.bodyType === "wide";

  const [choice, setChoice] = useState<Choice | null>(null);
  const [day, setDay] = useState(() => clampDate(addDays(current.input.date, 1), today, maxDate));
  const [depWindow, setDepWindow] = useState<DepartWindow | null>(null);
  const [route, setRoute] = useState<FlightInput>(() => ({ ...current.input }));
  const [attempted, setAttempted] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const dayValid = isISODate(day) && day >= today && day <= maxDate;
  const routeCheck = checkRoute(route, today, maxDate);
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

  /** The windows that can be picked: every one but this flight's own. */
  const windowChoices = DEPART_WINDOWS.filter((w) => w !== thisWindow);

  function chooseWindow(w: DepartWindow) {
    setDepWindow(w);
    setNote(null);
  }

  // The radio keyboard model (as in the flow's ChoiceGroup), skipping this flight's own window.
  function onWindowKeyDown(e: KeyboardEvent<HTMLButtonElement>, w: DepartWindow) {
    const n = windowChoices.length;
    const i = windowChoices.indexOf(w);
    const target =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (i - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (target < 0) return;
    e.preventDefault();
    const next = windowChoices[target];
    chooseWindow(next);
    e.currentTarget.parentElement?.querySelector<HTMLElement>(`[data-window="${next}"]`)?.focus();
  }

  function submit() {
    const req = request();
    if (!req) {
      if (choice === "route" && !routeCheck.ok) {
        // Render the errors first, so the field's description is the error when it gets focus.
        flushSync(() => setAttempted(true));
        const { errors } = routeCheck;
        const first = errors.origin ? "whatif-origin" : errors.destination ? "whatif-destination" : "whatif-date";
        document.getElementById(first)?.focus();
      }
      return;
    }
    const result = onSubmit(req);
    if (result === "full") setNote(`You can look at up to ${MAX_EXPLORED_FLIGHTS} flights.`);
    else if (result === "error") setNote("That flight couldn’t be put together. Try another choice.");
  }

  // A choice can give back the flight on screen ("A different route" as prefilled, or this flight's own
  // date): say so and keep "Show this flight" off rather than closing the sheet with nothing new.
  const candidate = request();
  const sameAsCurrent = candidate !== null && flightIdOf(candidate) === current.id;
  const message =
    note ??
    (sameAsCurrent
      ? choice === "day"
        ? "That’s the flight on screen now — pick another date."
        : "That’s the flight on screen now — change the route or date."
      : null);
  const noWide = choice === "wide" && !wideAvailable;

  const ready =
    !sameAsCurrent &&
    ((choice === "day" && dayValid) ||
      (choice === "time" && depWindow !== null) ||
      (choice === "wide" && wideAvailable) ||
      choice === "route");

  return (
    <Sheet
      title="Try a different flight"
      description="Each choice builds another illustrative flight to look through. Your flight stays at the top."
      onClose={onClose}
      footer={
        <>
          {/* Always mounted, so a message that appears is announced. The no-larger-plane line is shown in its option. */}
          <p role="status" className={cn("text-center text-[13px] leading-snug text-ink-500", message && "mb-2.5")}>
            {message ?? (noWide ? <span className="sr-only">{NO_WIDE}</span> : null)}
          </p>
          <Button block onClick={submit} disabled={!ready} aria-describedby={noWide && !message ? wideNoteId : undefined}>
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
            hint={dayValid ? dateNote(day, today) : DATE_RANGE_HINT}
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
              const isCurrent = w === thisWindow;
              const on = depWindow === w;
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  data-window={w}
                  aria-checked={on}
                  aria-disabled={isCurrent || undefined}
                  disabled={isCurrent}
                  // One tab stop for the group (the checked window, else the first open one); arrows move within it.
                  tabIndex={w === (depWindow ?? windowChoices[0]) ? 0 : -1}
                  onKeyDown={(e) => onWindowKeyDown(e, w)}
                  onClick={() => chooseWindow(w)}
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
            <p id={wideNoteId} className="text-[13px] leading-snug text-ink-500">
              {wideAvailable
                ? `A wide-body ${WINDOW_UI[currentWindow].label.toLowerCase()} departure, ${current.origin.code} → ${current.destination.code}.`
                : NO_WIDE}
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
          <div onFocus={liftField}>
            <AirportField
              id="whatif-origin"
              label="From"
              value={route.origin}
              onChange={(v) => setRoute((r) => ({ ...r, origin: v }))}
              hint={routeErrors.origin}
              invalid={!!routeErrors.origin}
              quickPicks={false}
              allowFreeText={false}
            />
            <AirportField
              id="whatif-destination"
              label="To"
              value={route.destination}
              onChange={(v) => setRoute((r) => ({ ...r, destination: v }))}
              hint={routeErrors.destination}
              invalid={!!routeErrors.destination}
              quickPicks={false}
              allowFreeText={false}
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
          </div>
          <DateField
            id="whatif-date"
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

/**
 * A focused From/To field moves to the top of the sheet's scroll area, so its suggestions open
 * in view rather than under the pinned footer (or an on-screen keyboard). Once the keyboard has
 * had time to rise, and again whenever the visible area resizes while the field has focus.
 */
function liftField(e: FocusEvent<HTMLDivElement>) {
  const field = e.target;
  if (!(field instanceof HTMLInputElement) || field.type !== "text") return;
  const lift = () => {
    const scroller = field.closest<HTMLElement>("[data-sheet-scroll]");
    if (!scroller || document.activeElement !== field) return;
    const top = scroller.scrollTop + field.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 36;
    scroller.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };
  const timer = window.setTimeout(lift, 300);
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", lift);
  field.addEventListener(
    "blur",
    () => {
      window.clearTimeout(timer);
      viewport?.removeEventListener("resize", lift);
    },
    { once: true },
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
    const timer = window.setTimeout(
      () => el?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" }),
      60,
    );
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
  id: idProp,
  label,
  value,
  min,
  max,
  onChange,
  hint,
  invalid,
  className,
}: {
  id?: string;
  label: string;
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
  hint?: string;
  invalid?: boolean;
  className?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink-700">
        {label}
      </label>
      <div className="relative">
        <CalendarDays aria-hidden className="pointer-events-none absolute left-4 top-1/2 z-[1] size-4 -translate-y-1/2 text-ink-400" />
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
