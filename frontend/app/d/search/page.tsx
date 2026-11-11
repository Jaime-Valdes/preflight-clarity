import type { Metadata } from "next";
import { Suspense } from "react";
import { DPageTransition } from "@/components/d/brand/DPageTransition";
import { DLoading } from "@/components/d/brand/Loading";
import { DResults } from "@/components/d/search/DResults";

export const metadata: Metadata = {
  title: "Flight results",
};

/**
 * /d/search?from=JFK&to=LAX&date=2026-11-26[&sort=foryou|cheapest|fastest|departure][&dep_from=0600&dep_to=1030&max_price=250&airline=…&wide=1]
 * — one route and day in version D, rated for what matters to the visitor.
 * A static shell: the client reads the query string inside this Suspense
 * boundary and generates the day's flights. Other parameters in the link
 * (utm_* tags) are ignored, never an error. The transition stage stays the
 * first child of the fragment, outside the Suspense boundary: anywhere else
 * the plane never flies, or flies again when the content is revealed.
 */
export default function DSearchPage() {
  return (
    <>
      <DPageTransition />
      <Suspense fallback={<DLoading />}>
        <DResults />
      </Suspense>
    </>
  );
}
