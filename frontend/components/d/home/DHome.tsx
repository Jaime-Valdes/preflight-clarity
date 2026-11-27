"use client";

import type { CSSProperties } from "react";
import { DWordmark } from "@/components/d/brand/Wordmark";
import { DHeroScene } from "@/components/d/home/DHeroScene";
import { DHomeSearch } from "@/components/d/home/DHomeSearch";

/** The words settle in one after another, 60 ms apart (app/d/d-home.css reads the step). Position only, never a fade. */
const step = (n: number) => ({ "--d-home-step": n }) as CSSProperties;

/**
 * The /d landing, v3 (lib/d/landing.ts; the Nov 19–23 ad test showed visitors reading and leaving before
 * the old intro and priorities step let them search). One headline that says what the ad says, one line,
 * then the search itself, the example routes and a sample flight — the first screen of a phone holds the
 * form. What matters to the visitor is asked on the results page now, and only if they want to.
 * Phones: no scene, so the form sits right under the words. Laptops: words left, the scene right, as before.
 */
export function DHome() {
  return (
    <>
      <section aria-labelledby="d-home-title" className="d-home-hero d-home-hero-v3 lg:pt-2">
        <DHeroScene />
        <div className="d-home-words">
          {/* Phones: the header's logo already names it, and the form needs the room. */}
          <div className="d-home-rise max-sm:hidden">
            <DWordmark />
          </div>
          <h1
            id="d-home-title"
            className="d-home-rise max-w-[36rem] text-balance text-[28px] font-extrabold leading-[1.1] tracking-[-0.025em] text-ink sm:mt-5 sm:text-[44px] lg:text-[52px]"
            style={step(1)}
          >
            Nervous flyer? Find the smoothest flight before you book.
          </h1>
          <p className="d-home-rise mt-2 max-w-[32rem] text-[15px] leading-snug text-ink-soft sm:mt-4 sm:text-[17px] sm:leading-relaxed" style={step(2)}>
            Search your route and see every nonstop flight rated for a smooth ride.
          </p>
        </div>
      </section>

      <div className="mt-4 sm:mt-6">
        <DHomeSearch />
      </div>
    </>
  );
}
