import { CalendarDays, Clock3, Plane } from "lucide-react";
import type { ReactNode } from "react";
import { countdownLabel, formatDuration, formatLongDate, formatTime12 } from "@preflight/shared/dates";
import type { Flight } from "@preflight/shared/types";
import { cn } from "@/lib/cn";

interface DashboardHeaderProps {
  flight: Flight;
  /** Whole calendar days from today to departure (0 = today). */
  daysUntil: number;
  className?: string;
}

/** "+1" / "−1" when the arrival falls on another calendar day; null otherwise. */
function dayOffsetLabel(offset: number): string | null {
  if (offset === 0) return null;
  return offset > 0 ? `+${offset}` : `−${Math.abs(offset)}`;
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
 */
export function DashboardHeader({ flight, daysUntil, className }: DashboardHeaderProps) {
  const { origin, destination, aircraft } = flight;
  const offset = dayOffsetLabel(flight.arriveDayOffset);

  return (
    <section
      aria-label="Your flight"
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
            {countdownLabel(daysUntil)}
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
            <Eyebrow>Aircraft</Eyebrow>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold leading-snug">{aircraft.fullName}</p>
              <Chip>{aircraft.bodyType === "wide" ? "Wide-body" : "Narrow-body"}</Chip>
            </div>
          </div>
          <div className="text-right">
            <Eyebrow>Gate</Eyebrow>
            <p className="mt-1 text-sm font-semibold leading-snug tabular-nums">{flight.gate}</p>
            <p className="text-xs text-white/60">Terminal {flight.terminal}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
