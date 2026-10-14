"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { addDays, formatShortDate } from "@preflight/shared/dates";
import { FORECAST_HORIZON_DAYS } from "@preflight/shared/forecast";
import type { Flight, SectionContext, SectionProps } from "@preflight/shared/types";
import { useTracker } from "@/lib/tracking";
import { Reveal } from "./env/Reveal";
import { SwitchRow } from "./env/Switch";

type OptionId = "turbulence" | "weather" | "gate_time";

interface AlertOption {
  id: OptionId;
  label: string;
  describe: (flight: Flight) => string;
}

const OPTIONS: readonly AlertOption[] = [
  {
    id: "turbulence",
    label: "Turbulence forecast",
    describe: () => "Your smoothness score or the timing of bumps",
  },
  {
    id: "weather",
    label: "Weather",
    describe: (f) =>
      f.origin.city === f.destination.city
        ? "Conditions at either airport"
        : `Conditions in ${f.origin.city} or ${f.destination.city}`,
  },
  {
    id: "gate_time",
    label: "Gate & time changes",
    describe: () => "Departure time, gate or terminal",
  },
];

const ALL_ON: Record<OptionId, boolean> = { turbulence: true, weather: true, gate_time: true };

/**
 * "Notify me if the forecast changes". Deliberately non-functional: the only
 * thing a tap does is get recorded by the tracker, so the study can see
 * whether participants reach for control.
 */
export function AlertsSection({ flight, ctx }: SectionProps) {
  const tracker = useTracker();
  // Start from the tracker so a reload mid-dashboard keeps the switch where the participant left it.
  const [on, setOn] = useState(() => tracker?.alertState().finalOn ?? false);
  const [options, setOptions] = useState<Record<OptionId, boolean>>(ALL_ON);

  const toggleMain = (next: boolean) => {
    setOn(next);
    tracker?.alertToggled(next);
  };

  const toggleOption = (id: OptionId, next: boolean) => {
    setOptions({ ...options, [id]: next });
    tracker?.event("alert_option", "alerts", `${id}:${next ? "on" : "off"}`);
  };

  return (
    <div>
      <SwitchRow
        size="md"
        checked={on}
        onChange={toggleMain}
        label="Notify me if the forecast changes"
        description="Only when something meaningful changes — no daily noise."
        className="rounded-2xl bg-canvas/70 px-4 py-3 ring-1 ring-inset ring-line/70"
      />

      <Reveal open={on}>
        <div className="pt-3">
          <div className="rounded-2xl bg-calm-50/60 p-4 ring-1 ring-inset ring-calm-100">
            <div className="flex items-start gap-2.5">
              <span
                aria-hidden
                className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-calm-500 text-white"
              >
                <Check className="size-3" strokeWidth={3} />
              </span>
              <p className="text-sm leading-snug text-ink-700">
                You&apos;ll get a heads-up if your turbulence forecast, weather or departure time changes.
              </p>
            </div>
            <div className="mt-3 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">Tell me about</div>
            <ul className="divide-y divide-calm-100">
              {OPTIONS.map((option) => (
                <li key={option.id}>
                  <SwitchRow
                    size="sm"
                    checked={options[option.id]}
                    onChange={(next) => toggleOption(option.id, next)}
                    label={option.label}
                    description={option.describe(flight)}
                    className="py-2"
                  />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>

      <div className="mt-3 flex flex-col gap-1.5 px-1 text-xs leading-snug text-ink-500">
        <p>{horizonNote(flight, ctx)}</p>
        <p>
          A meaningful change means your smoothness score moves by 5 points or more, a bumpy stretch appears or clears,
          or your departure time or gate changes.
        </p>
        <p>Noted here for you &mdash; nothing is sent during this study.</p>
      </div>
    </div>
  );
}

/** "Get a heads-up if your forecast changes" */
export function alertsTeaser(flight: Flight, ctx: SectionContext): string {
  void flight;
  void ctx;
  return "Get a heads-up if your forecast changes";
}

// ── Copy ────────────────────────────────────────────────────────────────────

function horizonNote(flight: Flight, ctx: SectionContext): string {
  if (ctx.daysUntil > FORECAST_HORIZON_DAYS) {
    const around = safeShortDate(addDays(flight.input.date, -FORECAST_HORIZON_DAYS));
    return `Detailed forecasts start about ${FORECAST_HORIZON_DAYS} days before departure${
      around ? ` — around ${around} for this flight` : ""
    }. Until then, you'd only hear about changes to the seasonal outlook.`;
  }
  if (ctx.daysUntil > 2) return "Your forecast updates every 6 hours until departure.";
  return "Your forecast updates every hour until departure.";
}

/** The date helpers throw on malformed input; a generated flight's date is valid, but never crash a section over it. */
function safeShortDate(iso: string): string | null {
  try {
    return formatShortDate(iso);
  } catch {
    return null;
  }
}
