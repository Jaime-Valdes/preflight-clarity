"use client";

import { useSyncExternalStore } from "react";

/** The laptop layout (Tailwind's lg, 1024 px): the flight page's sticky column. */
const WIDE = "(min-width: 1024px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the page has its laptop layout; null during server render and hydration. The flight page
 * renders its one after_pick card under whichever "I'd pick this flight" is on screen with it.
 */
export function useWide(): boolean | null {
  return useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => null);
}
