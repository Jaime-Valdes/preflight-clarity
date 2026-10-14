"use client";

import { Check, Plane } from "lucide-react";
import { useEffect, useState } from "react";
import { Screen } from "@/components/ui/Screen";
import { cn } from "@/lib/cn";
import { ProgressBar } from "./StepHeader";

export const PREPARING_LINES = [
  "Checking turbulence forecasts…",
  "Looking at route history…",
  "Putting your briefing together…",
] as const;

const DURATION_MS = 1800;

interface PreparingFlightProps {
  /** Called once, about 1.8 s after mount. */
  onReady: () => void;
}

/** Brief interstitial between flight setup and the dashboard. Identical for both variants. */
export function PreparingFlight({ onReady }: PreparingFlightProps) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const stepMs = DURATION_MS / PREPARING_LINES.length;
    const timers = PREPARING_LINES.map((_, i) => window.setTimeout(() => setShown(i + 1), i * stepMs + 120));
    const done = window.setTimeout(onReady, DURATION_MS);
    return () => {
      for (const t of timers) window.clearTimeout(t);
      window.clearTimeout(done);
    };
  }, [onReady]);

  return (
    <Screen>
      <ProgressBar stage={2} />
      <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center" role="status" aria-live="polite">
        <div className="relative flex size-28 items-center justify-center">
          <span aria-hidden className="absolute inset-0 rounded-full bg-calm-100 animate-breathe" />
          <span aria-hidden className="absolute inset-4 rounded-full bg-calm-200/70 animate-breathe [animation-delay:-2s]" />
          <span
            aria-hidden
            className="relative flex size-14 items-center justify-center rounded-full bg-surface text-night-900 shadow-soft ring-1 ring-line/80"
          >
            <Plane className="size-6" />
          </span>
        </div>
        <h1 tabIndex={-1} className="mt-8 text-[22px] font-bold leading-tight text-ink-900 outline-none">
          Preparing your briefing
        </h1>
        <ul className="mt-5 flex flex-col gap-2 text-[15px] text-ink-500">
          {PREPARING_LINES.map((line, i) => {
            const visible = i < shown;
            return (
              <li
                key={line}
                className={cn(
                  "flex items-center justify-center gap-2 transition-opacity duration-500",
                  visible ? "opacity-100" : "opacity-0",
                )}
              >
                <Check aria-hidden className="size-4 text-calm-600" />
                <span>{line}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Screen>
  );
}
