import { ViewTransition } from "react";

/**
 * Version D page transition (docs/ui-d-cinematic.md, "The page transition"): the paper plane
 * that crosses the screen towing a ribbon of cloud when a /d page arrives, wiping the old page
 * away from left to right.
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
 * the ribbon and the plane are CSS backgrounds on the pseudo-elements the browser creates for
 * it while the transition runs (app/d/d-transition.css). No hooks and no callbacks, so it works
 * in a server component and no script of ours runs while the plane flies. The ribbon is laid
 * out from where this element is: keep it at the screen's top-left corner, with no transformed
 * ancestor, and keep it D's only <ViewTransition> (the CSS holds the old page for every view
 * transition under /d).
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
    <ViewTransition enter="d-plane" default="none">
      <div className="d-vt-stage" aria-hidden="true" />
    </ViewTransition>
  );
}
