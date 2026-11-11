import type { Metadata } from "next";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { DPageTransition } from "@/components/d/brand/DPageTransition";
import { DHome } from "@/components/d/home/DHome";

export const metadata: Metadata = {
  title: "Find a smooth flight",
};

/**
 * /d — version D home (docs/ITERATION_2.md): a short hero, "What matters to
 * you" (the four priorities, tap to order, skippable, remembered per browser),
 * then the search form. Static; the client parts render once the browser's
 * answer and today's date are known. The transition stage stays the first
 * child of the fragment: anywhere else the plane never flies.
 */
export default function DHomePage() {
  return (
    <>
      <DPageTransition />
      <DHome />
      <InterestCard placement="d_home" context="" className="mt-8" />
    </>
  );
}
