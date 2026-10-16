"use client";

import { Armchair, Check, Coffee, MessageSquare, Plug, Sandwich, Sparkles, Star, Tv, Utensils, Wifi } from "lucide-react";
import type { ReactNode } from "react";
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";
import { Pill } from "@/components/ui/Pill";
import { Stat } from "@/components/ui/Stat";
import { BlockLabel } from "./trust/BlockLabel";
import { cabinNoiseBand, possessive } from "./trust/format";
import { MeterBar } from "./trust/MeterBar";
import { Ring } from "./trust/Ring";

/** Picks a small icon for an amenity line by keyword; falls back to a check. */
function amenityIcon(text: string): ReactNode {
  const t = text.toLowerCase();
  const cls = "size-3.5";
  if (/wi-?fi/.test(t)) return <Wifi aria-hidden className={cls} />;
  if (/screen|entertainment|streaming|channel/.test(t)) return <Tv aria-hidden className={cls} />;
  if (/power|usb|charg/.test(t)) return <Plug aria-hidden className={cls} />;
  if (/messag/.test(t)) return <MessageSquare aria-hidden className={cls} />;
  if (/legroom|seat/.test(t)) return <Armchair aria-hidden className={cls} />;
  if (/meal/.test(t)) return <Utensils aria-hidden className={cls} />;
  if (/coffee|tea|drink/.test(t)) return <Coffee aria-hidden className={cls} />;
  if (/snack/.test(t)) return <Sandwich aria-hidden className={cls} />;
  if (/chocolate|cabin|design/.test(t)) return <Sparkles aria-hidden className={cls} />;
  return <Check aria-hidden className={cls} />;
}

/** "regulator oversight (FAA)"; a generic regulator name reads as is. */
function oversightLabel(regulator: string): string {
  const name = regulator.trim();
  if (!name || /^the /i.test(name)) return `oversight by ${name || "the national aviation authority"}`;
  return `regulator oversight (${name})`;
}

/**
 * "Airline safety & comfort" — safety score hero with its basis, on-time meters
 * (last 12 months), comfort facts and amenities. Every figure is airline- or
 * model-level data that exists any time before the flight.
 */
export function AirlineSection({ flight }: SectionProps) {
  const stats = flight.airlineStats;
  const routeLabel = `${flight.origin.code} → ${flight.destination.code}`;
  const noise = cabinNoiseBand(stats.cabinNoiseDb);

  return (
    <div className="flex flex-col gap-4">
      {/* Safety score hero */}
      <div className="rounded-2xl bg-calm-50/70 p-4 ring-1 ring-inset ring-calm-100">
        <div className="flex items-center gap-4">
          <Ring value={stats.safetyScore} size={112} label={`Safety score ${stats.safetyScore} out of 100`}>
            <span className="text-[38px] font-bold leading-none text-ink-900 tabular-nums">{stats.safetyScore}</span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">of 100</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Safety score</div>
            <div className="mt-1 text-base font-bold leading-snug text-ink-900">{stats.safetyLabel}</div>
            <div className="mt-1 text-sm leading-snug text-ink-700">{flight.airline.name}</div>
          </div>
        </div>
        <p className="mt-3 text-xs leading-snug text-ink-500">
          Our index for the airline, based on its IOSA safety-audit status, {oversightLabel(flight.crew.regulator)},
          accident record and fleet age.
        </p>
      </div>

      {/* On-time arrivals */}
      <div>
        <BlockLabel>On-time arrivals</BlockLabel>
        <div className="mt-2 flex flex-col gap-3 rounded-2xl bg-canvas/70 p-4 ring-1 ring-inset ring-line/70">
          <MeterBar label="Across the airline · last 12 months" value={stats.onTimePct} />
          <MeterBar label={`On this route · ${routeLabel} · last 12 months`} value={stats.onTimeRoutePct} />
          <p className="text-xs leading-snug text-ink-500">
            Share of flights arriving within 15 minutes of schedule over the last 12 months.
          </p>
        </div>
      </div>

      {/* Comfort */}
      <div>
        <BlockLabel>Comfort</BlockLabel>
        <div className="mt-2 rounded-2xl bg-canvas/70 p-4 ring-1 ring-inset ring-line/70">
          <MeterBar
            label="Comfort score"
            value={stats.comfortScore * 10}
            display={`${stats.comfortScore.toFixed(1)} / 10`}
            hint={`Our index from legroom, seat width, cabin noise and amenities on ${possessive(flight.airline.name)} ${flight.aircraft.model}.`}
            tone="calm"
          />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="Legroom" value={`${stats.seatPitchIn} in`} hint="Seat pitch in economy" />
          <Stat label="Seat width" value={`${stats.seatWidthIn} in`} hint="Economy seats" />
          <Stat label="Cabin noise" value={noise.label} hint={`Typical for the ${flight.aircraft.model}`} />
          <Stat
            label="Cabin crew"
            value={
              <span className="inline-flex items-center gap-1">
                <Star aria-hidden className="size-4 fill-sand-400 text-sand-400" />
                {stats.crewRating.toFixed(1)}
              </span>
            }
            hint="Airline average from passenger reviews"
          />
        </div>
      </div>

      {/* Amenities */}
      {stats.amenities.length > 0 ? (
        <div>
          <BlockLabel>On board</BlockLabel>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stats.amenities.map((amenity) => (
              <Pill key={amenity} icon={amenityIcon(amenity)} className="max-w-full">
                <span className="min-w-0 truncate">{amenity}</span>
              </Pill>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** "Safety 97/100 · 86% on time, last 12 months" */
export function airlineTeaser(flight: Flight, ctx: SectionContext): string {
  void ctx;
  const stats = flight.airlineStats;
  return `Safety ${stats.safetyScore}/100 · ${stats.onTimePct}% on time, last 12 months`;
}
