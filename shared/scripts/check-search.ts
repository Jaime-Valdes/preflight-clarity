/*
 * Checks version C's search (shared/src/search.ts) against docs/VERSION_C.md,
 * "Data contract". Run from the repo root:
 *
 *   npx tsx shared/scripts/check-search.ts        (also: npm run test -w shared)
 *
 * Nonstop service (only routes an airline would plausibly fly nonstop get flights,
 * docs/FEASIBILITY.md), schedule plausibility and counts by market, unique keys /
 * numbers / ids, full dashboard flights with the feasibility rules (crew from the
 * rules, fleet ages, one seat map per airline and model, no pilot profiles), shared
 * facts (airborne time, route history, weather by hour, bumps by air block), published
 * block times (one per flight number and season), fares (calibration against published
 * one-way economy ranges, price points, the lead-time curve of fareAt, weekday and holiday
 * demand, time of day, no link to the smoothness score), determinism, caching, A/B
 * safety and the speed budget. Exits non-zero on any
 * failure; prints the numbers the UI cares about.
 */
import { createHash } from "node:crypto";
import { FARE_REFERENCE_LEAD_DAYS, dayOverview, fareAt, findOption, hasNonstopService, optionKey, searchFlights, type SearchResults } from "../src/search";
import { departWindowOf, generateFlight, normalizeInput, routeDay, type RouteDay } from "../src/fakeFlight";
import { AIRLINES, LISTED_NONSTOPS, ULTRA_LONG_MI, ZONES, getAirline, isRetiredFlightNumber } from "../src/airlines";
import { cabinConfigFor, getAircraftModel } from "../src/aircraft";
import { AIRPORTS, getAirport, greatCircleMi } from "../src/airports";
import { addDays, timeToMinutes, weekdayIndex } from "../src/dates";
import { createRng, hashId } from "../src/random";
import type { CrewInfo, DepartWindow, Flight, FlightInput, FlightPhase, FlightPrefs } from "../src/types";

let failures = 0;
let warnings = 0;
const failed = new Map<string, number>();
function check(ok: boolean, message: string): void {
  if (ok) return;
  failures += 1;
  // Print the first few of each kind; count the rest.
  const kind = message.replace(/^[^:]*: /, "").replace(/[\d.]+/g, "#").slice(0, 60);
  const seen = (failed.get(kind) ?? 0) + 1;
  failed.set(kind, seen);
  if (seen <= 3) console.error(`  FAIL ${message}`);
}
function warn(message: string): void {
  warnings += 1;
  if (warnings <= 10) console.warn(`  warn ${message}`);
}

const pct = (n: number, d: number) => `${d > 0 ? Math.round((100 * n) / d) : 0}%`;
const mean = (xs: readonly number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const quantile = (xs: readonly number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length > 0 ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : 0;
};
function pearson(xs: readonly number[], ys: readonly number[]): number {
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
}

// ── A/B safety, part 1: generateFlight is byte-identical to the study's ─────
//
// Variants A and B are a running study: version C must not change what they show. These
// 329 flights (long-haul, oceanic, perimeter and typed routes, dates across the year, empty
// prefs and every departWindow / bodyType / airline) hash to what the study's generator
// produces. Only a deliberate A/B change may update the constant, and it says so here:
//  - 2026-10-15, version C: the generator as it was before version C existed
//    (f5bcd91f0ae2435867f8913d70aa23eb18c96927783654832d08ca992acd812d).
//  - 2026-10-15, feasibility rules (docs/FEASIBILITY.md) — a deliberate A/B change: crew from
//    the rules instead of pilot profiles, fleet ages (following each type's production years)
//    instead of maintenance records, each airline's own cabin and seat map per model, sound
//    timings on a 5-minute grid with type-level wording, neutral weather notes, the seatbelt sign
//    only for moderate stretches, one on-time figure per airline and route, verifiable model
//    facts, and route histories that count about as many past flights as the route's daily
//    nonstops allow (0e5088d2b8429659271b573de4b7312d6ea5dc5d7f142e3c05ae6ff84a798257).
//  - 2026-10-16, QA (no invented nonstops): the nonstop rule only lets listed real routes fly beyond
//    ULTRA_LONG_MI and sends long-haul flights only where each carrier's network goes, so the route
//    history counts past flights from fewer daily nonstops on some long-haul routes (JFK–HKG ~410 →
//    ~240). Only `turbulence.history.flightsAnalyzed` changes; every other A/B field is identical.

const AB_SNAPSHOT = "62ae1fb9b4b4de693d91118c21698e04bf467249638f14aabfcaaf7943219a21";
const SNAPSHOT_ROUTES: Array<[string, string]> = [
  ["JFK", "LAX"], ["LAX", "JFK"], ["JFK", "BOS"], ["LGA", "ORD"], ["LGA", "BOS"], ["EWR", "MCO"], ["SFO", "DEN"],
  ["DEN", "ATL"], ["SEA", "HNL"], ["DFW", "PHX"], ["MIA", "SJU"], ["BOS", "SFO"], ["YYZ", "YVR"], ["ORD", "MEX"],
  ["ATL", "CUN"], ["JFK", "LHR"], ["LHR", "JFK"], ["BOS", "DUB"], ["LHR", "CDG"], ["FRA", "FCO"], ["AMS", "BCN"],
  ["MAD", "LIS"], ["CDG", "MXP"], ["ARN", "HEL"], ["KEF", "JFK"], ["LHR", "DXB"], ["DXB", "DEL"], ["DEL", "BOM"],
  ["SIN", "SYD"], ["HND", "KIX"], ["HKG", "TPE"], ["ICN", "SFO"], ["SFO", "NRT"], ["JFK", "SIN"], ["SYD", "AKL"],
  ["JNB", "CPT"], ["NBO", "ADD"], ["CMN", "CDG"], ["GRU", "EZE"], ["BOG", "MIA"], ["LAX", "SYD"], ["SIN", "JFK"],
  ["PER", "LHR"], ["JFK", "SYD"], ["JFK", "HKG"], ["LGA", "LAX"], ["LGA", "DEN"], ["DCA", "LAX"], ["DCA", "LHR"],
  ["DCA", "BOS"], ["ATL", "MCO"], ["ORD", "LGA"], ["SFO", "LAX"], ["LAS", "LAX"], ["HNL", "OGG"], ["IAH", "EWR"],
  ["New York", "Los Angeles"], ["Boise", "Seattle"], ["boise, id", "Chicago (ORD)"], ["Portland, Maine", "JFK"],
  ["Fargo", "Orlando"], ["Timbuktu", "Shangri-La"], ["Paris", "Tokyo"], ["JFK", "JFK"], [" sfo ", "  Lhr"],
  ["São Paulo", "Lisbon"],
];
const SNAPSHOT_DATES = ["2026-10-20", "2026-12-05", "2027-02-14", "2027-04-30", "2027-07-09", "2027-09-23"];
const SNAPSHOT_PREFS: FlightPrefs[] = [
  { departWindow: "morning" }, { departWindow: "afternoon" }, { departWindow: "evening" }, { bodyType: "wide" },
  { airline: "DL" }, { airline: "LH" }, { bodyType: "wide", departWindow: "morning" }, { airline: "BA", departWindow: "evening" },
  { airline: "AA", bodyType: "wide", departWindow: "afternoon" },
];
const snapshotLines: string[] = [];
let snapshotIndex = 0;
SNAPSHOT_ROUTES.forEach(([origin, destination], i) => {
  SNAPSHOT_DATES.forEach((date, j) => {
    const list = [{}, SNAPSHOT_PREFS[(i + j) % 9], SNAPSHOT_PREFS[(i * 3 + j * 5 + 4) % 9], ...(i < 12 && j < 2 ? SNAPSHOT_PREFS : [])];
    const seen = new Set<string>();
    for (const prefs of list) {
      const key = `${origin}|${destination}|${date}|${JSON.stringify(prefs)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (snapshotIndex++ % 4 !== 0) continue;
      const hash = createHash("sha256").update(JSON.stringify(generateFlight({ origin, destination, date }, prefs))).digest("hex");
      snapshotLines.push(`${key}=${hash}`);
    }
  });
});
const abSnapshot = createHash("sha256").update(snapshotLines.join("\n")).digest("hex");
check(
  snapshotLines.length === 329 && abSnapshot === AB_SNAPSHOT,
  `A/B: generateFlight output changed for the study (${snapshotLines.length} flights, hash ${abSnapshot}) — only a deliberate A/B change may update AB_SNAPSHOT, with a line above saying why`,
);

// ── A/B safety, part 2: generateFlight before any search ────────────────────

const AB_INPUTS: FlightInput[] = [
  { origin: "JFK", destination: "LAX", date: "2026-11-26" },
  { origin: "LGA", destination: "BOS", date: "2026-12-03" },
  { origin: "SFO", destination: "NRT", date: "2027-01-12" },
  { origin: "LHR", destination: "JFK", date: "2027-06-20" },
  { origin: "LGA", destination: "LAX", date: "2026-11-26" },
  { origin: "DEL", destination: "BOM", date: "2027-07-11" },
  { origin: "Fargo", destination: "Orlando", date: "2027-07-04" },
];
const abBefore = AB_INPUTS.map((i) => JSON.stringify([generateFlight(i), generateFlight(i, { departWindow: "evening" }), generateFlight(i, { bodyType: "wide" })]));

// ── Starter checks (the lead's) ─────────────────────────────────────────────

const coldStart = performance.now();
searchFlights({ origin: "JFK", destination: "LAX", date: "2026-11-26" });
const firstCallMs = performance.now() - coldStart;

const QUERIES = [
  { origin: "JFK", destination: "LAX", date: "2026-11-26" },
  { origin: "SFO", destination: "NRT", date: "2027-01-12" },
  { origin: "LGA", destination: "BOS", date: "2026-12-03" },
  { origin: "LHR", destination: "JFK", date: "2027-06-20" },
];

for (const q of QUERIES) {
  const tag = `${q.origin}-${q.destination} ${q.date}`;
  const a = searchFlights(q);
  const b = searchFlights({ ...q });
  check(a.options.length >= 2, `${tag}: at least 2 options`);
  check(JSON.stringify(a) === JSON.stringify(b), `${tag}: deterministic`);
  const keys = a.options.map((o) => o.key);
  check(new Set(keys).size === keys.length, `${tag}: unique keys`);
  check(new Set(a.options.map((o) => o.flight.id)).size === keys.length, `${tag}: unique flight ids`);
  for (const o of a.options) {
    check(o.key === optionKey(o.flight), `${tag}: key matches flight number`);
    check(Number.isInteger(o.fareUsd) && o.fareUsd >= 39, `${tag}: fare is a whole number ≥ 39`);
    check(o.flight.alternatives.length === 0, `${tag}: no alternatives on C flights`);
    check(findOption(q, o.key) === o, `${tag}: findOption round-trip`);
    check(findOption(q, o.flight.flightNumber.toLowerCase()) === o, `${tag}: findOption takes "dl 1423"`);
  }
  check(findOption(q, "ZZ9999") === null, `${tag}: findOption of an unknown key is null`);
  const sorted = [...a.options].sort((x, y) => x.flight.departTime.localeCompare(y.flight.departTime));
  check(sorted.every((o, i) => o === a.options[i]), `${tag}: options by departure time`);
  const day = dayOverview(q, q.date);
  check(day.count === a.options.length, `${tag}: overview count`);
}

// ── The sample ──────────────────────────────────────────────────────────────

type Market = "busy" | "ordinary" | "long";
const MARKET_COUNTS: Record<Market, readonly [number, number]> = { busy: [8, 14], ordinary: [4, 8], long: [2, 5] };

/** Routes whose market the contract makes obvious. */
const KNOWN_MARKETS: Record<string, Market> = {
  "JFK-LAX": "busy", "LAX-JFK": "busy", "LGA-BOS": "busy", "LGA-ORD": "busy", "ATL-MCO": "busy", "SFO-LAX": "busy",
  "DEN-SFO": "busy", "LHR-CDG": "busy", "FRA-FCO": "busy", "HND-KIX": "busy", "DEL-BOM": "busy", "JNB-CPT": "busy",
  "HKG-TPE": "busy", "BOS-SFO": "busy",
  "ATL-CUN": "ordinary", "BUF-ORD": "ordinary", "BOI-SEA": "ordinary", "RDU-BOS": "ordinary", "SAV-ATL": "ordinary", "PWM-JFK": "ordinary",
  "JFK-LHR": "long", "LHR-JFK": "long", "SFO-NRT": "long", "NRT-SFO": "long", "JFK-SIN": "long", "SIN-JFK": "long", "LAX-SYD": "long",
  "SYD-LAX": "long", "LHR-DXB": "long", "BOS-DUB": "long", "PER-LHR": "long", "JFK-HKG": "long", "SIN-SYD": "long",
  "DEN-HNL": "long",
};
// (JFK-SYD left the list with the nonstop rule: nobody flies it nonstop — it is in UNSERVED below.)

/** Version C's home-page routes (frontend/components/c/search/HomeSearch.tsx): they must have flights. */
const C_HOME_ROUTES: Array<[string, string]> = [
  ["JFK", "LAX"], ["LGA", "BOS"], ["ORD", "DEN"], ["ATL", "MCO"], ["LAX", "SFO"], ["SEA", "HNL"], ["JFK", "LHR"], ["SFO", "NRT"],
];

/**
 * Pairs nobody flies nonstop: one metro area or a short drive, small cities far from any hub, distances
 * no airline flies nonstop, long-haul markets outside every carrier's network, typed (made-up) airports,
 * the same airport twice.
 */
const UNSERVED: Array<[string, string]> = [
  ["JFK", "LGA"], ["JFK", "EWR"], ["SFO", "OAK"], ["SFO", "SJC"], ["DCA", "IAD"], ["ORD", "MDW"], ["DFW", "DAL"], ["IAH", "HOU"],
  ["LHR", "LGW"], ["CDG", "ORY"], ["HND", "NRT"], ["MIA", "FLL"], ["JFK", "PHL"], ["DXB", "AUH"], ["HKG", "SZX"],
  ["BTV", "DPS"], ["ROC", "KTM"], ["TUS", "BOI"], ["BUF", "ROC"], ["OMA", "DSM"], ["GEG", "BOI"], ["LAX", "BTV"], ["SEA", "PWM"],
  ["MIA", "GEG"], ["HNL", "BTV"], ["LHR", "BOI"], ["JFK", "KTM"], ["SIN", "ATL"], ["SYD", "MIA"],
  ["JFK", "SYD"], ["LHR", "SYD"], ["LHR", "AKL"], ["JFK", "MEL"], ["MNL", "EZE"],
  // Ultra-long pairs the old hub-and-size rule invented (QA 2026-10-16), and long-haul markets a carrier's network doesn't reach.
  ["DEL", "GDL"], ["ADD", "MEX"], ["CGK", "SLC"], ["BKK", "CLT"], ["DXB", "GDL"], ["KUL", "YUL"], ["DCA", "SGN"], ["BOG", "MEL"], ["MAD", "PER"],
  ["SFO", "ADD"], ["IST", "MEL"], ["LAX", "BLR"], ["BER", "LIM"], ["BOS", "PEK"], ["ADD", "MIA"], ["CAN", "YYZ"], ["LIS", "HKG"], ["GDL", "NRT"],
  ["RAK", "LAX"], ["NBO", "ICN"], ["CPH", "CGK"], ["GDL", "MAD"], ["CAI", "GRU"], ["MNL", "DEL"], ["SFO", "GRU"], ["SEA", "LIM"], ["LGW", "DEL"],
  ["ZRH", "BNA"], ["ICN", "DEN"], ["MXP", "YYC"],
  ["Fargo", "Orlando"], ["Timbuktu", "Shangri-La"], ["JFK", "JFK"],
];

/** Real long-haul nonstops the hub, network and size rules must keep, with carriers that must be among those flying them. */
const REAL_LONG_HAUL: Readonly<Record<string, readonly string[]>> = {
  "JFK-LHR": ["DL", "AA", "BA", "VS"], "BOS-DUB": ["EI", "DL"], "SFO-NRT": ["UA", "NH", "JL"], "SFO-HND": ["UA", "NH", "JL"], "ORD-HND": ["UA", "NH", "JL"],
  "LAX-HND": ["DL", "AA", "NH", "JL"], "DFW-HND": ["AA", "JL"], "SEA-ICN": ["DL", "KE"], "ICN-SFO": ["KE", "UA"], "SEA-TPE": ["DL", "BR"], "YVR-HKG": ["AC", "CX"],
  "HKG-SEA": ["CX"], "DOH-YUL": ["QR"], "IST-IAH": ["TK"], "LIM-CDG": ["AF"], "FRA-SIN": ["LH", "SQ"], "HKG-LHR": ["CX", "BA"], "BKK-LHR": ["TG", "BA"],
  "SGN-CDG": ["VN", "AF"], "PEK-LAX": ["CA"], "TPE-AMS": ["BR"], "KUL-SYD": ["MH"], "CGK-HND": ["GA"], "SYD-HND": ["QF", "NH", "JL"], "AKL-NRT": ["NZ"],
  "MNL-HNL": ["PR"], "HEL-NRT": ["AY"], "WAW-ICN": ["LO"], "VIE-NRT": ["OS"], "FCO-HND": ["AZ"], "ZRH-BKK": ["LX"], "CPH-HND": ["SK"], "DEL-NRT": ["NH", "JL"],
  "LHR-DEL": ["BA", "VS"], "DXB-LHR": ["EK", "BA"], "TLV-JFK": ["LY"], "CMN-JFK": ["AT"], "CAI-JFK": ["MS"], "ADD-GRU": ["ET"], "GRU-JNB": ["LA", "SA"],
  "LIS-GRU": ["TP", "LA"], "MAD-MIA": ["IB", "AA"], "MEX-MAD": ["AM", "IB"], "BOG-MAD": ["AV", "IB"], "MIA-GRU": ["AA", "LA"], "ATL-GRU": ["DL"],
  "EWR-GRU": ["UA"], "YYZ-GRU": ["AC"], "IAH-LIM": ["UA"], "JFK-EZE": ["AR"],
};

const ROUTES: Array<[string, string]> = [
  // Busy markets
  ["JFK", "LAX"], ["LAX", "JFK"], ["LGA", "BOS"], ["LGA", "ORD"], ["ATL", "MCO"], ["SFO", "LAX"], ["DEN", "SFO"], ["DFW", "PHX"],
  ["SEA", "HNL"], ["BOS", "SFO"], ["MIA", "SJU"], ["YYZ", "YVR"], ["HND", "KIX"], ["DEL", "BOM"], ["JNB", "CPT"], ["LHR", "CDG"],
  ["FRA", "FCO"], ["AMS", "BCN"], ["HKG", "TPE"], ["SYD", "AKL"], ["GRU", "EZE"], ["ORD", "MEX"], ["CMN", "CDG"],
  // Ordinary markets
  ["ATL", "CUN"], ["BUF", "ORD"], ["BOI", "SEA"], ["RDU", "BOS"], ["SAV", "ATL"], ["PWM", "JFK"], ["DXB", "DEL"], ["NBO", "ADD"],
  // Long-haul and oceanic
  ["JFK", "LHR"], ["LHR", "JFK"], ["SFO", "NRT"], ["NRT", "SFO"], ["JFK", "SIN"], ["SIN", "JFK"], ["LAX", "SYD"], ["SYD", "LAX"],
  ["LHR", "DXB"], ["DXB", "LHR"], ["BOS", "DUB"], ["BOG", "MIA"], ["PER", "LHR"], ["JFK", "HKG"], ["SIN", "SYD"], ["DEN", "HNL"],
  ["EZE", "MAD"], ["LHR", "ACC"],
  // Perimeter airports (a long LaGuardia / National trip leaves from JFK / Dulles)
  ["LGA", "LAX"], ["DCA", "LAX"], ["DCA", "LHR"], ["LGA", "DEN"], ["DCA", "BOS"],
  // Typed text (the UI only sends catalogue codes, but the API takes anything generateFlight does)
  ["New York", "Los Angeles"],
];

/** A year from "today" (2026-10-15): Saturdays, daylight-saving changes (US, EU, Australia), IATA season edges. */
const DATES = [
  "2026-10-17", "2026-10-25", "2026-11-01", "2026-11-26", "2026-12-24", "2027-01-15", "2027-02-14", "2027-03-14",
  "2027-03-28", "2027-04-04", "2027-05-22", "2027-07-09", "2027-08-21", "2027-09-23", "2027-10-03",
];

const CURFEW: Record<string, [number, number]> = { SYD: [23, 6], FRA: [23, 5], ZRH: [23.5, 6], LHR: [23.5, 4.5] };
const ALL_NIGHT = new Set(["DXB", "DOH", "AUH", "IST", "SIN", "KUL", "BKK"]);
const FORBIDDEN =
  /\b(crash\w*|danger\w*|severe\w*|emergenc\w*|warning\w*|fatal\w*|accident\w*|incident\w*|death\w*|die|dies|died|dying|risk\w*)\b/i;
const DISCOURAGED = /\b(storm\w*|thunder\w*|lightning|fail\w*|plunge\w*|stall\w*|fear\w*|panic\w*|scary|alarm\w*|violent\w*|rough)\b/i;
const PHASES: FlightPhase[] = ["takeoff", "climb", "cruise", "descent", "landing"];

const EASA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH",
]);
const NATIONAL_REGULATORS: Record<string, string> = {
  CA: "Transport Canada", AU: "CASA", NZ: "CAA New Zealand", SG: "CAAS", JP: "JCAB", AE: "GCAA", IN: "DGCA",
};

/** Independent restatement of the crew rule: relief pilots by scheduled block time, the rule set by the airline's country. */
function expectedCrew(airlineCountry: string, blockMin: number): CrewInfo {
  const pilots: CrewInfo["pilots"] = blockMin > 12.5 * 60 ? 4 : blockMin > 8.5 * 60 ? 3 : 2;
  if (airlineCountry === "US") return { pilots, regime: "faa", regulator: "FAA" };
  if (airlineCountry === "GB") return { pilots, regime: "easa", regulator: "UK CAA" };
  if (EASA_COUNTRIES.has(airlineCountry)) return { pilots, regime: "easa", regulator: "EASA" };
  return { pilots, regime: "icao", regulator: NATIONAL_REGULATORS[airlineCountry] ?? "the national aviation authority" };
}

/** Pilot-profile and maintenance-record fields: never anywhere in a Flight. */
const IMPOSSIBLE_KEYS = new Set([
  "captain", "firstOfficer", "pilot", "initials", "rating", "ratingCount", "totalHours", "hoursOnType", "yearsFlying",
  "timesOnRoute", "base", "background", "badges", "lastInspectionDaysAgo", "lastCheckType", "nextCheckDueDays", "maintenanceStatus",
]);
const PILOT_PROFILE_PATTERN =
  /\b(based in|passengers? mention|passenger ratings?|\d{1,3}(,\d{3})+ (flight )?hours|\d{3,} (flight )?hours|hours on (type|the)|years flying|times on this route|smooth landings|clear announcements|calm voice|former flight instructor|check pilot)\b/i;
const NAMED_PILOT = /\b(Capt\. [A-Z]|Captain [A-Z][a-z]|First Officer [A-Z][a-z])/;
/** Version C never assumes the reader is on the flight. */
const YOUR_FLIGHT = /\byour (flight|departure|arrival|pilots?|plane|aircraft)\b/i;

function keysOf(value: unknown, path: string, out: Array<[string, string]>): void {
  if (Array.isArray(value)) value.forEach((v, i) => keysOf(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push([`${path}.${k}`, k]);
      keysOf(v, `${path}.${k}`, out);
    }
  }
}

/** One seat map per airline and model, across every C flight in the run. */
const SEAT_GEOMETRY = new Map<string, string>();

/** Independent restatement of the contract's market rule (see search.ts marketOf). */
function marketFor(day: RouteDay): Market {
  if (day.oceanic || day.distanceMi > 3000 || (!day.domestic && day.distanceMi > 2600)) return "long";
  const needsWide = !day.narrowOnly && (day.oceanic || day.distanceMi >= 2800);
  const wide = day.carriers.filter((c) => c.wide);
  const carriers = needsWide && wide.length > 0 ? wide : day.carriers;
  const hubAt = (code: string) => carriers.some((c) => c.airline.hubs.includes(code));
  return hubAt(day.origin.code) && hubAt(day.destination.code) ? "busy" : "ordinary";
}

/** Two-hour air blocks on odd hours: 05–07, 07–09, … 23–01. */
const blockOf = (time: string) => Math.floor((timeToMinutes(time) - 60) / 120);

function stringsOf(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => stringsOf(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value as Record<string, unknown>)) stringsOf(v, `${path}.${k}`, out);
}

const weatherFacts = (w: Flight["weather"]["origin"]) =>
  JSON.stringify([w.condition, w.label, w.tempC, w.tempF, w.windKts, w.windDir, w.gustKts, w.visibilityMi, w.precipPct, w.impact]);
const windowsOf = (f: Flight) => JSON.stringify(f.turbulence.windows.map((w) => [w.phase, w.startMin, w.durationMin, w.intensity]));

/** The dashboard renders every section from these: the same shape rules as the A/B generator's checks. */
function checkFlightShape(tag: string, f: Flight): void {
  check(f.distanceMi >= 120 && f.distanceMi <= 12000, `${tag}: distance ${f.distanceMi}`);
  check(f.airborneMin >= 30 && f.airborneMin <= 1200, `${tag}: airborne ${f.airborneMin}`);
  check(/^\d{2}:\d{2}$/.test(f.departTime) && /^\d{2}:\d{2}$/.test(f.arriveTime), `${tag}: time format`);
  check([-1, 0, 1, 2].includes(f.arriveDayOffset), `${tag}: day offset ${f.arriveDayOffset}`);
  check(f.terminal.length > 0 && /^[A-Z]\d{1,2}$/.test(f.gate), `${tag}: terminal/gate ${f.terminal} ${f.gate}`);

  // The scheduled type with the airline's fleet ages (known any time) and the assigned airframe within them.
  const ac = f.aircraft;
  check(ac.ageYears >= 0.8 && ac.ageYears <= 36 && ac.deliveredYear >= ac.modelInServiceSince, `${tag}: aircraft age ${ac.ageYears}`);
  const model = getAircraftModel(ac.model);
  const ended = model?.productionEnded;
  check(ended === undefined || ac.deliveredYear <= ended, `${tag}: ${ac.model} delivered after production ended`);
  check(!/MAX/i.test(ac.model) && ac.safetyRecord.length >= 3 && /^[A-Z0-9-]{4,}$/.test(ac.tailNumber), `${tag}: aircraft facts`);
  const [youngest, oldest] = ac.fleetAgeRange;
  check(youngest <= ac.ageYears && ac.ageYears <= oldest && youngest <= ac.fleetAvgAgeYears && ac.fleetAvgAgeYears <= oldest, `${tag}: ages ${ac.ageYears} / avg ${ac.fleetAvgAgeYears} vs fleet ${youngest}–${oldest}`);
  for (const key of ["lastInspectionDaysAgo", "lastCheckType", "nextCheckDueDays", "maintenanceStatus"]) check(!(key in ac), `${tag}: maintenance field ${key}`);

  // Who flies it: the rules, never a profile.
  check(JSON.stringify(f.crew) === JSON.stringify(expectedCrew(f.airline.country, f.blockMin)), `${tag}: crew ${JSON.stringify(f.crew)} vs the rules`);
  const keys: Array<[string, string]> = [];
  keysOf(f, "flight", keys);
  for (const [path, key] of keys) check(!IMPOSSIBLE_KEYS.has(key), `${tag}: impossible field at ${path}`);

  const t = f.turbulence;
  check(t.points[0]?.minute === 0 && t.points[t.points.length - 1]?.minute === f.airborneMin && t.points.length >= 7, `${tag}: points span`);
  for (let i = 1; i < t.points.length; i++) {
    const step = t.points[i].minute - t.points[i - 1].minute;
    if (!(step > 0 && (step === 5 || i === t.points.length - 1))) {
      check(false, `${tag}: point spacing at ${t.points[i].minute}`);
      break;
    }
  }
  check(t.points.every((p) => p.level >= 0 && p.level <= 2), `${tag}: point level out of range`);
  check(t.phases.length === 5 && t.phases.every((p, i) => p.phase === PHASES[i]), `${tag}: phases order`);
  check(t.phases[0].startMin === 0 && t.phases[4].endMin === f.airborneMin, `${tag}: phase bounds`);
  for (let i = 1; i < 5; i++) check(t.phases[i].startMin === t.phases[i - 1].endMin && t.phases[i].endMin > t.phases[i].startMin, `${tag}: phases contiguous`);
  for (const ph of t.phases) {
    const peak = Math.max(0, ...t.points.filter((p) => p.phase === ph.phase).map((p) => p.level));
    check(ph.intensity === (peak < 0.5 ? "none" : peak < 1.5 ? "light" : "moderate"), `${tag}: ${ph.phase} intensity vs points`);
    check(ph.note.length > 10, `${tag}: ${ph.phase} note`);
  }
  check(t.windows.length <= 3 && t.windows.filter((w) => w.intensity === "moderate").length <= 1, `${tag}: windows count`);
  t.windows.forEach((w, i) => {
    const phase = t.phases.find((p) => p.phase === w.phase)!;
    check(w.phase !== "takeoff" && w.phase !== "landing" && w.startMin >= phase.startMin && w.startMin + w.durationMin < phase.endMin, `${tag}: window not inside its phase`);
    if (i > 0) check(w.startMin >= t.windows[i - 1].startMin + t.windows[i - 1].durationMin, `${tag}: windows overlap`);
    check(w.label.startsWith(w.intensity === "moderate" ? "Moderate bumps possible" : "Light bumps likely"), `${tag}: label "${w.label}"`);
    check(w.typicalLabel.startsWith("On flights like this one,") && w.cause.endsWith("."), `${tag}: window wording`);
    if (w.intensity === "moderate") check(w.seatbeltSign, `${tag}: moderate window without seatbelt sign`);
    const inside = t.points.filter((p) => p.minute >= w.startMin && p.minute <= w.startMin + w.durationMin);
    const peak = Math.max(...inside.map((p) => p.level));
    check(w.intensity === "moderate" ? peak >= 1.5 : peak >= 0.5 && peak < 1.5, `${tag}: window peak ${peak} for ${w.intensity}`);
    // Bumps drawn in the block's air are worded for this flight's own weather card.
    const clearish = (c: string) => c === "clear" || c === "mostly_clear" || c === "breezy";
    const cloudy = /cloud|shower/i.test(w.cause);
    if (w.phase === "climb" && clearish(f.weather.origin.condition)) check(!cloudy, `${tag}: climb cause "${w.cause}" but origin is ${f.weather.origin.condition}`);
    if (w.phase === "descent" && clearish(f.weather.destination.condition)) check(!cloudy, `${tag}: descent cause "${w.cause}" but destination is ${f.weather.destination.condition}`);
  });
  const cruiseCauses = t.windows.filter((w) => w.phase === "cruise").map((w) => w.cause);
  check(new Set(cruiseCauses).size === cruiseCauses.length, `${tag}: two cruise windows share a cause`);
  const expectedMax = t.windows.some((w) => w.intensity === "moderate") ? "moderate" : t.windows.length > 0 ? "light" : "none";
  check(t.maxIntensity === expectedMax && t.smoothMinutesPct >= 0 && t.smoothMinutesPct <= 100, `${tag}: maxIntensity / smooth share`);
  check(t.history.smoothPct >= 72 && t.history.smoothPct <= 96 && t.history.flightsAnalyzed >= 180 && t.history.flightsAnalyzed % 10 === 0, `${tag}: history ranges`);

  const s = f.smoothness;
  check(s.score >= 58 && s.score <= 97, `${tag}: score ${s.score}`);
  check(s.label === (s.score >= 88 ? "Very smooth" : s.score >= 75 ? "Mostly smooth" : "Some bumps expected"), `${tag}: label ${s.label} for ${s.score}`);
  check(/moderate/i.test(s.summary) === t.windows.some((w) => w.intensity === "moderate"), `${tag}: summary vs moderate window`);
  check(t.windows.length === 0 ? /smooth flight/i.test(s.summary) : /bumps/i.test(s.summary), `${tag}: summary "${s.summary}"`);

  for (const w of [f.weather.origin, f.weather.destination]) {
    check(w.tempF === Math.round((w.tempC * 9) / 5 + 32) && w.tempC >= -35 && w.tempC <= 48, `${tag}: temperature`);
    check(w.windKts >= 3 && w.windKts <= 18 && (w.gustKts === null || w.gustKts > w.windKts), `${tag}: wind`);
    check(w.visibilityMi >= 1 && w.visibilityMi <= 10 && w.precipPct >= 0 && w.precipPct <= 100 && w.impactNote.length > 10, `${tag}: weather values`);
  }
  check(f.weather.origin.airportCode === f.origin.code && f.weather.destination.airportCode === f.destination.code, `${tag}: weather airports`);
  check(f.weather.origin.localTime === f.departTime && f.weather.destination.localTime === f.arriveTime, `${tag}: weather times`);

  const a = f.airlineStats;
  check(a.safetyScore >= 92 && a.safetyScore <= 99 && a.onTimePct >= 74 && a.onTimePct <= 90 && Math.abs(a.onTimeRoutePct - a.onTimePct) <= 5, `${tag}: airline stats`);
  check(a.comfortScore >= 7.2 && a.comfortScore <= 9.3 && a.amenities.length >= 3, `${tag}: comfort`);

  const sm = f.seatMap;
  const letters = sm.columnGroups.flat();
  const rows = sm.rows.map((r) => r.row);
  check(sm.rows.length >= 18 && sm.rows.length <= 28 && rows.every((r, i) => i === 0 || r > rows[i - 1]), `${tag}: seat rows`);
  check(sm.rows.some((r) => r.exit) && sm.rows.filter((r) => r.exit).every((r) => r.zone === "smoothest"), `${tag}: exit rows`);
  check(sm.recommended.length === 3, `${tag}: recommended seats`);
  // The airline's cabin for the model: the same map on every flight (and in the study); only open seats vary.
  if (model) {
    const cabin = cabinConfigFor(f.airline.code, model);
    check(
      ac.seatLayout === cabin.seatLayout && ac.typicalSeats === cabin.typicalSeats && f.airlineStats.seatWidthIn === cabin.seatWidthIn &&
        JSON.stringify(rows) === JSON.stringify(cabin.rowNumbers) && sm.wingStartRow === cabin.rowNumbers[cabin.wingFirstIndex] &&
        sm.wingEndRow === cabin.rowNumbers[cabin.wingLastIndex] && sm.columnGroups.map((g) => g.length).join("-") === cabin.seatLayout,
      `${tag}: seat map is not ${f.airline.code}'s ${ac.model} cabin`,
    );
  }
  const geometry = JSON.stringify([ac.seatLayout, ac.typicalSeats, sm.columnGroups, sm.rows, sm.wingStartRow, sm.wingEndRow]);
  const cabinKey = `${f.airline.code}|${ac.model}`;
  check((SEAT_GEOMETRY.get(cabinKey) ?? geometry) === geometry, `${tag}: ${cabinKey} shows another seat map than on another flight`);
  SEAT_GEOMETRY.set(cabinKey, geometry);
  // Best free seats, smoothest first: over the wing while it has free seats, then the nearest others.
  const occupied = new Set(sm.occupied);
  const freeOverWing = sm.rows.filter((r) => r.zone === "smoothest").reduce((n, r) => n + letters.filter((l) => !occupied.has(`${r.row}${l}`)).length, 0);
  if (freeOverWing < 3) seatFallbacks++;
  sm.recommended.forEach((id, i) => {
    const row = Number(id.slice(0, -1));
    check(rows.includes(row) && letters.includes(id.slice(-1)) && !occupied.has(id), `${tag}: recommended seat ${id}`);
    if (i < freeOverWing) check(sm.rows.find((r) => r.row === row)?.zone === "smoothest", `${tag}: recommended seat ${id} off the wing while the wing has free seats`);
  });

  const minutes = f.sounds.map((c) => c.minute).filter((m): m is number => m !== null);
  check(f.sounds.length >= 10 && f.sounds.length <= 14 && minutes.every((m, i) => i === 0 || m >= minutes[i - 1]), `${tag}: sounds`);
  check(new Set(f.sounds.map((c) => c.id)).size === f.sounds.length && f.sounds[0].moment === "boarding" && f.sounds[f.sounds.length - 1].moment === "landing", `${tag}: sound ids/order`);
  check(/^A32[01]/.test(ac.model) === f.sounds.some((c) => c.id === "taxi-ptu"), `${tag}: barking-dog cue vs ${ac.model}`);

  const strings: Array<[string, string]> = [];
  stringsOf(f, "flight", strings);
  for (const [path, value] of strings) {
    const m = FORBIDDEN.exec(value);
    check(!m, `${tag}: forbidden word "${m?.[0]}" at ${path}`);
    const d = DISCOURAGED.exec(value);
    if (d) warn(`${tag}: discouraged word "${d[0]}" at ${path}: "${value}"`);
    check(!value.includes("!") && !/undefined|NaN|\[object/.test(value), `${tag}: bad text at ${path}: "${value}"`);
    const profile = PILOT_PROFILE_PATTERN.exec(value)?.[0] ?? NAMED_PILOT.exec(value)?.[0];
    check(!profile, `${tag}: pilot-profile text "${profile}" at ${path}`);
    check(!YOUR_FLIGHT.test(value), `${tag}: "${YOUR_FLIGHT.exec(value)?.[0]}" at ${path} (version C never says "your flight")`);
  }
  // Sound timings: typical, on the 5-minute grid.
  for (const c of f.sounds) {
    const offGrid = [...c.when.matchAll(/(\d+)h (\d+)m\b/g)].some((m) => Number(m[2]) % 5 !== 0) || [...c.when.matchAll(/(\d+) min\b/g)].some((m) => Number(m[1]) % 5 !== 0);
    check(!offGrid, `${tag}: ${c.id} timing "${c.when}" not rounded to 5 minutes`);
  }
}

// Global tallies.
const weatherByHour = new Map<string, string>();
const idsSeen = new Map<string, string>();
let seatFallbacks = 0;
const byMarket: Record<Market, number[]> = { busy: [], ordinary: [], long: [] };
const fareRows: Array<{
  fare: number;
  dayMean: number;
  /** fareAt a day before departure, and the day's mean of it. */
  fare1: number;
  dayMean1: number;
  score: number;
  dayScore: number;
  distance: number;
  tier: string;
  weekday: number;
  departMin: number;
  long: boolean;
}> = [];
/** Lead times (days) over which a flight's fare must not rise as departure gets further off, then not fall. */
const LEAD_DOWN = [0, 1, 2, 3, 4, 5, 7, 10, 13, 14, 17, 20, 21, 28, 35, 42];
const LEAD_UP = [42, 49, 56, 63, 90, 120, 180, 330];
const endingCounts = new Array<number>(10).fill(0);
let roundHundreds = 0;
let lockstepDays = 0;
let reorderedDays = 0;
const spreads: number[] = [];
let blockPairs = 0;
let widePairs = 0;
let flightsChecked = 0;
const scoreAll: number[] = [];

function checkDay(q: FlightInput, res: SearchResults): void {
  const tag = `${q.origin}-${q.destination} ${q.date}`;
  const norm = normalizeInput(q);
  const day = routeDay(norm);
  const opts = res.options;
  const flights = opts.map((o) => o.flight);

  // Query, shape of the results, caching.
  check(JSON.stringify(res.query) === JSON.stringify(norm), `${tag}: query is the normalized input`);
  check(Object.isFrozen(res) && Object.isFrozen(res.options), `${tag}: cached results are frozen`);
  check(searchFlights({ ...q }) === res, `${tag}: second call is a cache hit`);

  // Counts by market.
  const market = marketFor(day);
  const known = KNOWN_MARKETS[`${q.origin}-${q.destination}`];
  if (known) check(market === known, `${tag}: market ${market}, expected ${known}`);
  const [lo, hi] = MARKET_COUNTS[market];
  check(opts.length >= lo && opts.length <= hi, `${tag}: ${opts.length} flights in a ${market} market (${lo}–${hi})`);
  byMarket[market].push(opts.length);

  // Departures: grid, operating day, order and spacing.
  const first = market === "long" ? 6 * 60 : 5 * 60 + 30;
  // Only carriers that would plausibly fly the route nonstop (nonstopCarriers via routeDay).
  const candidates = new Map(day.carriers.map((c) => [c.airline.code, c.airline]));
  check(hasNonstopService(q.origin, q.destination) === day.carriers.length > 0 && day.carriers.length > 0, `${tag}: a route with flights must have nonstop service`);
  const parity = day.eastbound ? 0 : 1;
  for (let i = 0; i < opts.length; i++) {
    const f = flights[i];
    const t = timeToMinutes(f.departTime);
    check(t % 5 === 0 && t >= first && t <= 23 * 60 + 30, `${tag}: departure ${f.departTime} off the grid or the operating day`);
    for (let j = 0; j < i; j++) {
      const g = flights[j];
      const gap = t - timeToMinutes(g.departTime);
      check(gap >= 15, `${tag}: ${g.flightNumber} and ${f.flightNumber} leave ${gap} min apart`);
      if (g.airline.code === f.airline.code) check(gap >= 45, `${tag}: ${g.flightNumber} and ${f.flightNumber} (same carrier) ${gap} min apart`);
      if (blockOf(g.departTime) !== blockOf(f.departTime)) check(gap >= 30, `${tag}: ${g.departTime} and ${f.departTime} ${gap} min apart across an air-block edge`);
    }

    // Arrivals at sensible hours.
    const arriveHour = timeToMinutes(f.arriveTime) / 60;
    const curfew = CURFEW[f.destination.code];
    if (curfew) check(!(arriveHour >= curfew[0] || arriveHour < curfew[1]), `${tag}: ${f.flightNumber} lands inside the ${f.destination.code} curfew at ${f.arriveTime}`);
    if (!ALL_NIGHT.has(f.destination.code)) check(!(arriveHour >= 0.75 && arriveHour < 5.5), `${tag}: ${f.flightNumber} lands at ${f.arriveTime}`);

    // Carrier, number, aircraft.
    const profile = getAirline(f.airline.code);
    check(candidates.has(f.airline.code) && Boolean(profile), `${tag}: ${f.airline.code} doesn't fly this route nonstop`);
    const m = /^([A-Z0-9]{2}) (\d{1,4})$/.exec(f.flightNumber);
    check(Boolean(m) && m![1] === f.airline.code, `${tag}: flight number "${f.flightNumber}"`);
    const n = Number(m?.[2] ?? 0);
    check(!isRetiredFlightNumber(f.flightNumber) && n >= 1 && n % 2 === parity, `${tag}: ${f.flightNumber} retired or wrong parity for its direction`);
    if (day.longHaul) check(n <= 1000, `${tag}: long-haul ${f.flightNumber} has a long number`);
    const model = getAircraftModel(f.aircraft.model);
    check(Boolean(model) && (profile?.fleet.includes(f.aircraft.model) ?? false), `${tag}: ${f.aircraft.model} not in ${f.airline.code}'s fleet`);
    if (day.narrowOnly) check(f.aircraft.bodyType === "narrow", `${tag}: wide-body at a narrow-body-only airport`);
    if (!day.narrowOnly && (day.oceanic || day.distanceMi >= 2800)) check(f.aircraft.bodyType === "wide", `${tag}: ${f.aircraft.model} on a ${day.distanceMi} mi${day.oceanic ? " oceanic" : ""} route`);
    const fleetRange = Math.max(...(profile?.fleet ?? []).map((k) => getAircraftModel(k)?.rangeMi ?? 0));
    if (model && fleetRange >= day.distanceMi) check(model.rangeMi >= day.distanceMi, `${tag}: ${model.key} can't fly ${day.distanceMi} mi`);

    // Ids, keys, the dashboard shape.
    const o = opts[i];
    check(o.key === optionKey(f) && f.id === hashId(`c|${norm.origin}|${norm.destination}|${norm.date}|${o.key}`), `${tag}: key / id of ${o.key}`);
    const other = idsSeen.get(f.id);
    check(other === undefined, `${tag}: id ${f.id} also used by ${other}`);
    idsSeen.set(f.id, `${norm.origin}-${norm.destination} ${norm.date} ${o.key}`);
    check(f.alternatives.length === 0 && JSON.stringify(f.prefs) === "{}" && JSON.stringify(f.input) === JSON.stringify(norm), `${tag}: alternatives / prefs / input`);
    check(Number.isInteger(o.fareUsd) && o.fareUsd >= 39, `${tag}: fare ${o.fareUsd}`);
    checkFlightShape(`${tag} ${o.key}`, f);
    flightsChecked++;
    scoreAll.push(f.smoothness.score);
  }
  check(new Set(opts.map((o) => o.key)).size === opts.length && new Set(flights.map((f) => f.id)).size === opts.length, `${tag}: keys and ids unique`);

  // One airborne time for the day (the A/B reference flight's on the route as flown); block times a few minutes apart.
  const flown = { origin: day.route.split("|")[0], destination: day.route.split("|")[1], date: norm.date };
  const reference = generateFlight(flown);
  check(flights.every((f) => f.airborneMin === reference.airborneMin), `${tag}: airborne times differ (reference ${reference.airborneMin})`);
  // Published block times: on the 5-minute grid, never shorter than the day's flight plus taxi, padded at most
  // by the spread of the daily winds (±2%) and the rounding.
  for (const f of flights) {
    const pad = f.blockMin - f.airborneMin;
    check(f.blockMin % 5 === 0 && timeToMinutes(f.arriveTime) % 5 === 0, `${tag}: ${f.flightNumber} block ${f.blockMin} / arrival ${f.arriveTime} off the 5-minute grid`);
    check(pad >= 15 && pad <= 40 + 0.042 * f.airborneMin, `${tag}: ${f.flightNumber} block ${f.blockMin} for ${f.airborneMin} min in the air`);
  }
  const blocks = flights.map((f) => f.blockMin);
  check(Math.max(...blocks) - Math.min(...blocks) <= 12, `${tag}: block times ${Math.min(...blocks)}–${Math.max(...blocks)}`);
  check(flights.every((f) => f.origin.code === day.origin.code && f.destination.code === day.destination.code), `${tag}: endpoints`);

  // The A/B route history, which counts about as many past flights as the market flies in that month over 4 years.
  const history = JSON.stringify(generateFlight(norm).turbulence.history);
  check(flights.every((f) => JSON.stringify(f.turbulence.history) === history), `${tag}: route history differs from generateFlight's`);
  const monthDays = new Date(Date.UTC(2025, Number(norm.date.slice(5, 7)), 0)).getUTCDate();
  const analyzed = flights[0]?.turbulence.history.flightsAnalyzed ?? 0;
  check(analyzed >= lo * monthDays * 4 * 0.85 - 5 && analyzed <= hi * monthDays * 4 + 5, `${tag}: about ${analyzed} past flights in a month for a ${market} market (${lo}–${hi} a day)`);

  // Weather by airport, date and hour — across every flight in the sample, and the A/B flights then.
  const sides = (f: Flight): Array<[string, Flight["weather"]["origin"]]> => [
    [`${f.origin.code} ${f.input.date} ${f.departTime.slice(0, 2)}`, f.weather.origin],
    [`${f.destination.code} ${addDays(f.input.date, f.arriveDayOffset)} ${f.arriveTime.slice(0, 2)}`, f.weather.destination],
  ];
  for (const f of [...flights, reference]) {
    for (const [hour, w] of sides(f)) {
      const seen = weatherByHour.get(hour);
      check(seen === undefined || seen === weatherFacts(w), `${tag}: different weather at ${hour}h than another flight then`);
      weatherByHour.set(hour, weatherFacts(w));
    }
  }

  // Bumps by air block: the same body type sees the identical series; a wide-body the same bumps, felt less.
  const byBlock = new Map<number, Flight[]>();
  for (const f of flights) byBlock.set(blockOf(f.departTime), [...(byBlock.get(blockOf(f.departTime)) ?? []), f]);
  for (const group of byBlock.values()) {
    for (let i = 1; i < group.length; i++) {
      const a = group[0];
      const b = group[i];
      blockPairs++;
      check(windowsOf(a) === windowsOf(b), `${tag}: ${a.flightNumber} and ${b.flightNumber} share an air block but not its bumps`);
      if (a.aircraft.bodyType === b.aircraft.bodyType) {
        check(JSON.stringify(a.turbulence.points) === JSON.stringify(b.turbulence.points) && a.smoothness.score === b.smoothness.score, `${tag}: ${a.flightNumber} / ${b.flightNumber}: same block and body type, different series`);
      } else {
        widePairs++;
        const [wide, narrow] = a.aircraft.bodyType === "wide" ? [a, b] : [b, a];
        const below = wide.turbulence.points.every((p, k) => p.level <= narrow.turbulence.points[k].level);
        check(below && wide.smoothness.score >= narrow.smoothness.score, `${tag}: wide-body ${wide.flightNumber} bumpier than ${narrow.flightNumber} in the same air`);
      }
    }
  }

  // Fares along the lead-time curve (fareAt): the base fare at the reference lead time, higher close to
  // departure, never rising as departure gets further off inside six weeks and never falling beyond,
  // whole dollars ≥ $39 on the flight's own price points, a number for any lead time.
  const fares1 = opts.map((o) => fareAt(o, 1));
  for (const o of opts) {
    const down = LEAD_DOWN.map((d) => fareAt(o, d));
    const up = LEAD_UP.map((d) => fareAt(o, d));
    check([...down, ...up].every((f) => Number.isInteger(f) && f >= 39), `${tag}: ${o.key} fareAt not a whole number ≥ 39 (${down.join(", ")})`);
    check(down.every((f, i) => i === 0 || f <= down[i - 1]), `${tag}: ${o.key} fare rises with more days to go inside six weeks (${down.join(", ")})`);
    check(up.every((f, i) => i === 0 || f >= up[i - 1]), `${tag}: ${o.key} fare falls with more days to go beyond six weeks (${up.join(", ")})`);
    check(fareAt(o, FARE_REFERENCE_LEAD_DAYS) === o.fareUsd, `${tag}: ${o.key} fareAt at the reference lead time is ${fareAt(o, FARE_REFERENCE_LEAD_DAYS)}, not the base fare ${o.fareUsd}`);
    const surge = fareAt(o, 1) / fareAt(o, 35);
    // ×1.74 a day out over ×0.95 at the sweet spot, raised to a steepness of up to 1.15, then rounded to price points (which weighs more on a $90 fare).
    check(surge >= 1.3 && surge <= 2.4, `${tag}: ${o.key} a day out costs ${surge.toFixed(2)}× the sweet spot`);
    check(fareAt(o, -5) === fareAt(o, 0) && fareAt(o, 1000) === fareAt(o, 330) && fareAt(o, Number.NaN) === o.fareUsd, `${tag}: ${o.key} fareAt off the ends of the curve`);
    check([...down, ...up].every((f) => f % 10 === o.fareUsd % 10), `${tag}: ${o.key} fares change their ending along the curve`);
    endingCounts[o.fareUsd % 10]++;
    if (o.fareUsd % 100 === 0) roundHundreds++;
  }
  // Not in lockstep: each flight has its own shift and steepness, so the Cheapest order close to departure differs.
  if (opts.length >= 3) {
    lockstepDays++;
    const order = (d: number) => [...opts].sort((a, b) => fareAt(a, d) - fareAt(b, d) || a.key.localeCompare(b.key)).map((o) => o.key).join(",");
    if (order(2) !== order(FARE_REFERENCE_LEAD_DAYS)) reorderedDays++;
    check(new Set(opts.map((o) => (fareAt(o, 2) / o.fareUsd).toFixed(2))).size >= 2, `${tag}: every fare moves in lockstep two days out`);
  }

  // Fares and score spread for the statistics below.
  const dayFare = mean(opts.map((o) => o.fareUsd));
  const dayFare1 = mean(fares1);
  const dayScore = mean(flights.map((f) => f.smoothness.score));
  opts.forEach((o, i) => {
    fareRows.push({
      fare: o.fareUsd,
      dayMean: dayFare,
      fare1: fares1[i],
      dayMean1: dayFare1,
      score: o.flight.smoothness.score,
      dayScore,
      distance: o.flight.distanceMi,
      tier: getAirline(o.flight.airline.code)?.fareTier ?? "standard",
      weekday: weekdayIndex(norm.date),
      departMin: timeToMinutes(o.flight.departTime),
      long: day.longHaul,
    });
  });
  if (flights.length > 1) spreads.push(Math.max(...flights.map((f) => f.smoothness.score)) - Math.min(...flights.map((f) => f.smoothness.score)));

  // The day's overview is the day's results.
  const ov = dayOverview(q, norm.date);
  check(
    ov.date === norm.date && ov.count === opts.length && ov.lowestFareUsd === Math.min(...opts.map((o) => o.fareUsd)) && ov.bestScore === Math.max(...flights.map((f) => f.smoothness.score)),
    `${tag}: overview ${JSON.stringify(ov)} disagrees with the results`,
  );
}

const sampleStart = performance.now();
const tableJson = new Map<string, string>();
const daysDone = new Map<string, SearchResults>();
let days = 0;
for (const [origin, destination] of ROUTES) {
  for (const date of DATES) {
    const q = { origin, destination, date };
    let res: SearchResults;
    try {
      res = searchFlights(q);
    } catch (err) {
      check(false, `${origin}-${destination} ${date}: threw ${(err as Error).message}`);
      continue;
    }
    // Typed spellings of a route already in the sample ("New York" → JFK) are that same day.
    const normKey = JSON.stringify(normalizeInput(q));
    const done = daysDone.get(normKey);
    if (done) {
      check(JSON.stringify(res) === JSON.stringify(done), `${origin}-${destination} ${date}: not the same results as the normalized query`);
      continue;
    }
    daysDone.set(normKey, res);
    checkDay(q, res);
    days++;
    if (date === DATES[3] || date === DATES[11]) tableJson.set(`${origin}|${destination}|${date}`, JSON.stringify(res));
  }
}
const sampleMs = performance.now() - sampleStart;

// Perimeter airports: the same flights as the route as flown, with the query's own ids.
for (const date of ["2026-11-26", "2027-07-09"]) {
  const lga = searchFlights({ origin: "LGA", destination: "LAX", date });
  const jfk = searchFlights({ origin: "JFK", destination: "LAX", date });
  check(lga.options.length === jfk.options.length && lga.options.every((o, i) => o.key === jfk.options[i].key && o.fareUsd === jfk.options[i].fareUsd), `LGA-LAX ${date}: not the JFK-LAX flights`);
  check(lga.options.every((o, i) => o.flight.id !== jfk.options[i].flight.id && o.flight.origin.code === "JFK"), `LGA-LAX ${date}: ids must differ from JFK-LAX, origin must be JFK`);
  check(
    lga.options.every((o, i) => o.flight.smoothness.score === jfk.options[i].flight.smoothness.score && JSON.stringify(o.flight.crew) === JSON.stringify(jfk.options[i].flight.crew) && JSON.stringify(o.flight.seatMap) === JSON.stringify(jfk.options[i].flight.seatMap)),
    `LGA-LAX ${date}: same flight, different facts`,
  );
}
check(JSON.stringify(searchFlights({ origin: " jfk ", destination: "Los Angeles", date: "2026-11-26" }).query) === JSON.stringify({ origin: "JFK", destination: "LAX", date: "2026-11-26" }), "query not normalized");
check(searchFlights({ origin: " jfk ", destination: "lax", date: "2026-11-26" }) === searchFlights({ origin: "JFK", destination: "LAX", date: "2026-11-26" }), "normalized queries share a cache entry");
let threw = false;
try {
  searchFlights({ origin: "JFK", destination: "LAX", date: "2026-02-30" });
} catch {
  threw = true;
}
check(threw, "an invalid date must throw (like generateFlight)");

// ── A timetable repeats day to day ──────────────────────────────────────────

let repeatKeys = 0;
let repeatTimes = 0;
let repeatTotal = 0;
for (const [origin, destination] of [["JFK", "LAX"], ["LGA", "BOS"], ["JFK", "LHR"], ["SFO", "NRT"], ["ATL", "CUN"], ["DEL", "BOM"]]) {
  const monday = { origin, destination, date: "2027-02-08" };
  const base = searchFlights(monday).options;
  for (let d = 1; d <= 4; d++) {
    const other = searchFlights({ ...monday, date: addDays(monday.date, d) }).options;
    for (const o of base) {
      repeatTotal++;
      const same = other.find((x) => x.key === o.key);
      if (same) repeatKeys++;
      if (same && same.flight.departTime === o.flight.departTime) {
        repeatTimes++;
        // No clock changes that week: the same departure lands at the same published time, whatever the day's winds.
        check(same.flight.arriveTime === o.flight.arriveTime && same.flight.blockMin === o.flight.blockMin, `${origin}-${destination}: ${o.key} lands at ${o.flight.arriveTime} on Monday but ${same.flight.arriveTime} ${d} day(s) later`);
      }
    }
  }
}
check(repeatKeys / repeatTotal >= 0.95 && repeatTimes / repeatTotal >= 0.9, `weekday timetable: ${pct(repeatKeys, repeatTotal)} of flights repeat, ${pct(repeatTimes, repeatTotal)} at the same time`);
// One published block time per flight number and season (winter 2026–27 here: before, across and after the US clock change).
let seasonKeys = 0;
for (const [origin, destination] of [["JFK", "LAX"], ["JFK", "LHR"], ["SFO", "NRT"], ["SIN", "JFK"], ["DFW", "SYD"], ["DEL", "BOM"]]) {
  const blocks = new Map<string, Set<number>>();
  for (const date of ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-26", "2026-12-24", "2027-01-12", "2027-02-14", "2027-03-14", "2027-03-27"]) {
    for (const o of searchFlights({ origin, destination, date }).options) blocks.set(o.key, (blocks.get(o.key) ?? new Set()).add(o.flight.blockMin));
  }
  for (const [key, set] of blocks) {
    seasonKeys++;
    check(set.size === 1, `${origin}-${destination}: ${key} has ${set.size} block times in one season (${[...set].join(", ")} min)`);
  }
}
check(searchFlights({ origin: "JFK", destination: "LAX", date: "2027-02-13" }).options.length < searchFlights({ origin: "JFK", destination: "LAX", date: "2027-02-12" }).options.length, "busy market: no fewer flights on Saturday");

// ── Departure windows: the route history's "best departure window" stays true ─

const CAUSAL_ROUTES = [["JFK", "ORD"], ["ATL", "DEN"], ["DFW", "LAX"], ["BOS", "MIA"], ["SEA", "SFO"], ["ORD", "PHX"], ["FRA", "FCO"], ["MAD", "CDG"], ["LHR", "AMS"], ["DEL", "BOM"], ["JFK", "LAX"], ["LGA", "ATL"]];
function windowScores(months: number[], dayCount: number) {
  const by: Record<"best" | "other" | DepartWindow, number[]> = { best: [], other: [], morning: [], afternoon: [], evening: [] };
  for (const [origin, destination] of CAUSAL_ROUTES)
    for (const month of months)
      for (let d = 1; d <= dayCount; d++) {
        const date = `2027-${String(month).padStart(2, "0")}-${String(d * 3).padStart(2, "0")}`;
        const { options } = searchFlights({ origin, destination, date });
        const best = /^Morning/.test(options[0].flight.turbulence.history.bestDepartureWindow) ? "morning" : "evening";
        // One score per air block (the narrow-body series), so busy blocks don't count twice.
        const blocks = new Map<number, Flight>();
        for (const o of options) if (!blocks.has(blockOf(o.flight.departTime)) || o.flight.aircraft.bodyType === "narrow") blocks.set(blockOf(o.flight.departTime), o.flight);
        for (const f of blocks.values()) {
          const w = departWindowOf(f.departTime);
          by[w].push(f.smoothness.score);
          by[w === best ? "best" : "other"].push(f.smoothness.score);
        }
      }
  return by;
}
const summer = windowScores([6, 7, 8], 9);
const winter = windowScores([12, 1, 2], 9);
const fmt = (xs: number[]) => `${mean(xs).toFixed(1)} (${xs.length})`;
console.log(`Summer blocks · morning ${fmt(summer.morning)} · afternoon ${fmt(summer.afternoon)} · evening ${fmt(summer.evening)}`);
console.log(`Winter blocks · history's best window ${fmt(winter.best)} · other windows ${fmt(winter.other)}`);
check(mean(summer.morning) >= mean(summer.afternoon) && mean(summer.morning) >= mean(summer.evening), "summer: morning blocks are not the smoothest, against the route history");
check(mean(summer.afternoon) >= mean(summer.evening) - 1, "summer: evening blocks clearly smoother than afternoon ones");
check(mean(winter.best) >= mean(winter.other), "winter: the history's best window is not the smoothest");
check(mean(summer.best) >= mean(summer.other), "summer: the history's best window is not the smoothest");

// ── Fares ───────────────────────────────────────────────────────────────────

// Base fares (fareUsd) by distance band: whole dollars inside a plausible range for one-way economy,
// rising with distance. The medians are printed for calibration.
const bands: Array<[string, number, number, number, number]> = [
  // label, min distance, max distance, lowest plausible fare, highest plausible fare
  ["< 500 mi", 0, 500, 39, 220],
  ["500–1,500 mi", 500, 1500, 39, 330],
  ["1,500–3,000 mi", 1500, 3000, 100, 600],
  ["3,000–6,000 mi", 3000, 6000, 230, 1050],
  ["6,000+ mi", 6000, 99999, 480, 1650],
];
const bandMeans: number[] = [];
const bandLines: string[] = [];
for (const [label, lo, hi, minFare, maxFare] of bands) {
  const rows = fareRows.filter((r) => r.distance >= lo && r.distance < hi);
  const fares = rows.map((r) => r.fare);
  if (rows.length === 0) continue;
  bandMeans.push(mean(fares));
  bandLines.push(`${label} $${Math.min(...fares)}–$${Math.max(...fares)} (median $${quantile(fares, 0.5)}, mean $${Math.round(mean(fares))}, ${rows.length})`);
  const outside = rows.filter((r) => r.fare < minFare || r.fare > maxFare).length;
  check(outside === 0, `fares ${label}: ${outside} outside $${minFare}–$${maxFare}`);
}
check(bandMeans.every((m, i) => i === 0 || m > bandMeans[i - 1]), "fares don't rise with distance");
// Calibration: the median base fare on benchmark routes over the sample's dates lands inside the
// typical one-way economy ranges booking sites show (2025) — a synthesis that sits around the one-way
// equivalent of the BTS average domestic itinerary fare (~$390), not a published per-route figure.
const BENCHMARK_FARES: Array<[string, string, number, number]> = [
  ["JFK", "LAX", 200, 320], ["LGA", "ORD", 90, 180], ["ATL", "MCO", 75, 140], ["SFO", "NRT", 520, 820], ["JFK", "LHR", 400, 650], ["LAX", "SYD", 780, 1150],
];
const benchmarkLines: string[] = [];
for (const [origin, destination, lo, hi] of BENCHMARK_FARES) {
  const fares = DATES.flatMap((date) => daysDone.get(JSON.stringify(normalizeInput({ origin, destination, date })))?.options.map((o) => o.fareUsd) ?? []);
  const median = quantile(fares, 0.5);
  check(fares.length > 0 && median >= lo && median <= hi, `${origin}-${destination}: median base fare $${median} outside the typical $${lo}–$${hi}`);
  benchmarkLines.push(`${origin}–${destination} $${median} (typical $${lo}–${hi})`);
}
const rel = (rows: typeof fareRows) => mean(rows.map((r) => r.fare / r.dayMean));
const valueRel = rel(fareRows.filter((r) => r.tier === "value"));
const standardRel = rel(fareRows.filter((r) => r.tier === "standard"));
const premiumLongRel = rel(fareRows.filter((r) => r.tier === "premium" && r.long));
check(valueRel < standardRel * 0.92, `value carriers not cheaper (${valueRel.toFixed(2)} vs ${standardRel.toFixed(2)})`);
check(premiumLongRel > rel(fareRows.filter((r) => r.tier === "standard" && r.long)), "premium carriers not higher on long-haul");
// Weekday effect, against each route's own average (the sample's dates fall on different weekdays).
const perRoute = new Map<string, number[]>();
for (const r of fareRows) perRoute.set(String(r.distance), [...(perRoute.get(String(r.distance)) ?? []), r.fare]);
const routeMean = (r: (typeof fareRows)[number]) => mean(perRoute.get(String(r.distance)) ?? [r.fare]);
const weekdayRel = (days: number[]) => mean(fareRows.filter((r) => days.includes(r.weekday)).map((r) => r.fare / routeMean(r)));
check(weekdayRel([0, 5]) > weekdayRel([2, 3, 6]), `Fridays/Sundays not dearer than Tue/Wed/Sat (${weekdayRel([0, 5]).toFixed(2)} vs ${weekdayRel([2, 3, 6]).toFixed(2)})`);
// Time of day (short and medium haul): departures before 06:30 and after 21:00 below the day's mean, the 07:00–09:30 and 16:00–19:00 peaks above it.
const shortRows = fareRows.filter((r) => !r.long);
const offPeakRel = rel(shortRows.filter((r) => r.departMin < 6.5 * 60 || r.departMin >= 21 * 60));
const peakRel = rel(shortRows.filter((r) => (r.departMin >= 7 * 60 && r.departMin < 9.5 * 60) || (r.departMin >= 16 * 60 && r.departMin < 19 * 60)));
check(offPeakRel < peakRel * 0.92, `early and late departures not cheaper than the peaks (${offPeakRel.toFixed(2)} vs ${peakRel.toFixed(2)})`);
// Holidays (routes touching the US): the Sunday after Thanksgiving well above ordinary Sundays, the holiday itself
// quieter than the day before it, Christmas Day cheap, the Friday before the Fourth dearer than an ordinary Friday.
// A route that doesn't touch the US doesn't notice Thanksgiving. Same season, so the same flights each day.
const meanBase = (origin: string, destination: string, date: string) => mean(searchFlights({ origin, destination, date }).options.map((o) => o.fareUsd));
const thanksgivingSunday = meanBase("JFK", "LAX", "2026-11-29") / mean(["2026-11-08", "2026-11-15"].map((date) => meanBase("JFK", "LAX", date)));
check(thanksgivingSunday >= 1.15 && thanksgivingSunday <= 1.5, `the Sunday after Thanksgiving costs ${thanksgivingSunday.toFixed(2)}× an ordinary Sunday`);
const thanksgivingDay = meanBase("JFK", "LAX", "2026-11-26") / meanBase("JFK", "LAX", "2026-11-25");
check(thanksgivingDay < 0.9, `Thanksgiving Day costs ${thanksgivingDay.toFixed(2)}× the Wednesday before`);
const christmasDay = meanBase("JFK", "LAX", "2026-12-25") / meanBase("JFK", "LAX", "2026-12-22");
check(christmasDay < 0.95, `Christmas Day costs ${christmasDay.toFixed(2)}× December 22`);
const fourthFriday = meanBase("JFK", "LAX", "2027-07-02") / meanBase("JFK", "LAX", "2027-07-16");
check(fourthFriday > 1.03, `the Friday before the Fourth costs ${fourthFriday.toFixed(2)}× an ordinary Friday`);
const abroadSunday = meanBase("LHR", "CDG", "2026-11-29") / meanBase("LHR", "CDG", "2026-11-15");
check(abroadSunday >= 0.9 && abroadSunday <= 1.1, `Thanksgiving moves fares ×${abroadSunday.toFixed(2)} on a route that doesn't touch the US`);
// Price points: fares end in 7, 9 or 4 far more often than not, every ending occurs, round hundreds only by coincidence.
const faresCounted = endingCounts.reduce((a, b) => a + b, 0);
const sevenNineFour = (endingCounts[7] + endingCounts[9] + endingCounts[4]) / faresCounted;
check(sevenNineFour >= 0.6 && sevenNineFour <= 0.9, `${pct(endingCounts[7] + endingCounts[9] + endingCounts[4], faresCounted)} of fares end in 7, 9 or 4`);
check(endingCounts.filter((n) => n > 0).length >= 8, `only ${endingCounts.filter((n) => n > 0).length} different fare endings`);
check(roundHundreds <= faresCounted * 0.01, `${roundHundreds} of ${faresCounted} fares are round hundreds`);
check(reorderedDays >= lockstepDays * 0.5, `the Cheapest order two days out differs from the base order on only ${pct(reorderedDays, lockstepDays)} of days`);
// Never correlated with the smoothness score: within each day (fare and score against the day's own means), at a
// day's notice (fareAt), the lead-time surge itself, and raw.
const rWithin = pearson(fareRows.map((r) => r.fare / r.dayMean), fareRows.map((r) => r.score - r.dayScore));
const rWithin1 = pearson(fareRows.map((r) => r.fare1 / r.dayMean1), fareRows.map((r) => r.score - r.dayScore));
const rSurge = pearson(fareRows.map((r) => r.fare1 / r.fare), fareRows.map((r) => r.score - r.dayScore));
// Across a route's days (what the date strip puts side by side): each day's lowest fare against its best score.
const routeDays = new Map<string, Array<{ fare: number; score: number }>>();
for (const res of daysDone.values()) {
  const key = `${res.query.origin}|${res.query.destination}`;
  const best = res.options.reduce((m, o) => Math.max(m, o.flight.smoothness.score), 0);
  const low = res.options.reduce((m, o) => Math.min(m, o.fareUsd), Infinity);
  routeDays.set(key, [...(routeDays.get(key) ?? []), { fare: low, score: best }]);
}
const stripFares: number[] = [];
const stripScores: number[] = [];
for (const list of routeDays.values()) {
  const mf = mean(list.map((x) => x.fare));
  const ms = mean(list.map((x) => x.score));
  for (const x of list) {
    stripFares.push(x.fare / mf);
    stripScores.push(x.score - ms);
  }
}
const rStrip = pearson(stripFares, stripScores);
// Raw, over every route: distance drives both fares and (through wide-bodies on long-haul) a little smoothness.
const rRaw = pearson(fareRows.map((r) => r.fare), fareRows.map((r) => r.score));
check(Math.abs(rWithin) < 0.1, `fares correlate with the score within a day (r = ${rWithin.toFixed(3)})`);
check(Math.abs(rWithin1) < 0.1, `fares a day out correlate with the score within a day (r = ${rWithin1.toFixed(3)})`);
check(Math.abs(rSurge) < 0.1, `the last-minute surge correlates with the score (r = ${rSurge.toFixed(3)})`);
check(Math.abs(rStrip) < 0.15, `a day's lowest fare correlates with its best score (r = ${rStrip.toFixed(3)})`);

// ── Determinism and the cache (bounded LRU) ─────────────────────────────────

// Push the sample's days out of the 32-day cache, then rebuild them: identical, but new objects.
const lruProbe = { origin: "MIA", destination: "SJU", date: "2027-01-15" };
const probe = searchFlights(lruProbe);
for (let d = 1; d <= 31; d++) searchFlights({ origin: "ATL", destination: "MCO", date: addDays("2027-05-01", d) });
check(searchFlights(lruProbe) === probe, "LRU: a day used 31 searches ago was evicted");
for (let d = 32; d <= 34; d++) searchFlights({ origin: "ATL", destination: "MCO", date: addDays("2027-05-01", d) });
check(searchFlights(lruProbe) === probe, "LRU: a recently used day was evicted before older ones");
for (let d = 35; d <= 70; d++) searchFlights({ origin: "ATL", destination: "MCO", date: addDays("2027-05-01", d) });
const rebuilt = searchFlights(lruProbe);
check(rebuilt !== probe && JSON.stringify(rebuilt) === JSON.stringify(probe), "LRU: evicted day not rebuilt identically");
check(rebuilt.options.every((o, i) => [2, 35, 200].every((d) => fareAt(o, d) === fareAt(probe.options[i], d))), "LRU: fareAt differs on a rebuilt day");
let rebuiltDiffer = 0;
for (const [key, json] of tableJson) {
  const [origin, destination, date] = key.split("|");
  if (JSON.stringify(searchFlights({ origin, destination, date })) !== json) rebuiltDiffer++;
}
check(rebuiltDiffer === 0, `${rebuiltDiffer} of ${tableJson.size} days differ when rebuilt after eviction`);

// ── A/B safety, part 3: generateFlight unchanged by everything above ────────

const abAfter = AB_INPUTS.map((i) => JSON.stringify([generateFlight(i), generateFlight(i, { departWindow: "evening" }), generateFlight(i, { bodyType: "wide" })]));
check(abAfter.every((json, i) => json === abBefore[i]), "generateFlight output changed after searches (cache leak into A/B)");

// ── Speed ───────────────────────────────────────────────────────────────────

// Cold = never searched in this process (its timetable and route month too, for new routes), after warm-up.
const coldDayMs: number[] = [];
const COLD_ROUTES = [["ORD", "LGA"], ["SFO", "SEA"], ["IAH", "EWR"], ["MSP", "DTW"], ["CDG", "LHR"], ["MUC", "BER"], ["NRT", "ICN"], ["SYD", "MEL"], ["LAX", "HNL"], ["MAD", "BCN"], ["YUL", "YYZ"], ["PHX", "DEN"]];
for (const [origin, destination] of COLD_ROUTES) {
  for (const date of ["2026-12-11", "2027-04-16", "2027-08-06"]) {
    const t0 = performance.now();
    searchFlights({ origin, destination, date });
    coldDayMs.push(performance.now() - t0);
  }
}
const coldWeekMs: number[] = [];
for (const [origin, destination] of [["BOS", "ORD"], ["LHR", "MAD"], ["SFO", "HND"], ["ATL", "LGA"], ["DXB", "LHR"], ["SEA", "LAX"]]) {
  const t0 = performance.now();
  for (let d = 0; d < 7; d++) dayOverview({ origin, destination, date: "2027-06-01" }, addDays("2027-06-08", d));
  coldWeekMs.push(performance.now() - t0);
}
const hitStart = performance.now();
for (let i = 0; i < 1000; i++) searchFlights({ origin: "SFO", destination: "SEA", date: "2027-08-06" });
const hitUs = ((performance.now() - hitStart) * 1000) / 1000;
// fareAt runs in sorts, filters and the date strip: many calls per render.
const fareOptions = searchFlights({ origin: "SFO", destination: "SEA", date: "2027-08-06" }).options;
const fareStart = performance.now();
let fareSum = 0;
for (let i = 0; i < 20000; i++) fareSum += fareAt(fareOptions[i % fareOptions.length], i % 120);
const fareUs = ((performance.now() - fareStart) * 1000) / 20000;
check(quantile(coldDayMs, 0.5) <= 15 && quantile(coldDayMs, 0.9) <= 15, `a cold day takes too long (median ${quantile(coldDayMs, 0.5).toFixed(1)} ms, p90 ${quantile(coldDayMs, 0.9).toFixed(1)} ms)`);
check(Math.max(...coldWeekMs) <= 100, `a cold 7-day overview takes ${Math.max(...coldWeekMs).toFixed(0)} ms`);
check(hitUs < 50, `a cached search takes ${hitUs.toFixed(1)} µs`);
check(fareUs < 5 && fareSum > 0, `fareAt takes ${fareUs.toFixed(2)} µs`);

// ── Nonstop service (docs/FEASIBILITY.md: no invented nonstops) ─────────────
//
// After the speed checks, so the routes timed above were really cold.

// Every catalogue pair, both ways: a fact about the route, symmetric, and no catalogue airport left without nonstops.
const serviceStart = performance.now();
let servedPairs = 0;
let totalPairs = 0;
let oneWay = 0;
const partners = new Map<string, number>();
const servedList: string[] = [];
const unservedList: string[] = [];
for (const a of AIRPORTS) {
  for (const b of AIRPORTS) {
    if (a.code >= b.code) continue;
    totalPairs += 2;
    const there = hasNonstopService(a.code, b.code);
    if (there !== hasNonstopService(b.code, a.code)) oneWay++;
    if (!there) {
      unservedList.push(`${a.code}-${b.code}`);
      continue;
    }
    servedPairs += 2;
    servedList.push(`${a.code}-${b.code}`);
    partners.set(a.code, (partners.get(a.code) ?? 0) + 1);
    partners.set(b.code, (partners.get(b.code) ?? 0) + 1);
  }
}
const serviceMs = performance.now() - serviceStart;
check(oneWay === 0, `nonstop service: ${oneWay} pairs served one way only`);
check(servedPairs / totalPairs >= 0.25 && servedPairs / totalPairs <= 0.5, `nonstop service: ${pct(servedPairs, totalPairs)} of catalogue pairs served`);
const fewest = [...AIRPORTS].sort((x, y) => (partners.get(x.code) ?? 0) - (partners.get(y.code) ?? 0) || x.code.localeCompare(y.code)).slice(0, 6);
const islands = AIRPORTS.filter((a) => (partners.get(a.code) ?? 0) < 5);
check(islands.length === 0, `nonstop service: airports with fewer than 5 nonstop partners: ${islands.map((a) => `${a.code} (${partners.get(a.code) ?? 0})`).join(", ")}`);

// Every route the UI and these checks rely on is served; the obviously unserved pairs are not, on any day.
const mustServe: Array<[string, string]> = [...Object.keys(KNOWN_MARKETS).map((r) => r.split("-") as [string, string]), ...C_HOME_ROUTES, ...ROUTES];
for (const [o, d] of mustServe) check(hasNonstopService(o, d), `${o}-${d}: must have nonstop service`);
check(hasNonstopService("lga", "lax") && hasNonstopService("New York", "Los Angeles") && hasNonstopService("DCA", "LHR"), "perimeter airports and typed city names follow the route as flown");
for (const [o, d] of UNSERVED) {
  check(!hasNonstopService(o, d) && !hasNonstopService(d, o), `${o}-${d}: nobody flies it nonstop, but it has service`);
  for (const date of ["2026-10-16", "2026-11-26", "2027-07-09"]) {
    const q = { origin: o, destination: d, date };
    const res = searchFlights(q);
    check(res.options.length === 0 && Object.isFrozen(res.options), `${o}-${d} ${date}: ${res.options.length} invented nonstops`);
    const ov = dayOverview(q, date);
    check(ov.count === 0 && ov.lowestFareUsd === 0 && ov.bestScore === 0, `${o}-${d} ${date}: overview ${JSON.stringify(ov)} for a route without nonstops`);
    check(findOption(q, "DL1") === null, `${o}-${d} ${date}: findOption on a route without nonstops`);
  }
}
// The real routes the rule can't derive come with exactly the carriers that fly them.
for (const [route, codes] of Object.entries(LISTED_NONSTOPS)) {
  const [a, b] = route.split("-");
  check(Boolean(getAirport(a) && getAirport(b)) && codes.every((c) => getAirline(c)) && !LISTED_NONSTOPS[`${b}-${a}`], `${route}: unknown airport or airline, or listed both ways`);
  const carriers = routeDay({ origin: a, destination: b, date: "2026-12-01" }).carriers.map((c) => c.airline.code);
  check(codes.every((c) => carriers.includes(c)), `${route}: listed ${codes.join(", ")}, flown by ${carriers.join(", ") || "nobody"}`);
}
// Beyond ULTRA_LONG_MI only the listed routes are flown, and only by their listed carriers.
let ultraServed = 0;
for (const pair of servedList) {
  const [a, b] = pair.split("-");
  if (["LGA", "DCA"].includes(a) || ["LGA", "DCA"].includes(b)) continue; // flown from JFK / Dulles: checked as those routes
  const mi = greatCircleMi(getAirport(a)!, getAirport(b)!);
  if (mi <= ULTRA_LONG_MI) continue;
  ultraServed++;
  const listed = LISTED_NONSTOPS[pair] ?? LISTED_NONSTOPS[`${b}-${a}`] ?? [];
  const carriers = routeDay({ origin: a, destination: b, date: "2026-12-01" }).carriers.map((c) => c.airline.code);
  check(listed.length > 0 && carriers.every((c) => listed.includes(c)), `${pair}: ${carriers.join(", ")} fly ${Math.round(mi)} mi nonstop, but beyond ULTRA_LONG_MI only listed routes are flown`);
}
// Real long-haul routes keep the carriers that fly them (the network data in airlines.ts).
for (const [route, codes] of Object.entries(REAL_LONG_HAUL)) {
  const [a, b] = route.split("-");
  const carriers = routeDay({ origin: a, destination: b, date: "2026-12-01" }).carriers.map((c) => c.airline.code);
  check(codes.every((c) => carriers.includes(c)), `${route}: ${codes.filter((c) => !carriers.includes(c)).join(", ")} no longer fly it (flown by ${carriers.join(", ") || "nobody"})`);
}
// The network data names real zones, countries, airports and hubs.
const COUNTRIES = new Set(AIRPORTS.map((a) => a.country));
for (const airline of AIRLINES) {
  for (const m of airline.longHaulMarkets ?? []) {
    check((ZONES as readonly string[]).includes(m) || (m.length === 2 && COUNTRIES.has(m)) || (m.length === 3 && Boolean(getAirport(m))), `${airline.code}: unknown long-haul market "${m}"`);
  }
  for (const [zone, hubs] of Object.entries(airline.gatewayHubs ?? {})) {
    check((ZONES as readonly string[]).includes(zone) && (hubs ?? []).every((h) => airline.hubs.includes(h)), `${airline.code}: gateway hubs for ${zone} must be its own hubs`);
  }
  for (const hub of Object.keys(airline.hubReachMi ?? {})) check(airline.hubs.includes(hub), `${airline.code}: a reach for ${hub}, which isn't one of its hubs`);
}
// Who flies a route never depends on the date.
for (const [o, d] of [["JFK", "LAX"], ["LHR", "ACC"], ["BOI", "SEA"], ["SFO", "NRT"], ["LGA", "DEN"], ["HKG", "TPE"]]) {
  const byDate = ["2026-10-16", "2027-01-15", "2027-07-04", "2027-09-10"].map((date) => routeDay({ origin: o, destination: d, date }).carriers.map((c) => c.airline.code).join(","));
  check(new Set(byDate).size === 1, `${o}-${d}: carriers change with the date (${byDate.join(" / ")})`);
}
// hasNonstopService agrees with the days: a served route has flights every day (a Saturday and a summer day here), an unserved one never.
const serviceRng = createRng("check|service");
let servedDaysChecked = 0;
let emptyServedDays = 0;
for (let i = 0; i < 120; i++) {
  const [o, d] = serviceRng.pick(servedList).split("-");
  for (const date of ["2026-12-12", "2027-06-23"]) {
    servedDaysChecked++;
    if (searchFlights({ origin: o, destination: d, date }).options.length === 0) {
      emptyServedDays++;
      check(false, `${o}-${d} ${date}: served route without a flight that day`);
    }
  }
}
for (let i = 0; i < 80; i++) {
  const [o, d] = serviceRng.pick(unservedList).split("-");
  check(searchFlights({ origin: d, destination: o, date: "2027-01-20" }).options.length === 0, `${d}-${o}: flights on a route without nonstop service`);
}
const describePair = (pair: string) => {
  const [a, b] = pair.split("-");
  return `${pair} (${Math.round(greatCircleMi(getAirport(a)!, getAirport(b)!)).toLocaleString("en-US")} mi)`;
};
const servedExamples = serviceRng.shuffle(servedList).slice(0, 8).map(describePair);
const unservedExamples = serviceRng.shuffle(unservedList).slice(0, 8).map(describePair);

// ── Report ──────────────────────────────────────────────────────────────────

function showDay(q: FlightInput): void {
  const res = searchFlights(q);
  console.log(`\n${q.origin}→${q.destination} ${q.date} · ${res.options.length} flights`);
  for (const o of res.options) {
    const f = o.flight;
    const arr = `${f.arriveTime}${f.arriveDayOffset ? (f.arriveDayOffset > 0 ? "+" : "") + f.arriveDayOffset : "  "}`;
    console.log(
      `  ${f.departTime}→${arr} ${o.key.padEnd(7)} ${f.aircraft.model.padEnd(12)} ${f.aircraft.bodyType === "wide" ? "wide  " : "narrow"} ${String(f.smoothness.score).padStart(3)} ${f.smoothness.label.padEnd(20)} base $${String(o.fareUsd).padEnd(4)} · a day out $${String(fareAt(o, 1)).padEnd(4)} · 5 weeks out $${fareAt(o, 35)}`,
    );
  }
}
showDay({ origin: "JFK", destination: "LAX", date: "2026-11-26" });
showDay({ origin: "JFK", destination: "LHR", date: "2026-11-27" });

// One flight along the lead-time curve.
const ladderOption = searchFlights({ origin: "JFK", destination: "LAX", date: "2026-12-01" }).options[0];
const ladder = [0, 3, 7, 13, 21, 35, FARE_REFERENCE_LEAD_DAYS, 120, 330].map((d) => `$${fareAt(ladderOption, d)} at ${d === 0 ? "0 days (today)" : d === FARE_REFERENCE_LEAD_DAYS ? `${d} (the base fare)` : d}`);
console.log(`\nFares by lead time · ${ladderOption.key} JFK→LAX 2026-12-01: ${ladder.join(" · ")} · the Cheapest order two days out differs from the base order on ${pct(reorderedDays, lockstepDays)} of ${lockstepDays} days`);
console.log(`Fares by date · JFK→LAX: Sunday after Thanksgiving ×${thanksgivingSunday.toFixed(2)} vs ordinary Sundays · Thanksgiving Day ×${thanksgivingDay.toFixed(2)} vs the Wednesday before · Christmas Day ×${christmasDay.toFixed(2)} vs Dec 22 · Friday before the Fourth ×${fourthFriday.toFixed(2)} vs an ordinary Friday · LHR→CDG on Thanksgiving Sunday ×${abroadSunday.toFixed(2)}`);
console.log(`Fare calibration (median base fare over the sample's dates vs published typical one-way economy ranges) · ${benchmarkLines.join(" · ")}`);
console.log(`Fare endings · 7, 9 or 4 on ${pct(endingCounts[7] + endingCounts[9] + endingCounts[4], faresCounted)} of fares · ${endingCounts.filter((n) => n > 0).length} endings seen · ${roundHundreds} round hundreds in ${faresCounted} · early/late departures ×${offPeakRel.toFixed(2)} vs peak hours ×${peakRel.toFixed(2)} of the day's mean`);

const range = (xs: number[]) => (xs.length > 0 ? `${Math.min(...xs)}–${Math.max(...xs)} (mean ${mean(xs).toFixed(1)}, ${xs.length} days)` : "—");
console.log(`\nSample: ${days} route-days · ${flightsChecked} flights checked in ${(sampleMs / 1000).toFixed(1)} s`);
console.log(`Counts · busy ${range(byMarket.busy)} · ordinary ${range(byMarket.ordinary)} · long-haul ${range(byMarket.long)}`);
console.log(`Scores · ${Math.min(...scoreAll)}–${Math.max(...scoreAll)} (mean ${mean(scoreAll).toFixed(1)}) · within a day max−min ${range(spreads)}`);
console.log(`Air blocks · ${blockPairs} flight pairs share a block (${widePairs} wide-body vs narrow-body)`);
console.log(`Fares · ${bandLines.join(" · ")}`);
console.log(`Fares vs the day's mean · value carriers ${valueRel.toFixed(2)} · standard ${standardRel.toFixed(2)} · premium long-haul ${premiumLongRel.toFixed(2)} · Fri/Sun ${weekdayRel([0, 5]).toFixed(2)} vs Tue/Wed/Sat ${weekdayRel([2, 3, 6]).toFixed(2)}`);
console.log(`Fare–score correlation · within a day r = ${rWithin.toFixed(3)} (a day out r = ${rWithin1.toFixed(3)}, the surge itself r = ${rSurge.toFixed(3)}) · across a route's days (date strip) r = ${rStrip.toFixed(3)} · raw over all routes r = ${rRaw.toFixed(3)} (distance drives both)`);
console.log(`Seat maps · one map per airline and model (${SEAT_GEOMETRY.size} cabins seen) · ${seatFallbacks} of ${flightsChecked} flights have under 3 open seats over the wing, so a pick sits just off it`);
console.log(
  `Nonstop service · ${pct(servedPairs, totalPairs)} of ${totalPairs.toLocaleString("en-US")} ordered catalogue pairs (${servedPairs.toLocaleString("en-US")}) in ${Math.round(serviceMs)} ms · symmetric · fewest partners ${fewest.map((a) => `${a.code} ${partners.get(a.code) ?? 0}`).join(", ")} · ${ultraServed} pairs beyond ${ULTRA_LONG_MI.toLocaleString("en-US")} mi, all listed · ${servedDaysChecked} sampled days on served routes, ${emptyServedDays} empty`,
);
console.log(`  served, e.g. ${servedExamples.join(", ")}`);
console.log(`  not served, e.g. ${unservedExamples.join(", ")}`);
console.log(`Timetable · ${pct(repeatKeys, repeatTotal)} of a Monday's flights fly Tue–Fri too, ${pct(repeatTimes, repeatTotal)} at the same time, landing at the same published time · ${seasonKeys} flight numbers keep one block time across a season`);
console.log(`Speed · first search of this run ${firstCallMs.toFixed(1)} ms (after the A/B flights warmed up the JIT; a fresh browser tab adds ~10 ms of time-zone data and JIT warm-up once) · cold day median ${quantile(coldDayMs, 0.5).toFixed(1)} ms, p90 ${quantile(coldDayMs, 0.9).toFixed(1)} ms, max ${Math.max(...coldDayMs).toFixed(1)} ms · cold 7-day overview ${Math.round(mean(coldWeekMs))} ms (max ${Math.round(Math.max(...coldWeekMs))}) · cache hit ${hitUs.toFixed(1)} µs · fareAt ${fareUs.toFixed(2)} µs`);

if (failures > 0) {
  console.error(`\n${failures} search check(s) failed, ${warnings} warning(s).`);
  process.exit(1);
}
console.log(`\nSearch checks passed (${warnings} warning(s)).`);
