import type { Metadata } from "next";
import { Suspense } from "react";
import { FlightPage } from "@/components/c/flight/FlightPage";
import { FlightSkeleton } from "@/components/c/flight/FlightSkeleton";

export const metadata: Metadata = {
  title: "Flight details",
  description: "One flight in full, with what to expect in plain words and the detail one tap away.",
};

/**
 * /d/flight?from=JFK&to=LAX&date=2026-11-26&f=DL1423 (version D). A static
 * shell: the client reads the query string inside this Suspense boundary.
 */
export default function Page() {
  return (
    <Suspense fallback={<FlightSkeleton />}>
      <FlightPage />
    </Suspense>
  );
}
