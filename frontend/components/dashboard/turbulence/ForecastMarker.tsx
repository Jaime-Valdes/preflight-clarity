import { CalendarClock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TURBULENCE_LEAD, turbulenceForecastFrom } from "./format";

interface ForecastMarkerProps {
  /** Departure date ("YYYY-MM-DD"). */
  date: string;
  /** What becomes available: "Turbulence forecast", "Smoothness score"… */
  subject?: string;
  /** A quiet line under the marker. */
  children?: ReactNode;
  className?: string;
}

/**
 * Calm marker for a flight-specific item that doesn't exist yet at this
 * distance from departure: "Turbulence forecast from Tue, Nov 24 · 2 days
 * before departure". Never a made-up value (docs/FEASIBILITY.md).
 */
export function ForecastMarker({ date, subject = "Turbulence forecast", children, className }: ForecastMarkerProps) {
  return (
    <div className={cn("rounded-2xl bg-breeze-50/70 p-3.5 ring-1 ring-inset ring-breeze-100", className)}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-breeze-600 ring-1 ring-inset ring-breeze-100"
        >
          <CalendarClock className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold leading-snug text-ink-900">
            {subject} from <span className="whitespace-nowrap">{turbulenceForecastFrom(date)}</span>
          </p>
          <p className="mt-0.5 text-xs leading-snug text-ink-500">{TURBULENCE_LEAD}</p>
        </div>
      </div>
      {children ? <div className="mt-2.5 text-xs leading-snug text-ink-500">{children}</div> : null}
    </div>
  );
}
