import type { Metadata } from "next";
import { Suspense } from "react";
import { FlightSkeleton } from "@/components/c/flight/FlightSkeleton";
import { DFlightPage } from "@/components/d/flight/DFlightPage";

export const metadata: Metadata = {
  title: "Flight details",
  description: "One flight in full, with what to expect in plain words and the detail one tap away.",
};

/**
 * /d/flight?from=JFK&to=LAX&date=2026-11-26&f=DL1423 (version D). A static
 * shell: the client reads the query string inside this Suspense boundary and
 * shows version D's detail — reassurance first, the ratings in the visitor's
 * order, "I'd pick this flight" (docs/ITERATION_2.md).
 */
export default function Page() {
  return (
    <Suspense fallback={<FlightSkeleton showScore={false} />}>
      <DFlightPage />
    </Suspense>
  );
}
