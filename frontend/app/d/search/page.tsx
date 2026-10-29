import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultsSkeleton } from "@/components/c/search/Skeletons";
import { DResults } from "@/components/d/search/DResults";

export const metadata: Metadata = {
  title: "Flight results",
};

/**
 * /d/search?from=JFK&to=LAX&date=2026-11-26[&sort=foryou|cheapest|fastest|departure][&dep_from=0600&dep_to=1030&max_price=250&airline=…&wide=1]
 * — one route and day in version D, rated for what matters to the visitor.
 * A static shell: the client reads the query string inside this Suspense
 * boundary and generates the day's flights. Other parameters in the link
 * (utm_* tags) are ignored, never an error.
 */
export default function DSearchPage() {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <DResults />
    </Suspense>
  );
}
