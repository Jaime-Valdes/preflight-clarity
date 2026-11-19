"use client";

import { useEffect } from "react";
import { stampDEvents } from "@/lib/analytics";
import { captureUtms, dSessionId } from "@/lib/d/flightDayPack";
import { armProps, currentArm } from "@/lib/d/priceArm";

/**
 * Version D's Flight Day Pack test (docs/FLIGHT_DAY_PACK.md), from the /d layout: on the first D page
 * this browser runs, draw the price arm (or take ?arm= for this tab), have every /d event carry it
 * (lib/analytics.ts; this effect runs before the root layout starts PostHog), start D's session id
 * and keep the session's first-touch campaign tags. Renders nothing; runs once per layout mount.
 */
export function DPackBoot() {
  useEffect(() => {
    stampDEvents(armProps);
    currentArm();
    dSessionId();
    captureUtms();
  }, []);
  return null;
}
