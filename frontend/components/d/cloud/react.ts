/*
 * How D's components tell the cloud that something happened (docs/ui-d-cinematic.md,
 * "Reactions"). A kind and nothing else: nothing about the card, the choice or its place in
 * a list ever reaches the cloud, so it cannot treat one of them differently from another.
 * ./reactions listens and has the cloud on screen act the kind out, the same way every time.
 *
 *   cloudReact("nod")      compare added or removed, a pick made or withdrawn, a priority ranked or un-ranked
 *   cloudReact("curious")  "Why?" opened
 *   cloudReact("glad")     the setup answered
 */

/** nod: "noted" (identical for add and remove, pick and withdraw). curious: leans toward what it looks at. glad: the visitor finished a task of their own. */
export type CloudReaction = "nod" | "curious" | "glad";

export const CLOUD_REACT_EVENT = "d-cloud-react";

export function cloudReact(kind: CloudReaction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CloudReaction>(CLOUD_REACT_EVENT, { detail: kind }));
}
