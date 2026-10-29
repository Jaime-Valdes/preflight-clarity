"use client";

import { useRef } from "react";
import { HomeSearch } from "@/components/c/search/HomeSearch";
import { PrioritiesSetup } from "@/components/d/setup/PrioritiesSetup";

/**
 * The /d home: hero, the priorities setup and the search form. After the setup
 * is answered the search form takes focus, so the next step is under the thumb.
 */
export function DHome() {
  const searchRef = useRef<HTMLDivElement>(null);

  function focusSearch() {
    const el = searchRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    el.querySelector<HTMLElement>("input, button")?.focus({ preventScroll: true });
  }

  return (
    <>
      <section aria-labelledby="d-home-title" className="rounded-3xl bg-night-900 px-4 py-6 text-white shadow-lift sm:px-6 lg:px-8 lg:py-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-calm-200">Nonstop · one way · economy</p>
        <h1 id="d-home-title" className="mt-2 max-w-[22ch] text-balance text-[28px] font-bold leading-[1.15] tracking-tight sm:text-[34px] lg:text-[40px]">
          Find a smooth flight
        </h1>
        <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-white/75">
          Tell us what matters to you, then see every nonstop flight on your route rated in plain words for it, with the
          price next to it.
        </p>
      </section>

      <PrioritiesSetup className="mt-4" onDone={focusSearch} />

      {/* Navy like C's hero: the search form's popular routes are drawn for a dark background. */}
      <div ref={searchRef} className="mt-4 scroll-mt-4 rounded-3xl bg-night-900 px-4 py-5 text-white shadow-lift sm:px-6 sm:py-6 lg:px-8">
        <h2 className="text-[20px] font-bold leading-snug tracking-tight text-white">Where and when?</h2>
        <div className="mt-3">
          <HomeSearch />
        </div>
      </div>
    </>
  );
}
