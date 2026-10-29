import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareSkeleton } from "@/components/c/compare/CompareSkeleton";
import { DComparePage } from "@/components/d/compare/DComparePage";

export const metadata: Metadata = {
  title: "Flight comparison",
  description: "Two or three flights side by side, rated in plain words for what matters to you.",
};

/**
 * /d/compare?f=JFK.LAX.2026-11-26.DL1423,… (version D). A static shell: the
 * client reads the query string (or the compare list) inside this Suspense
 * boundary and shows version D's table — the ratings in the visitor's order,
 * no score, "I'd pick this flight" per column (docs/ITERATION_2.md).
 */
export default function Page() {
  return (
    <Suspense fallback={<CompareSkeleton showScore={false} />}>
      <DComparePage />
    </Suspense>
  );
}
