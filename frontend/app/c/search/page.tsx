import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchResults } from "@/components/c/search/SearchResults";
import { ResultsSkeleton } from "@/components/c/search/Skeletons";

export const metadata: Metadata = {
  title: "Flight results",
};

/**
 * /c/search?from=JFK&to=LAX&date=2026-11-26[&sort=…][&time=…&airline=…&wide=1&min=85]
 * — one route and day. A static shell: the client reads the query string
 * (inside this Suspense boundary) and generates the day's flights.
 */
export default function CSearchPage() {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <SearchResults />
    </Suspense>
  );
}
