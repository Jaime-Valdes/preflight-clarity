"use client";

import { ViewTransition } from "react";

/**
 * Version D page transition (docs/ui-d-cinematic.md, "The page transition"): the bank of cloud
 * that drifts across the screen when a /d page arrives: it covers the old page, the page changes
 * under it, and it uncovers the new one.
 *
 * Render it as the FIRST child of the fragment each /d page.tsx returns, outside the page's
 * <Suspense> boundary and not inside any element:
 *
 *   return (
 *     <>
 *       <DPageTransition />
 *       <Suspense fallback={<DLoading />}>…</Suspense>
 *     </>
 *   );
 *
 * Any other place fails silently: in the layout `enter` never fires, inside the Suspense
 * boundary it fires again on the reveal, and inside an element React ignores it.
 *
 * It is one empty, fixed, 1×1 px element inside a <ViewTransition>. The element paints nothing;
 * the clouds are CSS backgrounds on the pseudo-elements the browser creates for it while the
 * transition runs (app/d/d-transition.css). One callback, once per pass and never per frame:
 * alignSky (below). The bank is laid out from where this element is: keep it at the screen's
 * top-left corner, with no transformed ancestor, and keep it D's only <ViewTransition> (the CSS
 * holds the old page for every view transition under /d).
 *
 * - `enter` runs when this page mounts, or is shown again from the keep-alive cache, by a
 *   <Link> or router.push. It does not run for a query-only change on the same page (sort,
 *   filter, another date, removing a compared flight), for a Suspense reveal inside the page,
 *   on the first page load, or when /d is entered from another version.
 * - `default="none"` switches update, exit and share off for this boundary.
 * - Browser Back and Forward stay instant: React renders them synchronously, without a view
 *   transition.
 */
export function DPageTransition() {
  return (
    <ViewTransition enter="d-cloud-pass" default="none" onEnter={alignSky}>
      <div className="d-vt-stage" aria-hidden="true" />
    </ViewTransition>
  );
}

/**
 * The sky's lever (d-vt-sky: the sky drawn for the old page's capture, then out of the render tree until it comes
 * back inside the bank's held moment) starts with the transition, when the old page is captured; the bank (d-vt-far) starts only once the new page has
 * been committed and laid out, 0 to 140 ms later depending on the page. React calls this at that moment (the
 * transition's `ready`), and it gives the sky's animation the bank's start time, so the sky comes back at the same
 * point of the bank's clock on every page move: inside the hold, where its one costly frame shows nothing moving.
 * It writes nothing to the DOM. Where it cannot run, the sky comes back up to 140 ms early, still under the old page.
 */
function alignSky() {
  try {
    const all = document.getAnimations();
    const named = (name: string) => all.find((a) => a instanceof CSSAnimation && a.animationName === name);
    const bank = named("d-vt-far");
    const sky = named("d-vt-sky");
    if (!bank || !sky) return;
    const align = () => {
      // Half a millisecond ahead of the bank: past the lever's first keyframe (the sky drawn for the old page's
      // capture), so the sky stays out of the render tree until the hold.
      if (bank.startTime !== null && sky.playState !== "finished" && sky.playState !== "idle") sky.startTime = Number(bank.startTime) - 0.5;
    };
    if (bank.startTime !== null) align();
    else bank.ready.then(align, () => {});
  } catch {
    // Not supported here: the sky keeps its own clock.
  }
}
