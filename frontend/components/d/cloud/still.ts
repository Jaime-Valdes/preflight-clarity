"use client";

import { useSyncExternalStore } from "react";

/*
 * Whether the visitor asked for less motion, as a value a component can render from. Under
 * that setting there is no companion and no cloud script at all (docs/ui-d-cinematic.md, "The
 * cloud"): the clouds are still drawings. Read through an external store, so it is right on the
 * first client render without a state change inside an effect, and it follows the setting if
 * it changes while the page is open.
 */

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True for reduced motion, and on the server and during hydration (nothing that moves is in the HTML). */
export function useStill(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
