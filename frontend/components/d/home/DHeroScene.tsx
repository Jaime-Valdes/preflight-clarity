import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { FlightPath } from "@/components/d/brand/FlightPath";
import { DSkyCloud } from "@/components/d/sky/DSkyCloud";

/**
 * The picture in the home's hero (docs/ui-d-cinematic.md, "Home"): the sun, the Cloud9 cloud in front
 * of its lower left, and a flight line that sweeps up from the left, passes behind the cloud and
 * climbs across the sun to a paper plane at the top right. On arrival it plays a short title
 * sequence (the sun rises, the cloud drifts in, the line draws and the plane flies it); all of that,
 * and where each piece sits, is in app/d/d-home.css.
 *
 * Decorative and out of reach: hidden from assistive technology, never focusable, and it takes no
 * taps. The sun is the sky's own drawing (.d-sun), placed in the page so it scrolls away with the
 * hero. On laptops a flat scenery cloud lies at its foot, behind the character, so the sun rises
 * from behind something (the sky's own clouds are a layer further back and cannot pass in front of
 * it). The outlined cloud is the page's stage cloud: while it is on screen the roaming companion
 * stays away. Both flight lines are rendered; the stylesheet shows the one drawn for the current
 * arrangement.
 */
export function DHeroScene() {
  return (
    <div aria-hidden className="d-home-scene">
      <div className="d-home-stage">
        <div className="d-sun d-home-sun" />
        <div className="d-home-bank">
          <DSkyCloud />
        </div>
        <FlightPath variant="band" className="d-home-line-band" />
        <FlightPath variant="tall" className="d-home-line-tall" />
        <div className="d-home-cloud">
          <CloudMascot data-cloud-stage />
        </div>
      </div>
    </div>
  );
}
