/* eslint-disable no-var, @typescript-eslint/no-unused-vars -- `skyTimeAt` and `bootSky` are printed as ES5 (see below): `var`, and `catch (e)` with the binding. */
import { moonPhaseCss } from "./moon";
import { SKY_ZONES } from "./zones";

/*
 * Day or night for version D's sky (docs/ui-d-cinematic.md, "Day and night"): night is when the sun is more
 * than 6° below the horizon where the visitor probably is (the end of civil twilight, when the first stars come
 * out). Where they are is estimated from the device's time zone alone: no location prompt, no network, nothing
 * stored or sent.
 *
 * `skyTimeAt` and `bootSky` are written to run twice: imported normally (the sky's clock, ./clock.ts), and as
 * the source of the boot script that DScope prints as the D root's first child, which runs before the page
 * paints. So each is self-contained: it reads only its arguments and the browser's globals (Date, Intl, Math,
 * document), in ES5 (`var`, no arrow functions, no `?.` or `??`, no spread), so no compiler helper is pulled in.
 * Do not make either refer to anything else in this module, or the boot script breaks with a ReferenceError.
 * The same holds for `unpackZones` below and for ./moon.ts's `moonPhaseCss`, which the script also prints.
 * `node frontend/scripts/d-sky-boot.mjs <server>` runs the script a server prints and checks it.
 */

export type SkyTime = "day" | "night";
type Zones = Readonly<Record<string, readonly [number, number]>>;

/**
 * The colour the browser shows around the page (its bar, the overscroll): the top of the sky, by day or night
 * (#7EC3F4, #0E1838). Written in lower case on purpose, so D's own theme-color meta never carries the exact
 * `content` string of a meta React renders (the layout's viewport export says "#7EC3F4"): when React mounts a
 * `<meta>` it reuses any meta in the document it does not own with the same name and content, and it would take
 * D's over (measured: by day, leaving /d then removed D's meta from under the clock, or left a sky-blue theme
 * colour in front of C's). `d-sky-boot.mjs` checks the strings differ.
 */
export const SKY_EDGE: Readonly<Record<SkyTime, string>> = { day: "#7ec3f4", night: "#0e1838" };

/** Night or day at `now` (ms), for the place the device's time zone points at. */
export function skyTimeAt(now: number, zones: Zones): SkyTime {
  var zone = "";
  try {
    zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch (e) {
    zone = "";
  }
  var at = zones[zone];
  if (!at) {
    // No zone, or one that says nothing about a place (UTC is also what privacy modes report): keep the day.
    if (!zone || /^(Etc\/)?(UTC|UCT|GMT|GMT[+-]?0|Greenwich|Universal|Zulu|Unknown|Factory)$/i.test(zone)) return "day";
    // Any other zone: the standard-time offset gives the longitude (15° an hour), the summer-time months the hemisphere.
    var year = new Date(now).getFullYear();
    var jan = new Date(year, 0, 1).getTimezoneOffset();
    var jul = new Date(year, 6, 1).getTimezoneOffset();
    at = [jan > jul ? 45 : jan < jul ? -35 : 20, -Math.max(jan, jul) / 4];
  }
  // The sun's altitude: NOAA's general solar position equations (fractional-year form), in UTC.
  var d = new Date(now);
  var y = d.getUTCFullYear();
  var days = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
  var minutes = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
  var dayOfYear = Math.floor((now - Date.UTC(y, 0, 1)) / 864e5) + 1;
  var g = ((2 * Math.PI) / days) * (dayOfYear - 1 + (minutes / 60 - 12) / 24);
  var eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  var decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  var hourAngle = (((minutes + eqTime + 4 * at[1]) / 4 - 180) * Math.PI) / 180;
  var lat = (at[0] * Math.PI) / 180;
  var cosZenith = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  var altitude = 90 - (Math.acos(Math.max(-1, Math.min(1, cosZenith))) * 180) / Math.PI;
  return altitude < -6 ? "night" : "day";
}

/**
 * The boot: runs as an inline script, the first child of the D root, before anything under it is parsed. Marks
 * the root, gives the browser bar its colour (a theme-color of D's own, ahead of the layout's), colours <html> and
 * <body> until DScope takes over (React owns those two elements, so they are not touched directly), and draws
 * tonight's moon (`<style id="d-moon-phase">`, kept by the clock).
 */
export function bootSky(decide: typeof skyTimeAt, zones: Zones, edge: Readonly<Record<SkyTime, string>>, moon: (now: number) => string) {
  var script = document.currentScript;
  var root = script && script.parentElement;
  if (!root) return;
  var time: SkyTime = "day";
  try {
    time = decide(Date.now(), zones);
  } catch (e) {
    time = "day";
  }
  root.setAttribute("data-d-time", time);
  var head = document.head;
  var meta = head.querySelector<HTMLMetaElement>('meta[name="theme-color"][data-d-time]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.setAttribute("data-d-time", "");
    head.insertBefore(meta, head.querySelector('meta[name="theme-color"]'));
  }
  meta.content = edge[time];
  var style = document.getElementById("d-time-boot");
  if (!style) {
    style = document.createElement("style");
    style.id = "d-time-boot";
    head.appendChild(style);
  }
  style.textContent = "html,body{background-color:" + edge[time] + "}";
  var phase = document.getElementById("d-moon-phase");
  if (!phase) {
    phase = document.createElement("style");
    phase.id = "d-moon-phase";
    head.appendChild(phase);
  }
  try {
    phase.textContent = moon(Date.now());
  } catch (e) {
    phase.textContent = "";
  }
}

/*
 * The zone table as the boot script carries it: the same places as SKY_ZONES, in less text (the page's HTML has a
 * budget, docs/ui-d-cinematic.md section 11). Groups of entries separated by "|": a group starts with its common
 * prefix alone ("America/"), then one entry per place, "<rest of the name> <latitude> <longitude>", followed by
 * every other name in the table with exactly the same coordinates (aliases, written in full). `unpackZones` turns it
 * back into the table, entry for entry: d-sky-boot.mjs checks the printed one equals zones.ts.
 */
function packZones(zones: Zones): string {
  const places = new Map<string, { name: string; also: string[] }>();
  for (const [name, at] of Object.entries(zones)) {
    const key = at.join(" ");
    const place = places.get(key);
    if (place) place.also.push(name);
    else places.set(key, { name, also: [] });
  }
  const groups = new Map<string, string[]>();
  for (const [key, { name, also }] of places) {
    const cut = name.lastIndexOf("/") + 1;
    const prefix = name.slice(0, cut);
    const entries = groups.get(prefix) ?? [];
    entries.push([name.slice(cut), key, ...also].join(" "));
    groups.set(prefix, entries);
  }
  return [...groups].map(([prefix, entries]) => [prefix, ...entries].join("|")).join("|");
}

/** The table back from `packZones`'s text. Printed into the boot script (ES5, self-contained). */
export function unpackZones(packed: string): Zones {
  var zones: Record<string, [number, number]> = {};
  var prefix = "";
  var entries = packed.split("|");
  for (var i = 0; i < entries.length; i++) {
    var parts = entries[i].split(" ");
    if (parts.length < 3) {
      prefix = parts[0];
      continue;
    }
    var at: [number, number] = [+parts[1], +parts[2]];
    zones[prefix + parts[0]] = at;
    for (var j = 3; j < parts.length; j++) zones[parts[j]] = at;
  }
  return zones;
}

/** The boot script's source. Built once per module load (DScope's `SKY_BOOT`); DScope prints it while the server renders. */
export function skyBootScript(): string {
  return (
    "(" +
    bootSky.toString() +
    ")(" +
    skyTimeAt.toString() +
    ",(" +
    unpackZones.toString() +
    ")(" +
    JSON.stringify(packZones(SKY_ZONES)) +
    ")," +
    JSON.stringify(SKY_EDGE) +
    "," +
    moonPhaseCss.toString() +
    ")"
  );
}

/** The state now, for DScope. */
export function skyTimeNow(): SkyTime {
  return skyTimeAt(Date.now(), SKY_ZONES);
}
