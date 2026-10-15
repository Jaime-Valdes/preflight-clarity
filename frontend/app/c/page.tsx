import type { Metadata } from "next";
import { HomeSearch } from "@/components/c/search/HomeSearch";
import { HomeTiles } from "@/components/c/search/HomeTiles";

export const metadata: Metadata = {
  title: "Compare flights",
};

/**
 * /c — version C home: one search form, popular routes, what the comparison
 * covers, and the illustrative-data note. Static; the form renders on the
 * client once today's date is known.
 */
export default function CHomePage() {
  return (
    <>
      <section
        aria-labelledby="c-home-title"
        className="relative overflow-hidden rounded-3xl bg-night-900 px-4 pb-5 pt-7 text-white shadow-lift sm:px-6 sm:pt-9 lg:px-8 lg:pb-8 lg:pt-11"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#10243a_0%,#15314b_58%,#1a4150_100%)]"
        />
        <div aria-hidden className="pointer-events-none absolute -right-20 -top-28 size-72 rounded-full bg-calm-400/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 size-64 rounded-full bg-breeze-400/10 blur-3xl" />

        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-calm-200">Nonstop · one way · economy</p>
          <h1 id="c-home-title" className="mt-2 max-w-[22ch] text-balance text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[34px] lg:text-[40px]">
            Compare flights side by side
          </h1>
          <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-white/75">
            Pick a route and a day to see every nonstop flight with its expected smoothness, turbulence timeline, crew,
            aircraft and weather next to its time and fare.
          </p>
          <div className="mt-6">
            <HomeSearch />
          </div>
        </div>
      </section>

      <HomeTiles />
    </>
  );
}
