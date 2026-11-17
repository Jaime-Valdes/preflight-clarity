"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { startSkyClock } from "@/components/d/sky/clock";
import { skyBootScript } from "@/components/d/sky/time";

/**
 * The sky's boot script (components/d/sky/time.ts), built once per module load. Built here rather than passed in
 * from the layout: a prop of a client component is also serialised into the RSC payload, and the HTML would carry
 * the script twice.
 */
const SKY_BOOT = skyBootScript();

const noSubscribe = () => () => {};

/**
 * Marks <html> with `data-d-on` while the version D layout is mounted and visible
 * (docs/ui-d-cinematic.md, "Scoping and layers"). Some of D's rules have to reach
 * outside the themed <div>: the ::view-transition-* pseudo-elements hang off the
 * root element, sheets portal to <body>, and the <body> colour shows on overscroll.
 * Those rules are scoped to `html[data-d-on]`. An effect, not `:has([data-theme="d"])`:
 * kept-alive pages stay in the DOM hidden and would keep a `:has()` matching, while
 * effects are cleaned up as soon as the layout is hidden.
 *
 * It also keeps the sky's day and night (docs/ui-d-cinematic.md, section 4, "Day and night"). While the server
 * renders, and while that HTML hydrates, it prints the boot script, which runs as the root's first child before
 * anything under the root is parsed, so the right sky is in the first frame. It is DScope's own output, not a new
 * child of the root: a new sibling would renumber every server-rendered id under the root. After hydration it
 * renders nothing (a script React creates on the client never runs, and the script text need not stay in the DOM).
 * Its layout effect then starts the sky's clock (components/d/sky/clock.ts), which mirrors `data-d-time` on <html>,
 * keeps D's theme-color meta and follows dusk and dawn; the cleanup stops the clock before `data-d-on` goes.
 */
export function DScope() {
  const printing = useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true,
  );
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-d-on", "");
    const root = document.querySelector<HTMLElement>('[data-theme="d"]');
    const stopClock = root ? startSkyClock(root) : undefined;
    return () => {
      stopClock?.();
      html.removeAttribute("data-d-on");
    };
  }, []);
  if (!printing) return null;
  return <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SKY_BOOT }} />;
}
