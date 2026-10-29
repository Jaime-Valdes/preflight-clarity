import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchResults } from "@/components/c/search/SearchResults";
import { ResultsSkeleton } from "@/components/c/search/Skeletons";

export const metadata: Metadata = {
  title: "Flight results",
};

/**
 * /d/search?from=JFK&to=LAX&date=2026-11-26 — one route and day in version D.
 * A static shell: the client reads the query string inside this Suspense
 * boundary and generates the day's flights.
 */
export default function DSearchPage() {
  return (
    <Suspense fallback={<ResultsSkeleton />}>
      <SearchResults />
    </Suspense>
  );
}
