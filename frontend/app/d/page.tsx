import type { Metadata } from "next";
import { InterestCard } from "@/components/c/interest/InterestCard";
import { HomeSearch } from "@/components/c/search/HomeSearch";

export const metadata: Metadata = {
  title: "Find a smooth flight",
};

/**
 * /d — version D home. For now the search form alone; the "What matters to
 * you" setup lands here next (docs/ITERATION_2.md).
 */
export default function DHomePage() {
  return (
    <>
      <section aria-labelledby="d-home-title" className="rounded-3xl bg-night-900 px-4 py-6 text-white shadow-lift sm:px-6 lg:px-8 lg:py-10">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-calm-200">Nonstop · one way · economy</p>
        <h1 id="d-home-title" className="mt-2 max-w-[22ch] text-balance text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[34px] lg:text-[40px]">
          Find a smooth flight
        </h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-white/75">
          Pick a route and a day to see every nonstop flight rated in plain words for what matters to you.
        </p>
        <div className="mt-6">
          <HomeSearch />
        </div>
      </section>

      <InterestCard placement="d_home" context="" className="mt-8" />
    </>
  );
}
