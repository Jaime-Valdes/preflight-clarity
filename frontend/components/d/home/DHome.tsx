"use client";

import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HomeSearch } from "@/components/c/search/HomeSearch";
import { D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { ProgressDashes } from "@/components/d/brand/ProgressDashes";
import { DWordmark } from "@/components/d/brand/Wordmark";
import { DHeroScene } from "@/components/d/home/DHeroScene";
import { PrioritiesSetup } from "@/components/d/setup/PrioritiesSetup";
import { cn } from "@/lib/cn";

/** The words settle in one after another, 60 ms apart (app/d/d-home.css reads the step). Position only, never a fade. */
const step = (n: number) => ({ "--d-home-step": n }) as CSSProperties;

/**
 * The /d home (docs/ITERATION_2.md, look: docs/ui-d-cinematic.md): the intro — the
 * sun, the cloud in front of it and a flight line climbing past them, then one
 * headline, one line, one button — then the priorities setup and the search form.
 * "Let's begin" moves to the setup; after the setup is answered the search form
 * takes focus, so the next step is always under the thumb.
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
      {/* The intro. Phones: the scene is a band of sky under the header, then the words. Laptops: words left, scene right. */}
      <section aria-labelledby="d-home-title" className="d-home-hero -mt-3 sm:-mt-4 lg:mt-0 lg:pt-2">
        <DHeroScene />
        <div className="d-home-words mt-3 sm:mt-4 lg:mt-0">
          <div className="d-home-rise">
            <DWordmark />
          </div>
          <ProgressDashes total={3} active={0} label="Step 1 of 3: a quick hello" className="d-home-rise mt-6" style={step(1)} />
          <h1
            id="d-home-title"
            className="d-home-rise mt-5 max-w-[34rem] text-balance text-[38px] font-extrabold leading-[1.08] tracking-[-0.025em] text-ink sm:text-[48px] lg:text-[56px]"
            style={step(2)}
          >
            A calmer way to choose a flight
          </h1>
          <p className="d-home-rise mt-4 max-w-[32rem] text-[17px] leading-relaxed text-ink-soft" style={step(3)}>
            Tell us what matters to you. We&rsquo;ll show every nonstop flight on your route in plain words &mdash; no scores,
            no jargon.
          </p>
          {/* Still from the first frame: the one thing on the screen to tap never moves under the thumb. */}
          <div className="mt-7 sm:max-w-[22rem]">
            <button type="button" onClick={begin} className={cn(D_PILL_PRIMARY, "h-14 w-full px-6 text-[17px]")}>
              Let&rsquo;s begin
              <ArrowRight aria-hidden className="size-5" />
            </button>
          </div>
        </div>
      </section>

      {/* The card inside is a seat for the roaming cloud: 30 px (32 from 640 px) of clear sky above it, so the cloud's
          head never reaches "Let's begin", and the same margin when "Let's begin" scrolls it to the top of the screen. */}
      <div ref={setupRef} tabIndex={-1} className="mt-[30px] scroll-mt-[30px] rounded-[24px] outline-none sm:mt-8 sm:scroll-mt-8">
        <PrioritiesSetup onDone={() => setAdvanced((n) => n + 1)} />
      </div>

      {/* The last step: the search form on a paper card, the popular routes on sky chips. A seat too, 24 px under the
          setup card. It holds the airport suggestion lists, so it is never transformed, lifted or revealed. */}
      <div ref={searchRef} tabIndex={-1} data-cloud-seat className="mt-6 scroll-mt-6 rounded-[24px] bg-surface p-5 shadow-soft outline-none sm:p-7">
        <ProgressDashes total={3} active={2} label="Step 3 of 3: where and when" />
        <h2 className="mt-4 text-[26px] font-extrabold leading-[1.12] tracking-[-0.02em] text-ink sm:text-[30px]">Where and when?</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">Nonstop flights, one way, one traveller.</p>
        <div className="mt-5">
          <HomeSearch tone="light" />
        </div>
      </div>
    </>
  );
}
