/*
 * How D's components tell the cloud that something happened (docs/ui-d-cinematic.md,
 * "Reactions"). A kind and nothing else: nothing about the card, the choice or its place in
 * a list ever reaches the cloud, so it cannot treat one of them differently from another.
 * ./reactions listens and has the cloud on screen act the kind out, the same way every time.
 *
 *   cloudReact("noted")    compare added or removed, a priority ranked or un-ranked, "Start over":
 *                          the beam face and a nod, identical in both directions and for every flight
 *   cloudReact("nod")      "I'd pick this flight" picked or withdrawn: the plain nod and no face, the
 *                          same both ways (the study's outcome is acknowledged, never rewarded)
 *   cloudReact("curious")  "Why?" opened: the bright face and a head tilt
 *   cloudReact("glad")     the setup answered: the beam face, no motion
 *
 * Every other control gets the generic tap (the bright face and a lift, at most every 1.2 s) from
 * ./reactions' own listener, and the sign-up, the footer, dialogs and sheets get nothing.
 */

/** The kinds a component can call. Each is acted out the same way every time, whatever it was for. */
export type CloudReaction = "noted" | "nod" | "curious" | "glad";

export const CLOUD_REACT_EVENT = "d-cloud-react";

export function cloudReact(kind: CloudReaction): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CloudReaction>(CLOUD_REACT_EVENT, { detail: kind }));
}
