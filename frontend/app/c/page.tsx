import type { Metadata } from "next";
import { HeroScene } from "@/components/c/common/HeroScene";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { HomeSearch } from "@/components/c/search/HomeSearch";
import { HomeTiles } from "@/components/c/search/HomeTiles";

export const metadata: Metadata = {
  title: "Compare flights",
};

/**
 * /c — version C home: an illustrated hero (a plane climbing through soft
 * clouds, drawn in the palette — a strip on phones, the right half on
 * laptops) with one search form and popular routes, then what the comparison
 * covers, the illustrative-data note and the sign-up card. Static; the form
 * renders on the client once today's date is known.
 */
export default function CHomePage() {
  return (
    <>
      <section aria-labelledby="c-home-title" className="relative overflow-hidden rounded-3xl bg-night-900 text-white shadow-lift">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#10243a_0%,#15314b_58%,#1a4150_100%)]"
        />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-64 rounded-full bg-breeze-400/10 blur-3xl" />
        {/* The scene: a strip across the top on phones; the top-right of the hero on laptops, behind the heading. */}
        <div aria-hidden className="pointer-events-none relative h-36 sm:h-44 lg:absolute lg:right-0 lg:top-0 lg:h-[21rem] lg:w-[46%]">
          <HeroScene />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-10 bg-[linear-gradient(to_bottom,transparent,#13304a)] lg:hidden" />
        </div>

        <div className="relative px-4 pb-5 pt-3 sm:px-6 sm:pt-4 lg:px-8 lg:pb-8 lg:pt-11">
          <div className="lg:max-w-[54%]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-calm-200">Nonstop · one way · economy</p>
            <h1 id="c-home-title" className="mt-2 max-w-[22ch] text-balance text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[34px] lg:text-[40px]">
              Compare flights side by side
            </h1>
            <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-white/75">
              Pick a route and a day to see every nonstop flight with its time and fare, the aircraft, the airline and who
              flies it — and, as the date gets closer, its turbulence and weather forecasts.
            </p>
          </div>
          <div className="mt-6">
            <HomeSearch />
          </div>
        </div>
      </section>

      <HomeTiles />

      <InterestCard placement="c_home" context="" className="mt-8" />
    </>
  );
}
