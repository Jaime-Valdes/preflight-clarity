import type { Metadata } from "next";
import { Suspense } from "react";
import { DPageTransition } from "@/components/d/brand/DPageTransition";
import { DLoading } from "@/components/d/brand/Loading";
import { DComparePage } from "@/components/d/compare/DComparePage";

export const metadata: Metadata = {
  title: "Flight comparison",
  description: "Two or three flights side by side, rated in plain words for what matters to you.",
};

/**
 * /d/compare?f=JFK.LAX.2026-11-26.DL1423,… (version D). A static shell: the
 * client reads the query string (or the compare list) inside this Suspense
 * boundary and shows version D's table — the ratings in the visitor's order,
 * no score, "I'd pick this flight" per column (docs/ITERATION_2.md). The
 * transition stage stays the first child of the fragment, outside the
 * Suspense boundary: anywhere else the plane never flies, or flies again when
 * the content is revealed.
 */
export default function Page() {
  return (
    <>
      <DPageTransition />
      <Suspense fallback={<DLoading />}>
        <DComparePage />
      </Suspense>
    </>
  );
}
