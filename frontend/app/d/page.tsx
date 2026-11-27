import type { Metadata } from "next";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { DPageTransition } from "@/components/d/brand/DPageTransition";
import { DHome } from "@/components/d/home/DHome";

export const metadata: Metadata = {
  title: "Find a smooth flight",
};

/**
 * /d — version D's landing, v3 (lib/d/landing.ts): the headline, then the
 * search form, three example routes and a sample flight on the first screen.
 * What matters to the visitor is asked on the results page, if they want to.
 * Static; the client parts render once today's date is known. The transition stage stays the first
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
