"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HomeSearch } from "@/components/c/search/HomeSearch";
import { Blobs } from "@/components/d/brand/Blobs";
import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { FlightPath } from "@/components/d/brand/FlightPath";
import { ProgressDashes } from "@/components/d/brand/ProgressDashes";
import { DWordmark } from "@/components/d/brand/Wordmark";
import { PrioritiesSetup } from "@/components/d/setup/PrioritiesSetup";

/** Staggered entrance: 60 ms per element, from the top of the screen down. */
const rise = (step: number): CSSProperties => ({ animationDelay: `${step * 60}ms` });

/**
 * The /d home (docs/ITERATION_2.md, look: docs/ui-d-theme.md): the intro — the
 * mascot, a flight path drawing itself across the sky, one headline, one line,
 * one button — then the priorities setup and the search form. "Let's begin"
 * moves to the setup; after the setup is answered the search form takes focus,
 * so the next step is always under the thumb.
 */
export function DHome() {
  const setupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  // Counts the setup's answers. The scroll runs from an effect keyed on it, i.e. after the commit in
  // which the setup card collapsed into its summary — measured during the click, the target would sit
  // a form's height too low and the visitor would land past the search card.
  const [advanced, setAdvanced] = useState(0);

  useEffect(() => {
    if (advanced === 0) return;
    const el = searchRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = window.matchMedia("(pointer: coarse)").matches;
    el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    // On a touch screen, focusing the From field would open its suggestions and the keyboard over the
    // card, so focus lands on the card itself; with a mouse or keyboard the field is ready to type into.
    const target = touch ? el : el.querySelector<HTMLElement>("input, button");
    target?.focus({ preventScroll: true });
  }, [advanced]);

  function begin() {
    const el = setupRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }

  return (
    <>
      {/* The intro: the page's sky with the blobs behind, the drawing, then the words. */}
      <section aria-labelledby="d-home-title" className="relative -mx-4 -mt-4 overflow-hidden px-4 pb-10 pt-5 sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-8 lg:-mx-8 lg:px-8 lg:pb-14">
        <Blobs />
        <div className="relative mx-auto max-w-[1120px]">
          <div className="animate-d-rise" style={rise(0)}>
            <DWordmark />
          </div>

          {/* The scene: the path sweeps across; the mascot sits on it, right of centre. */}
          <div className="relative mt-2 h-[13.5rem] sm:h-[16rem] lg:mt-0 lg:h-[20rem]">
            <FlightPath className="absolute inset-x-0 top-1/2 -translate-y-1/2" />
            <div className="absolute right-[6%] top-[14%] w-[9.5rem] animate-d-rise sm:w-[11rem] lg:right-[12%] lg:top-[10%] lg:w-[14rem]" style={rise(1)}>
              <CloudMascot />
            </div>
          </div>

          <div className="max-w-[34rem] lg:max-w-[40rem]">
            <ProgressDashes total={3} active={0} label="Step 1 of 3: a quick hello" className="animate-d-rise" style={rise(2)} />
            <h1
              id="d-home-title"
              className="mt-5 animate-d-rise text-balance text-[38px] font-extrabold leading-[1.08] tracking-[-0.025em] text-ink sm:text-[48px] lg:text-[56px]"
              style={rise(3)}
            >
              A calmer way to choose a flight
            </h1>
            <p className="mt-4 max-w-[32rem] animate-d-rise text-[17px] leading-relaxed text-ink-soft" style={rise(4)}>
              Tell us what matters to you. We&rsquo;ll show every nonstop flight on your route in plain words &mdash; no scores,
              no jargon.
            </p>
            <div className="mt-7 animate-d-rise sm:max-w-[22rem]" style={rise(5)}>
              <button
                type="button"
                onClick={begin}
                className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink px-6 text-[17px] font-bold text-white transition-transform duration-[120ms] active:scale-[0.98]"
              >
                Let&rsquo;s begin
                <ArrowRight aria-hidden className="size-5" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <div ref={setupRef} tabIndex={-1} className="scroll-mt-4 outline-none">
        <PrioritiesSetup className="mt-2" onDone={() => setAdvanced((n) => n + 1)} />
      </div>

      {/* Dark like the primary button: the search form's popular routes are drawn for a dark background. */}
      <div
        ref={searchRef}
        tabIndex={-1}
        className="mt-4 scroll-mt-4 rounded-[28px] bg-ink px-4 py-5 text-white shadow-lift outline-none sm:px-6 sm:py-6 lg:px-8"
      >
        <h2 className="text-[22px] font-extrabold leading-snug tracking-tight text-white">Where and when?</h2>
        <div className="mt-3">
          <HomeSearch />
        </div>
      </div>
    </>
  );
}
