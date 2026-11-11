/*
 * The markup the cloud code reads (docs/ui-d-cinematic.md, "Where it lives") and two ways of
 * asking whether an element is really there. Screens place the attributes; nothing here, or
 * anywhere under components/d/cloud, knows what the marked elements show.
 */

/** An in-flow card the companion may perch on. Never a sticky element. */
export const SEAT = "[data-cloud-seat]";
/** The small inline cloud the companion starts from on a page, and returns to. On the drawing itself (CloudMascot's prop), never on a wrapper. */
export const HOME = "[data-cloud-home]";
/** A large inline cloud: while it is on screen the companion stays away. On the drawing itself, like the home mark. */
export const STAGE = "[data-cloud-stage]";
/** Every cloud drawing (components/d/brand/CloudMascot.tsx). */
export const CLOUD = ".d-cloud";
/** Set on a home cloud while the companion is out, so its box is empty. */
export const AWAY = "data-cloud-away";

/**
 * In a page that is on screen. Pages the visitor has left stay in the DOM with `display: none`
 * (Next keeps them alive), so a selector alone also finds their seats and clouds.
 */
export function isRendered(el: Element): boolean {
  if (!el.isConnected) return false;
  // Safari before 17.4 has no checkVisibility; an element that is not displayed has no boxes.
  if (typeof el.checkVisibility === "function") return el.checkVisibility();
  return el.getClientRects().length > 0;
}

/** Rendered and actually painted: a home cloud that is away and the resting companion are transparent. */
export function isSeen(el: Element): boolean {
  if (!el.isConnected) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  return el.getClientRects().length > 0;
}

/** The drawing inside the companion's box. (A home or stage mark is always on the drawing itself: CloudMascot sets it.) */
export function cloudOf(host: Element): HTMLElement | null {
  return host.querySelector<HTMLElement>(CLOUD);
}

/**
 * A sheet is open over the page: the sheet makes everything beside it inert (components/c/common/Sheet.tsx
 * marks the children of <body>), and so the D root, wherever it sits, has an inert ancestor or is one.
 */
export function behindSheet(root: Element): boolean {
  return root.closest("[inert]") !== null;
}

/** Whether any part of the box is in the viewport. */
export function inViewport(rect: DOMRect): boolean {
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
}
