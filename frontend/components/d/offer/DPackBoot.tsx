"use client";

import { useEffect } from "react";
import { captureUtms, dSessionId } from "@/lib/d/flightDayPack";
import { currentArm } from "@/lib/d/priceArm";

/**
 * Version D's Flight Day Pack test (docs/FLIGHT_DAY_PACK.md), from the /d layout: on the first D page
 * this browser runs, draw the price arm (or take ?arm= for this tab; lib/analytics.ts also draws it
 * for D's first event if PostHog starts first), start D's session id and keep the session's
 * first-touch campaign tags. Renders nothing; runs once per layout mount.
 */
export function DPackBoot() {
  useEffect(() => {
    currentArm();
    dSessionId();
    captureUtms();
  }, []);
  return null;
}
