"use client";

import { useLayoutEffect } from "react";

/**
 * Marks <html> with `data-d-on` while the version D layout is mounted and visible
 * (docs/ui-d-cinematic.md, "Scoping and layers"). Some of D's rules have to reach
 * outside the themed <div>: the ::view-transition-* pseudo-elements hang off the
 * root element, sheets portal to <body>, and the <body> colour shows on overscroll.
 * Those rules are scoped to `html[data-d-on]`. An effect, not `:has([data-theme="d"])`:
 * kept-alive pages stay in the DOM hidden and would keep a `:has()` matching, while
 * effects are cleaned up as soon as the layout is hidden. Renders nothing.
 */
export function DScope() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-d-on", "");
    return () => html.removeAttribute("data-d-on");
  }, []);
  return null;
}
