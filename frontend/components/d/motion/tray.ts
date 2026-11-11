/*
 * The compare tray as a place the small plane flies to and from
 * (docs/ui-d-cinematic.md, "Small interactions": compare add, and remove as its mirror).
 * The tray and the header are shared components; this only reads where they are. It
 * takes a control and a position in the visitor's own compare list, never anything
 * about a flight, so adding and removing look the same for every flight.
 */

import { flyTo, type MotionRect } from "./motion";

/** The shared tray's id (components/c/shell/CompareTray.tsx). */
const TRAY_ID = "c-compare-tray";

function onScreen(el: Element | null | undefined): DOMRect | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0 ? rect : null;
}

/**
 * Where a compared flight sits: the tray's chip at `index` in the compare list (the last
 * chip when no index is given), or the header's Compare link while the tray is not
 * showing. Null when neither is on screen.
 */
export function trayChipRect(index?: number): MotionRect | null {
  if (typeof document === "undefined") return null;
  const chips = document.querySelectorAll<HTMLElement>(`#${TRAY_ID} ul > li`);
  const chip = index === undefined ? chips[chips.length - 1] : chips[index];
  const link = document.querySelector<HTMLElement>('[data-theme="d"] > header nav a[href$="/compare"]');
  return onScreen(chip) ?? onScreen(link);
}

/**
 * Compare added: the plane leaves the control and lands on the tray's newest chip. Call it
 * in the click handler, after the list has changed; it measures on the next frame, when
 * the chip exists and the page has settled clear of the tray.
 */
export function flyToTray(control: Element | null | undefined): void {
  if (!control || typeof window === "undefined") return;
  window.requestAnimationFrame(() => {
    const from = onScreen(control);
    const to = trayChipRect();
    if (from && to) flyTo(from, to);
  });
}

/**
 * Compare removed: the mirror image, from the flight's chip back to the control. Call it
 * in the click handler BEFORE the list changes, with the flight's place in the compare
 * list: the chip has to be there still to be measured.
 */
export function flyFromTray(index: number, control: Element | null | undefined): void {
  if (!control) return;
  const from = trayChipRect(index);
  const to = onScreen(control);
  if (from && to) flyTo(from, to);
}
