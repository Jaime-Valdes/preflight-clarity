"use client";

import { FlightPage } from "@/components/c/flight/FlightPage";
import { DFlightDetail } from "./DFlightDetail";

/**
 * /d/flight: version C's page (query handling, the departed, date and
 * not-found states) showing version D's detail — reassurance first, the
 * ratings in the visitor's order, "I'd pick this flight", no score anywhere
 * (docs/ITERATION_2.md). A client component, so the page shell can pass the
 * detail component through.
 */
export function DFlightPage() {
  return <FlightPage Detail={DFlightDetail} showScores={false} />;
}
