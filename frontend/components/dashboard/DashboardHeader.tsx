import { CalendarDays, Clock3, Plane } from "lucide-react";
import type { ReactNode } from "react";
import { countdownLabel, formatDuration, formatLongDate, formatTime12 } from "@preflight/shared/dates";
import { availabilityFor } from "@preflight/shared/forecast";
import type { Flight } from "@preflight/shared/types";
import { cn } from "@/lib/cn";

/** The study's eyebrow: the participant gave a route and date, never a flight (docs/FEASIBILITY.md). */
export const EXAMPLE_FLIGHT_LABEL = "An example flight on your route";

export interface DashboardHeaderProps {
  flight: Flight;
  /** Real whole calendar days from today to departure (0 = today). Drives the countdown, which always stays true. */
  daysUntil: number;
  /**
   * Days before departure that the briefing describes — decides what the header may show
   * (`availabilityFor` in shared/src/forecast.ts): the gate number only on the day of travel
   * (`GATE_DAYS`, otherwise the terminal and "Gate posted on the day"), and "Aircraft" rather than
   * "Scheduled aircraft" only once the airframe is assigned (`AIRFRAME_DAYS`).
   * Defaults to `daysUntil` (version C: pass nothing, or the same real days). The study's
   * day-before preview passes `PREVIEW_DAYS_UNTIL` (1).
   */
  briefingDaysUntil?: number;
  /**
   * Eyebrow above the airline. Variant A free exploration: "Your flight" / "Option 2"…;
   * version C: e.g. "Flight details". Any label other than "Your flight" makes the countdown
   * speak of "this flight".
   */
  label?: string;
  /**
   * The study: the flight is an example on the participant's route, so the eyebrow reads
   * "An example flight on your route" where it would otherwise be empty or "Your flight"
   * (an explored "Option n" keeps its label). Default false.
   */
  example?: boolean;
  className?: string;
}

/** "+1" / "−1" when the arrival falls on another calendar day; null otherwise. */
function dayOffsetLabel(offset: number): string | null {
  if (offset === 0) return null;
  return offset > 0 ? `+${offset}` : `−${Math.abs(offset)}`;
}

/** The countdown speaks of "your flight" only for the participant's own flight (an explored option is "this flight"). */
function countdown(daysUntil: number, label: string | undefined): string {
  const text = countdownLabel(daysUntil);
  if (!label || label === "Your flight") return text;
  return text.replace("Your flight", "This flight").replace("your flight", "this flight");
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("text-[10px] font-semibold uppercase tracking-[0.12em] text-white/55", className)}>{children}</p>
  );
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white/[0.12] px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-inset ring-white/15",
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Boarding-pass style header: airline and flight number, the route in big
 * codes, date, countdown, times, aircraft and gate on a deep night gradient.
 * Shows only what is knowable `briefingDaysUntil` days before departure.
 */
export function DashboardHeader({
  flight,
  daysUntil,
  briefingDaysUntil = daysUntil,
  label,
  example = false,
  className,
}: DashboardHeaderProps) {
  const { origin, destination, aircraft } = flight;
  const offset = dayOffsetLabel(flight.arriveDayOffset);
  const known = availabilityFor(briefingDaysUntil);
  const eyebrow = example && (!label || label === "Your flight") ? EXAMPLE_FLIGHT_LABEL : label;

  return (
    <section
      aria-label={eyebrow ?? "Your flight"}
      className={cn("relative overflow-hidden rounded-3xl bg-night-900 text-white shadow-lift", className)}
    >
      {/* Night gradient with a hint of calm. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#10243a_0%,#15314b_58%,#1a4150_100%)]"
      />
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 size-60 rounded-full bg-calm-400/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 -left-12 size-52 rounded-full bg-breeze-400/10 blur-3xl" />

      <div className="relative px-5 pb-4 pt-5">
        {/* Airline + flight number */}
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0">
            {eyebrow ? (
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-calm-200">
                {eyebrow}
              </span>
            ) : null}
            <span className="block text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{flight.airline.name}</span>
            <span className="mt-0.5 block text-xs text-white/60 tabular-nums">Flight {flight.flightNumber}</span>
            <span className="sr-only">
              , {origin.code} to {destination.code}
            </span>
          </h1>
          <Chip className="mt-0.5">
            <Plane aria-hidden className="size-3 rotate-45 text-calm-200" />
            Nonstop
          </Chip>
        </div>

        {/* Route */}
        <div className="mt-5 grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <span className="text-[34px] font-bold leading-none tracking-tight">{origin.code}</span>
          <span aria-hidden className="flex items-center gap-1.5 text-white/70">
            <span className="h-px flex-1 border-t border-dotted border-white/40" />
            <Plane className="size-4 rotate-45 text-white" />
            <span className="h-px flex-1 border-t border-dotted border-white/40" />
          </span>
          <span className="text-right text-[34px] font-bold leading-none tracking-tight">{destination.code}</span>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-4 text-xs text-white/65">
          <span className="min-w-0 truncate">{origin.city}</span>
          <span className="min-w-0 truncate text-right">{destination.city}</span>
        </div>

        {/* Countdown + date */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Chip className="bg-calm-400/20 ring-calm-300/30">
            <Clock3 aria-hidden className="size-3.5 text-calm-200" />
            {countdown(daysUntil, label)}
          </Chip>
          <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-white/80">
            <CalendarDays aria-hidden className="size-3.5 shrink-0 text-white/60" />
            <span className="truncate">{formatLongDate(flight.input.date)}</span>
          </span>
        </div>
      </div>

      {/* Perforation with notches */}
      <div aria-hidden className="relative mx-5">
        <div className="border-t border-dashed border-white/20" />
        <span className="absolute -left-8 top-1/2 size-6 -translate-y-1/2 rounded-full bg-canvas" />
        <span className="absolute -right-8 top-1/2 size-6 -translate-y-1/2 rounded-full bg-canvas" />
      </div>

      {/* Stub: times, aircraft, gate */}
      <div className="relative px-5 pb-5 pt-4">
        <div className="grid grid-cols-[auto_1fr_auto] items-end gap-3">
          <div>
            <Eyebrow>Departs</Eyebrow>
            <p className="mt-1 whitespace-nowrap text-lg font-bold leading-none tabular-nums">
              {formatTime12(flight.departTime)}
            </p>
            <p className="mt-1 text-xs text-white/60">{origin.code}</p>
          </div>
          <div className="min-w-0 text-center">
            <Eyebrow>Duration</Eyebrow>
            <p className="mt-1 whitespace-nowrap text-sm font-semibold leading-none tabular-nums">
              {formatDuration(flight.blockMin)}
            </p>
            <p className="mt-1 whitespace-nowrap text-xs text-white/60 tabular-nums">
              {flight.distanceMi.toLocaleString("en-US")} mi
            </p>
          </div>
          <div className="text-right">
            <Eyebrow>Arrives</Eyebrow>
            <p className="mt-1 whitespace-nowrap text-lg font-bold leading-none tabular-nums">
              {formatTime12(flight.arriveTime)}
              {offset ? (
                <sup className="ml-0.5 text-[11px] font-semibold text-calm-200" title="Lands on another calendar day">
                  {offset}
                </sup>
              ) : null}
            </p>
            <p className="mt-1 text-xs text-white/60">{destination.code}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-[1fr_auto] items-start gap-3">
          <div className="min-w-0">
            <Eyebrow>{known.airframe ? "Aircraft" : "Scheduled aircraft"}</Eyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold leading-snug">{aircraft.fullName}</p>
              <Chip>{aircraft.bodyType === "wide" ? "Wide-body" : "Narrow-body"}</Chip>
            </div>
          </div>
          {known.gate ? (
            <div className="text-right">
              <Eyebrow>Gate</Eyebrow>
              <p className="mt-1 text-sm font-semibold leading-snug tabular-nums">{flight.gate}</p>
              <p className="text-xs text-white/60">Terminal {flight.terminal} · can change</p>
            </div>
          ) : (
            <div className="text-right">
              <Eyebrow>Terminal</Eyebrow>
              <p className="mt-1 text-sm font-semibold leading-snug tabular-nums">{flight.terminal}</p>
              <p className="whitespace-nowrap text-xs text-white/60">Gate posted on the day</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
