/*
 * How D's components tell the cloud that something happened (docs/ui-d-cinematic.md,
 * "Reactions"). A kind and nothing else: no flight, rating, price or position ever
 * reaches the cloud, so it cannot treat one flight differently from another.
 */

/** nod: "noted" (identical for add and remove, pick and withdraw). curious: leans in. glad: the visitor finished a task of their own. */
export type CloudReaction = "nod" | "curious" | "glad";

export const CLOUD_REACT_EVENT = "d-cloud-react";

export function cloudReact(kind: CloudReaction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CloudReaction>(CLOUD_REACT_EVENT, { detail: kind }));
}
