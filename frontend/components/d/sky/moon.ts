/* eslint-disable no-var -- `moonPhaseCss` is printed into the boot script as ES5 (see below). */

/*
 * Tonight's moon for version D's night sky (docs/ui-d-cinematic.md, section 4, "Day and night"): its real phase,
 * worked out in the browser from the date alone (no network, no library), drawn once as a picture and never animated.
 *
 * `moonPhaseCss` runs twice, like time.ts's `skyTimeAt`: printed into the boot script (time.ts, `skyBootScript`), so
 * the phase is right in the first frame, and imported by the sky's clock (clock.ts), which writes it again when the
 * local date changes. So it is self-contained ES5: only its argument and Date and Math, no other name from this module.
 * It returns the text of `<style id="d-moon-phase">` in <head>: the custom property app/d/d-sky.css paints every
 * `.d-moon` with, or, within about a day and a half of a new moon, a rule that takes the moon out (only stars then).
 */

/**
 * The phase at `now` (ms): the age since a known new moon (2000-01-06 18:14 UTC) in mean synodic months (29.53 days;
 * up to about 0.6 day off the true phase, which no one can see). In a disc of radius 1 (y down) the lit part is the
 * half-disc on the lit side (the right while waxing, the left while waning, as seen from the northern hemisphere)
 * less or plus a half-ellipse of x-radius |cos φ|: its terminator bulges toward the lit side for a crescent and away
 * from it for a gibbous moon. That part is filled with the moon's cream disc and its three soft seas; the rest of the
 * disc is moon white at 8 % (earthshine). d-sky.css lays the picture over the moon's halo.
 */
export function moonPhaseCss(now: number): string {
  var month = 29.530588853;
  var age = ((((now - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % month) + month) % month;
  if (age < 1.5 || age > month - 1.5) return ".d-moon{display:none!important}";
  var cos = Math.cos((2 * Math.PI * age) / month);
  var waxing = age < month / 2;
  var lit =
    "M0-1A1 1 0 0 " + (waxing ? 1 : 0) + " 0 1A" + Math.round(Math.abs(cos) * 1000) / 1000 + " 1 0 0 " + (waxing === cos > 0 ? 0 : 1) + " 0-1Z";
  var sea = function (x: string, y: string, r: string, o: string) {
    return "<circle cx='" + x + "' cy='" + y + "' r='" + r + "' fill='url(%23s)' opacity='" + o + "'/>";
  };
  return (
    ".d-moon{--d-moon-phase:url(\"data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='-1 -1 2 2'>" +
    "<radialGradient id='g'><stop offset='0' stop-color='%23fffbee'/><stop offset='.754' stop-color='%23fbf4dc'/><stop offset='1' stop-color='%23f3ebcd'/></radialGradient>" +
    "<radialGradient id='s'><stop offset='.77' stop-color='%23ded6ba'/><stop offset='1' stop-color='%23ded6ba' stop-opacity='0'/></radialGradient>" +
    "<clipPath id='c'><path d='" +
    lit +
    "'/></clipPath><circle r='1' fill='%23fffdf8' fill-opacity='.08'/><g clip-path='url(%23c)'><circle r='1' fill='url(%23g)'/>" +
    sea("-.295", "-.393", ".182", ".75") +
    sea(".295", "-.131", ".21", ".6") +
    sea("-.131", ".328", ".146", ".55") +
    '</g></svg>")}'
  );
}
