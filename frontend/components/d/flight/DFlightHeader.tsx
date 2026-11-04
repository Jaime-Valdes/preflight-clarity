import { CalendarDays, Clock3 } from "lucide-react";
import type { ReactNode } from "react";
import { countdownLabel, formatDuration, formatLongDate, formatTime12 } from "@preflight/shared/dates";
import { displayAircraftName } from "@preflight/shared/aircraft";
import { availabilityFor } from "@preflight/shared/forecast";
import type { Flight } from "@preflight/shared/types";
import { dayOffsetWords } from "@/components/c/flight/copy";
import { PaperPlane } from "@/components/d/brand/FlightPath";
import { cn } from "@/lib/cn";

/*
 * Version D's flight header (docs/ui-d-theme.md): the same facts as the
 * dashboard's boarding-pass header — airline and flight number, the route in
 * big codes, date and countdown, times, aircraft, gate or terminal — on a
 * white card, with the ink flight path drawing itself between the two codes.
 * Shows only what is knowable this many days before departure.
 */

interface DFlightHeaderProps {
  flight: Flight;
  /** Whole calendar days from today to departure (0 = today). */
  daysUntil: number;
  className?: string;
}

/** The short path between the codes: one gentle curve, left to right, with the plane resting at its end. */
const PATH = "M4 40C70 4 150 52 236 12";
const END = { x: 236, y: 12, angle: -22 };

function dayOffsetLabel(offset: number): string | null {
  if (offset === 0) return null;
  return offset > 0 ? `+${offset}` : `−${Math.abs(offset)}`;
}

/** "44 days until this flight" — never "your flight": nothing here is the visitor's own trip. */
function countdown(daysUntil: number): string {
  return countdownLabel(daysUntil).replace("Your flight", "This flight").replace("your flight", "this flight");
}

function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute", className)}>{children}</p>;
}

function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-canvas px-2.5 py-1 text-[12px] font-bold text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DFlightHeader({ flight, daysUntil, className }: DFlightHeaderProps) {
  const { origin, destination, aircraft } = flight;
  const offset = dayOffsetLabel(flight.arriveDayOffset);
  const known = availabilityFor(daysUntil);

  return (
    <section aria-label="Flight details" className={cn("rounded-[24px] bg-surface p-5 shadow-soft sm:p-6", className)}>
      {/* Airline + flight number */}
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">Flight details</span>
          <span className="block text-[17px] font-extrabold leading-snug tracking-tight text-ink [overflow-wrap:anywhere]">{flight.airline.name}</span>
          <span className="mt-0.5 block text-[13px] font-normal text-ink-mute tabular-nums">Flight {flight.flightNumber}</span>
          <span className="sr-only">
            , {origin.code} to {destination.code}
          </span>
        </h1>
        <Chip className="mt-0.5">Nonstop</Chip>
      </div>

      {/* Route: the codes, with the path between them. */}
      <div className="mt-5 grid grid-cols-[auto_minmax(3rem,1fr)_auto] items-center gap-3 sm:gap-5">
        <span className="text-[36px] font-extrabold leading-none tracking-[-0.03em] text-ink sm:text-[44px]">{origin.code}</span>
        <svg viewBox="0 0 240 56" aria-hidden className="block h-auto w-full overflow-visible">
          <path
            d={PATH}
            pathLength={1}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="1"
            className="animate-d-draw"
          />
          <g transform={`translate(${END.x} ${END.y}) rotate(${END.angle})`}>
            <PaperPlane />
          </g>
        </svg>
        <span className="text-right text-[36px] font-extrabold leading-none tracking-[-0.03em] text-ink sm:text-[44px]">{destination.code}</span>
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-4 text-[13px] text-ink-mute">
        <span className="min-w-0 truncate">{origin.city}</span>
        <span className="min-w-0 truncate text-right">{destination.city}</span>
      </div>

      {/* Countdown + date */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Chip className="bg-leaf-100 text-leaf-ink">
          <Clock3 aria-hidden className="size-3.5" />
          {countdown(daysUntil)}
        </Chip>
        <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] text-ink-soft">
          <CalendarDays aria-hidden className="size-3.5 shrink-0 text-ink-mute" />
          <span className="truncate">{formatLongDate(flight.input.date)}</span>
        </span>
      </div>

      <div aria-hidden className="mt-5 border-t-2 border-dashed border-slate/60" />

      {/* Times, aircraft, gate */}
      <div className="mt-4 grid grid-cols-[auto_1fr_auto] items-end gap-3">
        <div>
          <Eyebrow>Departs</Eyebrow>
          <p className="mt-1 whitespace-nowrap text-[20px] font-extrabold leading-none text-ink tabular-nums">{formatTime12(flight.departTime)}</p>
          <p className="mt-1 text-[12px] text-ink-mute">{origin.code}</p>
        </div>
        <div className="min-w-0 text-center">
          <Eyebrow>Duration</Eyebrow>
          <p className="mt-1 whitespace-nowrap text-[15px] font-bold leading-[20px] text-ink tabular-nums">{formatDuration(flight.blockMin)}</p>
          <p className="mt-1 whitespace-nowrap text-[12px] text-ink-mute tabular-nums">{flight.distanceMi.toLocaleString("en-US")} mi</p>
        </div>
        <div className="text-right">
          <Eyebrow>Arrives</Eyebrow>
          <p className="mt-1 whitespace-nowrap text-[20px] font-extrabold leading-none text-ink tabular-nums">
            {formatTime12(flight.arriveTime)}
            {offset ? (
              <>
                <sup aria-hidden className="ml-0.5 text-[11px] font-bold text-ink-mute">
                  {offset}
                </sup>
                <span className="sr-only"> ({dayOffsetWords(flight.arriveDayOffset)})</span>
              </>
            ) : null}
          </p>
          <p className="mt-1 text-[12px] text-ink-mute">{destination.code}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="min-w-0">
          <Eyebrow>{known.airframe ? "Aircraft" : "Scheduled aircraft"}</Eyebrow>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-[15px] font-bold leading-snug text-ink">{displayAircraftName(aircraft)}</p>
            <Chip>{aircraft.bodyType === "wide" ? "Wide-body" : "Narrow-body"}</Chip>
          </div>
        </div>
        {known.gate ? (
          <div className="text-right">
            <Eyebrow>Gate</Eyebrow>
            <p className="mt-1 text-[15px] font-bold leading-snug text-ink tabular-nums">{flight.gate}</p>
            <p className="text-[12px] text-ink-mute">Terminal {flight.terminal} · can change</p>
          </div>
        ) : (
          <div className="text-right">
            <Eyebrow>Terminal</Eyebrow>
            <p className="mt-1 text-[15px] font-bold leading-snug text-ink tabular-nums">{flight.terminal}</p>
            <p className="whitespace-nowrap text-[12px] text-ink-mute">Gate posted on the day</p>
          </div>
        )}
      </div>
    </section>
  );
}
