"use client";

import { Award, ChevronDown, Star } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import type { Pilot } from "@preflight/shared/types";
import { cn } from "@/lib/cn";
import { Pill } from "@/components/ui/Pill";
import { Reveal } from "./Reveal";
import { formatCount } from "./format";

interface PilotCardProps {
  pilot: Pilot;
  /** Short model name for the "hours on type" tile, e.g. "A321neo". */
  aircraftModel: string;
  /** "JFK → LAX" */
  routeLabel: string;
  /** Called after every tap with the new open state. */
  onToggle?: (open: boolean) => void;
}

/**
 * Uber-style pilot card. The whole visible card is one button: tapping it
 * reveals the pilot's background and the compliments passengers leave.
 */
export function PilotCard({ pilot, aircraftModel, routeLabel, onToggle }: PilotCardProps) {
  const [open, setOpen] = useState(false);
  const detailsId = useId();

  function toggle() {
    const next = !open;
    setOpen(next);
    onToggle?.(next);
  }

  return (
    <div className="rounded-2xl bg-canvas/70 ring-1 ring-inset ring-line/70">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={toggle}
        className="w-full rounded-2xl p-3.5 text-left transition-colors active:bg-line/30"
      >
        <span className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-breeze-100 via-dusk-100 to-dusk-200 text-base font-bold tracking-wide text-dusk-700 ring-1 ring-inset ring-dusk-200/70"
          >
            {pilot.initials}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-snug text-ink-900 [overflow-wrap:anywhere]">
              {pilot.name}
            </span>
            <span className="mt-0.5 block text-xs leading-snug text-ink-500">
              {pilot.role} · {pilot.base}
            </span>
          </span>
        </span>

        <span className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          <Star aria-hidden className="size-4 fill-sand-400 text-sand-400" />
          <span className="font-bold text-ink-900 tabular-nums">{pilot.rating.toFixed(1)}</span>
          <span className="text-ink-500">from {formatCount(pilot.ratingCount)} passenger ratings</span>
        </span>

        <span className="mt-3 grid grid-cols-2 gap-2">
          <Tile label="Flight hours" value={formatCount(pilot.totalHours)} hint="in total" />
          <Tile label="This aircraft" value={formatCount(pilot.hoursOnType)} hint={`hours on the ${aircraftModel}`} />
          <Tile label="Years flying" value={formatCount(pilot.yearsFlying)} hint="as a pilot" />
          <Tile label="This route" value={formatCount(pilot.timesOnRoute)} hint={`flights ${routeLabel}`} />
        </span>

        <span className="mt-3 flex items-center justify-between gap-2 text-xs font-semibold text-dusk-700">
          <span>{open ? "Hide details" : "Background and passenger notes"}</span>
          <ChevronDown
            aria-hidden
            className={cn("size-4 shrink-0 transition-transform duration-300", open && "rotate-180")}
          />
        </span>
      </button>

      <Reveal open={open} id={detailsId}>
        <div className="px-3.5 pb-3.5">
          <div className="rounded-xl bg-surface p-3 ring-1 ring-inset ring-line/70">
            <div className="flex items-start gap-2.5">
              <Award aria-hidden className="mt-0.5 size-4 shrink-0 text-dusk-500" />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Background</div>
                <div className="mt-0.5 text-sm leading-snug text-ink-700">{pilot.background}</div>
              </div>
            </div>
            {pilot.badges.length > 0 ? (
              <div className="mt-3 flex items-start gap-2.5">
                <Star aria-hidden className="mt-0.5 size-4 shrink-0 text-dusk-500" />
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Passengers mention</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {pilot.badges.map((badge) => (
                      <Pill key={badge} tone="dusk">
                        {badge}
                      </Pill>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </Reveal>
    </div>
  );
}

/** Stat tile built from spans so it can live inside the card's button. */
function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <span className="block min-w-0 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-inset ring-line/70">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      <span className="mt-0.5 block text-lg font-bold leading-tight text-ink-900 tabular-nums">{value}</span>
      {hint ? <span className="mt-0.5 block text-xs leading-snug text-ink-500">{hint}</span> : null}
    </span>
  );
}
