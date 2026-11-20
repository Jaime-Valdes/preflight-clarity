/*
 * Checks version D's airline on-time copy and lookup (shared/src/onTime.ts; docs/REAL_DATA.md,
 * "Status: airline on-time from BTS"). Run from the repo root:
 *
 *   npx tsx shared/scripts/check-on-time.ts        (also: npm run test -w shared)
 *
 * Every string D can show for the record (the figures, the not-available lines, the definition, the
 * credit, the period) passes the calm-copy rules: none of the banned words, no exclamation marks, no
 * "undefined" or "NaN"; the period reads "Oct 2025–Sep 2026"; the route part appears only with a route
 * figure; the lookup is case-blind and never invents a figure. The aggregation and the API are the
 * backend's tests. Exits non-zero on any failure.
 */
import {
  airlineOnTime,
  monthLabel,
  ON_TIME_DEFINITION,
  ON_TIME_NOT_AVAILABLE,
  ON_TIME_NOT_LOADED,
  onTimeDetail,
  onTimeMissing,
  onTimePeriod,
  onTimeSource,
  onTimeTeaser,
  type RouteOnTime,
} from "../src/onTime";

let failures = 0;
function check(ok: boolean, message: string): void {
  if (ok) return;
  failures += 1;
  console.error(`  FAIL ${message}`);
}

/** The calm-copy rule for every string in front of a nervous flyer. */
const BANNED = /\b(fear\w*|risk\w*|danger\w*|warning\w*|severe\w*|scared|scary|unsafe|alarm\w*|worr(?:y|ies|ied|ying)|late)\b/i;

function checkCopy(tag: string, text: string): void {
  const m = BANNED.exec(text);
  check(!m, `${tag}: banned word "${m?.[0]}" in "${text}"`);
  check(!text.includes("!") && !/undefined|NaN|null|\[object/.test(text), `${tag}: bad text "${text}"`);
  check(text.trim() === text && text.length > 0, `${tag}: untrimmed or empty "${text}"`);
}

const block: RouteOnTime = {
  source: "bts",
  from: "2025-10",
  to: "2026-09",
  industry: { pct: 77.4, flights: 6_900_000 },
  carriers: { AA: { pct: 76.6, flights: 900_000 }, DL: { pct: 83.5, flights: 950_000 } },
  routes: { "JFK-LAX": { DL: { pct: 81.2, flights: 2_900 } } },
};

const both = airlineOnTime(block, "dl", "jfk", "lax");
const networkOnly = airlineOnTime(block, "AA", "JFK", "LAX");
const none = airlineOnTime(block, "BA", "JFK", "LAX");
const reverse = airlineOnTime(block, "DL", "LAX", "JFK");

check(JSON.stringify(both) === JSON.stringify({ network: 84, route: 81, industry: 77, period: "Oct 2025–Sep 2026" }), `both: ${JSON.stringify(both)}`);
check(networkOnly?.network === 77, `network only: ${JSON.stringify(networkOnly)}`);
check(networkOnly?.route === null, "a carrier without a route figure gets none");
check(none?.network === null && none.route === null, `a carrier BTS has no figure for: ${JSON.stringify(none)}`);
check(reverse?.route === null, "a route figure is for one direction");
check(airlineOnTime(null, "DL", "JFK", "LAX") === null, "no figures at all: null");

check(monthLabel("2025-10") === "Oct 2025" && monthLabel("2026-01") === "Jan 2026" && monthLabel("x") === "x", "monthLabel");
check(onTimePeriod("2025-10", "2026-09") === "Oct 2025–Sep 2026", "the period");
check(onTimePeriod("2026-09", "2026-09") === "Sep 2026", "a one-month period");
check(onTimeSource("Oct 2025–Sep 2026") === "On-time: US DOT, BTS · Oct 2025–Sep 2026", "the credit");
check(onTimeTeaser(both) === "84% on time, Oct 2025–Sep 2026", `teaser ${onTimeTeaser(both)}`);
check(onTimeTeaser(none) === ON_TIME_NOT_AVAILABLE.main && onTimeTeaser(null) === ON_TIME_NOT_AVAILABLE.main, "teaser without a figure");
check(onTimeDetail(both!) === "Across the airline’s US flights · 81% on this route", `detail ${onTimeDetail(both!)}`);
check(onTimeDetail(networkOnly!) === "Across the airline’s US flights", "no route line without a route figure");
check(onTimeMissing(none) === ON_TIME_NOT_AVAILABLE && onTimeMissing(null) === ON_TIME_NOT_LOADED, "which not-available copy");

const strings: Array<[string, string]> = [
  ["definition", ON_TIME_DEFINITION],
  ["source", onTimeSource(both!.period)],
  ["teaser", onTimeTeaser(both)],
  ["teaser none", onTimeTeaser(none)],
  ["detail", onTimeDetail(both!)],
  ["detail network only", onTimeDetail(networkOnly!)],
  ...Object.entries(ON_TIME_NOT_AVAILABLE).map(([k, v]): [string, string] => [`not available ${k}`, v]),
  ...Object.entries(ON_TIME_NOT_LOADED).map(([k, v]): [string, string] => [`not loaded ${k}`, v]),
];
for (const [tag, text] of strings) checkCopy(tag, text);

if (failures > 0) {
  console.error(`\n${failures} on-time check(s) failed.`);
  process.exit(1);
}
console.log(`On-time checks passed (${strings.length} strings).`);
