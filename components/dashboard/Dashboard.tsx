"use client";
// STUB — owned by the dashboard-core agent, which replaces this whole file.
// The exported names and signatures below are the contract; keep them.
import { useState } from "react";
import { VARIANT_SECTIONS } from "@/lib/sections";
import { DashboardTracker } from "@/lib/tracking";
import type { DashboardMetrics, Flight, Variant } from "@/lib/types";

export interface DashboardProps {
  flight: Flight;
  variant: Variant;
  /** Metrics from before a page reload, so tracking resumes instead of restarting. */
  initialMetrics?: DashboardMetrics | null;
  /** Called with a snapshot when the page is hidden and every ~20 s (for checkpoint saves). */
  onCheckpoint?: (metrics: DashboardMetrics) => void;
  /** Called once when the participant taps "I'm done exploring". */
  onDone: (metrics: DashboardMetrics) => void;
}

export function Dashboard({ flight, variant, initialMetrics, onDone }: DashboardProps) {
  const [tracker] = useState(() => new DashboardTracker(VARIANT_SECTIONS[variant], initialMetrics));
  return (
    <div className="p-5">
      <p>Dashboard placeholder for {flight.flightNumber}</p>
      <button type="button" onClick={() => onDone(tracker.finish())}>
        Done
      </button>
    </div>
  );
}
