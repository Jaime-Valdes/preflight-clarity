import type { Metadata } from "next";
import { Suspense } from "react";
import { DPageTransition } from "@/components/d/brand/DPageTransition";
import { DLoading } from "@/components/d/brand/Loading";
import { DFlightPage } from "@/components/d/flight/DFlightPage";

export const metadata: Metadata = {
  title: "Flight details",
  description: "One flight in full, with what to expect in plain words and the detail one tap away.",
};

/**
 * /d/flight?from=JFK&to=LAX&date=2026-11-26&f=DL1423 (version D). A static
 * shell: the client reads the query string inside this Suspense boundary and
 * shows version D's detail — reassurance first, the ratings in the visitor's
 * order, "I'd pick this flight" (docs/ITERATION_2.md). The transition stage
 * stays the first child of the fragment, outside the Suspense boundary:
 * anywhere else the plane never flies, or flies again when the content is
 * revealed.
 */
export default function Page() {
  return (
    <>
      <DPageTransition />
      <Suspense fallback={<DLoading />}>
        <DFlightPage />
      </Suspense>
    </>
  );
}
