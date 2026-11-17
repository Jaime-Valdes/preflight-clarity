import { useId } from "react";
import { CloudDrawing } from "./CloudDrawing";

/*
 * The Cloud9 cloud for version D, as a character (docs/ui-d-cinematic.md, "The cloud"): the drawing
 * (./CloudDrawing, where its layers are described) with ids of its own. No hooks but useId, so it renders on
 * the server (the loading state is prerendered HTML) and looks the same before any script runs.
 */

interface CloudMascotProps {
  /** Width in CSS; the drawing keeps its 5:4 shape. */
  className?: string;
  float?: boolean;
  /** Decorative by default; pass a label when it stands in for text (an empty state). */
  label?: string;
  /** This small inline cloud is where the roaming companion starts and returns to on its page. */
  "data-cloud-home"?: boolean;
  /** This large inline cloud is the page's character: while it is on screen the companion stays away. */
  "data-cloud-stage"?: boolean;
  /** A still face other than the usual one, for a drawing that needs it. The eyes are open and the mouth is a smile by default. */
  "data-eyes"?: "happy" | "closed";
  "data-mouth"?: "wide";
}

export function CloudMascot({
  className,
  float = true,
  label,
  "data-cloud-home": home,
  "data-cloud-stage": stage,
  "data-eyes": eyes,
  "data-mouth": mouth,
}: CloudMascotProps) {
  // Gradient and clip ids have to be unique on a page with several clouds, and the same on the server and the client.
  const id = `d-cloud-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <CloudDrawing id={id} className={className} float={float} label={label} home={home} stage={stage} eyes={eyes} mouth={mouth} />
  );
}
