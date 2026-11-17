#!/usr/bin/env node
/*
 * The zone table of version D's sky clock (docs/ui-d-cinematic.md, section 4, "Day and night"): IANA time zone →
 * [latitude, longitude] of the zone's principal location, from the tz database's zone.tab (public domain), rounded
 * to 0.1°. The browser decides day or night from its time zone's place (components/d/sky/time.ts); this script
 * owns the table it reads, components/d/sky/zones.ts.
 *
 *   node frontend/scripts/d-sky-zones.mjs            print what the table holds (nothing is written)
 *   node frontend/scripts/d-sky-zones.mjs --ts       rewrite components/d/sky/zones.ts from this machine's zone.tab
 *   node frontend/scripts/d-sky-zones.mjs --check    change nothing; exit 1 if zones.ts differs from what --ts writes
 *   node frontend/scripts/d-sky-zones.mjs --hogql    print the two transform(properties.$timezone, …) lists (latitude,
 *                                                    longitude) that docs/ANALYTICS.md's look-of-an-event query uses
 *
 * Every mode exits 2 when /usr/share/zoneinfo/zone.tab is missing (or a zone below is not in it). --check compares
 * the table itself; a different tzdb version alone (the header's comment) is reported but does not fail. To add a
 * zone, add it to WORLD (or ALIASES) and run --ts. No dependencies.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TAB = "/usr/share/zoneinfo/zone.tab";
const VERSION = "/usr/share/zoneinfo/+VERSION";
const tsPath = fileURLToPath(new URL("../components/d/sky/zones.ts", import.meta.url));

if (!existsSync(TAB)) {
  console.error(`d-sky-zones: ${TAB} is missing; the table is made from it.`);
  process.exit(2);
}
const tzdb = existsSync(VERSION) ? readFileSync(VERSION, "utf8").trim() : "version unknown";

const tab = readFileSync(TAB, "utf8")
  .split("\n")
  .filter((l) => l && !l.startsWith("#"));
/** ±DDMM[SS] or ±DDDMM[SS] → degrees. */
const dms = (s) => {
  const sign = s[0] === "-" ? -1 : 1;
  const d = s.slice(1);
  const degLen = d.length === 4 || d.length === 6 ? 2 : 3;
  const deg = +d.slice(0, degLen);
  const min = +d.slice(degLen, degLen + 2);
  const sec = d.length > degLen + 2 ? +d.slice(degLen + 2) : 0;
  return sign * (deg + min / 60 + sec / 3600);
};
const coords = {};
const country = {};
for (const line of tab) {
  const [cc, c, zone] = line.split("\t");
  const m = /^([+-]\d+)([+-]\d+)$/.exec(c);
  if (!m) continue;
  coords[zone] = [Math.round(dms(m[1]) * 10) / 10, Math.round(dms(m[2]) * 10) / 10];
  country[zone] = cc;
}

/** Every US zone and territory, in zone.tab's order. */
const US = Object.keys(coords).filter((z) => /^(US|PR|GU|AS|VI|MP|UM)$/.test(country[z]));
/** The common world zones: every European capital, the large Asian, African, Oceanian and Latin American zones. */
const WORLD = `America/Toronto America/Vancouver America/Edmonton America/Winnipeg America/Halifax America/St_Johns America/Regina
America/Mexico_City America/Tijuana America/Cancun America/Monterrey America/Panama America/Guatemala America/Costa_Rica
America/El_Salvador America/Jamaica America/Havana America/Santo_Domingo America/Sao_Paulo America/Argentina/Buenos_Aires
America/Bogota America/Lima America/Santiago America/Caracas America/Montevideo America/La_Paz America/Guayaquil
Europe/London Europe/Dublin Europe/Lisbon Europe/Madrid Europe/Paris Europe/Brussels Europe/Amsterdam Europe/Berlin
Europe/Zurich Europe/Rome Europe/Vienna Europe/Prague Europe/Warsaw Europe/Budapest Europe/Stockholm Europe/Oslo
Europe/Copenhagen Europe/Helsinki Europe/Athens Europe/Istanbul Europe/Kyiv Europe/Bucharest Europe/Moscow Atlantic/Reykjavik
Africa/Lagos Africa/Cairo Africa/Johannesburg Africa/Nairobi Africa/Casablanca Africa/Accra Africa/Algiers
Asia/Dubai Asia/Riyadh Asia/Jerusalem Asia/Tehran Asia/Qatar Asia/Beirut Asia/Baghdad
Asia/Kolkata Asia/Karachi Asia/Dhaka Asia/Kathmandu Asia/Colombo Asia/Bangkok Asia/Jakarta Asia/Ho_Chi_Minh Asia/Singapore
Asia/Kuala_Lumpur Asia/Manila Asia/Hong_Kong Asia/Shanghai Asia/Taipei Asia/Seoul Asia/Tokyo Asia/Almaty Asia/Tashkent Asia/Yangon
Australia/Sydney Australia/Melbourne Australia/Brisbane Australia/Perth Australia/Adelaide Australia/Hobart Australia/Darwin
Pacific/Auckland Pacific/Fiji`.split(/\s+/);

/** Other names browsers may report for the same places (tz "backward" links and CLDR's older spellings). */
const ALIASES = {
  "US/Eastern": "America/New_York", "US/Central": "America/Chicago", "US/Mountain": "America/Denver", "US/Pacific": "America/Los_Angeles",
  "US/Alaska": "America/Anchorage", "US/Hawaii": "Pacific/Honolulu", "US/Arizona": "America/Phoenix", "US/Michigan": "America/Detroit",
  "US/East-Indiana": "America/Indiana/Indianapolis", "US/Indiana-Starke": "America/Indiana/Knox", "US/Aleutian": "America/Adak",
  "US/Samoa": "Pacific/Pago_Pago", "America/Indianapolis": "America/Indiana/Indianapolis", "America/Fort_Wayne": "America/Indiana/Indianapolis",
  "America/Louisville": "America/Kentucky/Louisville", "America/Knox_IN": "America/Indiana/Knox", "America/Shiprock": "America/Denver",
  "Navajo": "America/Denver", "America/Atka": "America/Adak", "Pacific/Johnston": "Pacific/Honolulu", "America/Virgin": "America/St_Thomas",
  "EST5EDT": "America/New_York", "CST6CDT": "America/Chicago", "MST7MDT": "America/Denver", "PST8PDT": "America/Los_Angeles",
  "EST": "America/New_York", "MST": "America/Phoenix", "HST": "Pacific/Honolulu",
  "America/Montreal": "America/Toronto", "Canada/Eastern": "America/Toronto", "Canada/Pacific": "America/Vancouver",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires", "Europe/Kiev": "Europe/Kyiv", "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu", "Asia/Saigon": "Asia/Ho_Chi_Minh", "Asia/Rangoon": "Asia/Yangon", "Asia/Tel_Aviv": "Asia/Jerusalem",
  "GB": "Europe/London", "Australia/ACT": "Australia/Sydney", "Australia/NSW": "Australia/Sydney",
};

const table = {};
for (const z of [...US, ...WORLD]) {
  if (!coords[z]) {
    console.error(`d-sky-zones: no coordinates for ${z} in ${TAB}`);
    process.exit(2);
  }
  table[z] = coords[z];
}
for (const [alias, target] of Object.entries(ALIASES)) {
  if (!table[target]) {
    console.error(`d-sky-zones: alias ${alias} points at ${target}, which is not in the table`);
    process.exit(2);
  }
  table[alias] = table[target];
}
const entries = Object.entries(table);
const summary = `${entries.length} zones (${US.length} US and territories, ${WORLD.length} world, ${Object.keys(ALIASES).length} aliases), tzdb ${tzdb}`;

const header = (version) => `/*
 * Where each time zone is, for the sky's clock (components/d/sky/time.ts): the principal location the tz
 * database gives the zone (zone.tab, tzdb ${version}, public domain), rounded to 0.1°. Every US zone and territory,
 * the common world zones, and the other names browsers report for them.
 * Generated by frontend/scripts/d-sky-zones.mjs --ts: do not edit by hand.
 */
`;
const body = `export const SKY_ZONES: Readonly<Record<string, readonly [number, number]>> = {\n${entries
  .map(([z, [a, b]]) => `  "${z}": [${a}, ${b}],`)
  .join("\n")}\n};\n`;

const mode = process.argv[2] || "";
if (mode === "--ts") {
  writeFileSync(tsPath, header(tzdb) + body);
  console.log(`d-sky-zones: wrote components/d/sky/zones.ts: ${summary}`);
} else if (mode === "--check") {
  const now = existsSync(tsPath) ? readFileSync(tsPath, "utf8") : "";
  const at = now.indexOf("export const SKY_ZONES");
  if (at < 0 || now.slice(at) !== body) {
    console.error(`d-sky-zones: components/d/sky/zones.ts is out of date with ${TAB} (${summary}). Run: node frontend/scripts/d-sky-zones.mjs --ts`);
    process.exit(1);
  }
  const was = /tzdb (\S+), public domain/.exec(now);
  const note = was && was[1] !== tzdb ? ` (its header says tzdb ${was[1]}; this machine has ${tzdb}, with the same places)` : "";
  console.log(`d-sky-zones: components/d/sky/zones.ts is up to date: ${summary}${note}`);
} else if (mode === "--hogql") {
  // One list of zone names, and the latitudes and longitudes in the same order (floats, so ClickHouse types the
  // arrays alike). Paste each transform() where docs/ANALYTICS.md's query takes the latitude and the longitude.
  const zones = `[${entries.map(([z]) => `'${z}'`).join(", ")}]`;
  const num = (n) => (Number.isInteger(n) ? n.toFixed(1) : String(n));
  const lats = `[${entries.map(([, [a]]) => num(a)).join(", ")}]`;
  const lons = `[${entries.map(([, [, b]]) => num(b)).join(", ")}]`;
  console.log(`-- latitude\ntransform(properties.$timezone, ${zones}, ${lats}, NULL)`);
  console.log(`-- longitude\ntransform(properties.$timezone, ${zones}, ${lons}, NULL)`);
} else {
  console.log(`d-sky-zones: ${summary}. Modes: --ts (write zones.ts), --check, --hogql.`);
}
