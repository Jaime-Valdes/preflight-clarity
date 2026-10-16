import type { Metadata } from "next";
import { Suspense } from "react";
import { ComparePage } from "@/components/c/compare/ComparePage";
import { CompareSkeleton } from "@/components/c/compare/CompareSkeleton";

export const metadata: Metadata = {
  title: "Flight comparison",
  description: "Two or three flights side by side: schedule, aircraft, airline, who flies it, weather, smoothness close to departure and an illustrative fare.",
};

/**
 * /c/compare?f=JFK.LAX.2026-11-26.DL1423,… (version C). A static shell: the
 * client reads the query string (or the compare list) inside this Suspense boundary.
 */
export default function Page() {
  return (
    <Suspense fallback={<CompareSkeleton />}>
      <ComparePage />
    </Suspense>
  );
}
