/*
 * Checks version D's published-schedule path (shared/src/schedule.ts) against docs/REAL_DATA.md,
 * "Step 1 build specification". Run from the repo root:
 *
 *   npx tsx shared/scripts/check-schedule.ts        (also: npm run test -w shared)
 *
 * The generator as a provider (generatedSchedule → optionsFromSchedule) reproduces searchFlights
 * field for field on a sample of route-days across markets; real-looking rows (a 737 MAX, a regional
 * partner outside the catalogue, an unknown carrier on an unknown type, a red-eye, a duplicate, a
 * published terminal, a block too short) build full dashboard flights; the catalogue's new types and
 * the code/name mapping; the fallback carrier profile; determinism, key uniqueness, departure order,
 * no clock; every string the new code contributes passes the banned-word rules; and the study's
 * generator is untouched by all of it. Exits non-zero on any failure.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { generatedSchedule, optionsFromSchedule, resolveAircraft, resolveAircraftKey, type RouteDaySchedule, type ScheduleRow } from "../src/schedule";
import { fareAt, hasNonstopService, optionKey, searchFlights } from "../src/search";
import { generateFlight, normalizeInput, routeDay } from "../src/fakeFlight";
import { AIRLINES, fallbackAirlineProfile, getAirline } from "../src/airlines";
import { AIRCRAFT_MODELS, cabinConfigFor, columnGroupsFor, fleetAgesFor, getAircraftModel } from "../src/aircraft";
import { SCHEDULE_DAYS } from "../src/forecast";
import { addDays, timeToMinutes } from "../src/dates";
import { hashId } from "../src/random";
import type { CrewInfo, Flight, FlightInput, FlightPhase } from "../src/types";

let failures = 0;
let warnings = 0;
const failed = new Map<string, number>();
function check(ok: boolean, message: string): void {
  if (ok) return;
  failures += 1;
  const kind = message.replace(/^[^:]*: /, "").replace(/[\d.]+/g, "#").slice(0, 60);
  const seen = (failed.get(kind) ?? 0) + 1;
  failed.set(kind, seen);
  if (seen <= 3) console.error(`  FAIL ${message}`);
}
function warn(message: string): void {
  warnings += 1;
  if (warnings <= 10) console.warn(`  warn ${message}`);
}
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const FETCHED_AT = "2026-11-04T12:00:00.000Z";

// ── Word rules (the generator's, plus the team's list) ──────────────────────

const FORBIDDEN =
  /\b(crash\w*|danger\w*|severe\w*|emergenc\w*|warning\w*|fatal\w*|accident\w*|incident\w*|death\w*|die|dies|died|dying|risk\w*|fear\w*|alarm\w*|worr(y|ies|ied|ying))\b|\bsafe\b/i;
const DISCOURAGED = /\b(storm\w*|thunder\w*|lightning|fail\w*|plunge\w*|stall\w*|panic\w*|scary|violent\w*|rough)\b/i;
const OVERCLAIM = /\b(quietest|safest|smoothest|most advanced|smooths? out|eliminat\w*|never|in the sky)\b/i;
const YOUR_FLIGHT = /\byour (flight|departure|arrival|pilots?|plane|aircraft)\b/i;
const PHASES: FlightPhase[] = ["takeoff", "climb", "cruise", "descent", "landing"];

function stringsOf(value: unknown, path: string, out: Array<[string, string]>): void {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => stringsOf(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value as Record<string, unknown>)) stringsOf(v, `${path}.${k}`, out);
}

function checkWords(tag: string, value: unknown): void {
  const strings: Array<[string, string]> = [];
  stringsOf(value, tag, strings);
  for (const [path, text] of strings) {
    const m = FORBIDDEN.exec(text);
    check(!m, `${tag}: banned word "${m?.[0]}" at ${path}: "${text}"`);
    const d = DISCOURAGED.exec(text);
    if (d) warn(`${tag}: discouraged word "${d[0]}" at ${path}: "${text}"`);
    check(!text.includes("!") && !/undefined|NaN|\[object/.test(text), `${tag}: bad text at ${path}: "${text}"`);
    check(!YOUR_FLIGHT.test(text), `${tag}: "${YOUR_FLIGHT.exec(text)?.[0]}" at ${path} (a schedule never says "your flight")`);
  }
}

// ── A/B safety, part 1: the study's generator before any schedule ───────────

const AB_INPUTS: FlightInput[] = [
  { origin: "JFK", destination: "LAX", date: "2026-11-26" },
  { origin: "LGA", destination: "BOS", date: "2026-12-03" },
  { origin: "SFO", destination: "NRT", date: "2027-01-12" },
  { origin: "LHR", destination: "JFK", date: "2027-06-20" },
  { origin: "DEL", destination: "BOM", date: "2027-07-11" },
  { origin: "Fargo", destination: "Orlando", date: "2027-07-04" },
];
const abHash = () => sha(AB_INPUTS.map((i) => JSON.stringify([generateFlight(i), generateFlight(i, { departWindow: "evening" }), generateFlight(i, { bodyType: "wide" })])).join("\n"));
const abBefore = abHash();

// ── The catalogue: the study's types untouched, the schedule-only types added ─

const STUDY_KEYS = ["A220-300", "A320neo", "A321neo", "737-800", "737-900ER", "757-200", "A330-900neo", "A350-900", "A350-1000", "767-300ER", "777-300ER", "787-9", "787-10"];
const NEW_KEYS = ["737-700", "737 MAX 8", "737 MAX 9", "A319", "A320-200", "A321-200", "777-200ER", "787-8", "A330-300", "A330-200", "E175", "CRJ-900", "CRJ-700", "747-8", "A380-800"];
check(JSON.stringify(AIRCRAFT_MODELS.slice(0, STUDY_KEYS.length).map((m) => m.key)) === JSON.stringify(STUDY_KEYS), "the study's catalogue comes first, in its order");
check(AIRCRAFT_MODELS.slice(0, STUDY_KEYS.length).every((m) => !m.scheduleOnly), "a study type is marked schedule-only");
check(JSON.stringify(AIRCRAFT_MODELS.slice(STUDY_KEYS.length).map((m) => m.key)) === JSON.stringify(NEW_KEYS), `the schedule-only types: ${AIRCRAFT_MODELS.slice(STUDY_KEYS.length).map((m) => m.key).join(", ")}`);
const inFleets = new Set(AIRLINES.flatMap((a) => a.fleet));
const icaos = new Set<string>();
const MANUFACTURERS = new Set(["Airbus", "Boeing", "Embraer", "Bombardier"]);
for (const m of AIRCRAFT_MODELS) {
  const tag = `catalogue ${m.key}`;
  check(getAircraftModel(m.key) === m, `${tag}: getAircraftModel`);
  check(/^[A-Z0-9]{3,4}$/.test(m.icao) && !icaos.has(m.icao), `${tag}: ICAO code ${m.icao} malformed or shared`);
  icaos.add(m.icao);
  check(MANUFACTURERS.has(m.manufacturer) && m.fullName.startsWith(m.manufacturer) && m.fullName.includes(m.model), `${tag}: names ${m.manufacturer} / ${m.fullName}`);
  check(m.cabinNoiseDb >= 78 && m.cabinNoiseDb <= 86, `${tag}: cabin noise ${m.cabinNoiseDb} dB`);
  check(m.typicalSeats >= 60 && m.typicalSeats <= 560 && Number.isInteger(m.typicalSeats), `${tag}: ${m.typicalSeats} seats`);
  check(m.modelInServiceSince >= 1980 && m.modelInServiceSince <= 2026 && (m.productionEnded === undefined || (m.productionEnded >= m.modelInServiceSince && m.productionEnded <= 2026)), `${tag}: years ${m.modelInServiceSince}–${m.productionEnded ?? "today"}`);
  check(m.modelFleetSize >= 30 && m.rangeMi >= 1500 && m.rangeMi <= 10000 && m.cruiseAltitudeFt >= 35000 && m.cruiseAltitudeFt <= 43000 && m.cruiseSpeedMph >= 480 && m.cruiseSpeedMph <= 600, `${tag}: fleet / range / cruise facts`);
  check(m.seatWidthIn >= 17 && m.seatWidthIn <= 18.5 && ["narrow", "wide"].includes(m.bodyType) && columnGroupsFor(m.seatLayout).map((g) => g.length).join("-") === m.seatLayout, `${tag}: seat width ${m.seatWidthIn} / layout ${m.seatLayout}`);
  check((m.bodyType === "wide") === (m.seatLayout.split("-").length === 3), `${tag}: ${m.bodyType} with a ${m.seatLayout} cabin`);
  check(m.safetyRecord.length >= 4 && new Set(m.safetyRecord).size === m.safetyRecord.length, `${tag}: ${m.safetyRecord.length} model facts`);
  for (const line of m.safetyRecord) {
    check(!OVERCLAIM.test(line), `${tag}: overclaiming model fact "${line}"`);
    const layout = /\b\d-\d(?:-\d)?\b/.exec(line);
    check(!layout || layout[0] === m.seatLayout, `${tag}: model fact names a ${layout?.[0]} cabin, the type has ${m.seatLayout}`);
  }
  checkWords(tag, { model: m.model, fullName: m.fullName, safetyRecord: m.safetyRecord });
  // The round trip a schedule makes: the type's own code and names come back as its key, exactly.
  for (const aircraft of [{ code: m.icao }, { name: m.fullName }, { name: m.model }, { code: m.icao, name: m.fullName }, { code: m.icao.toLowerCase(), name: ` ${m.fullName.toLowerCase()} ` }]) {
    const match = resolveAircraft(aircraft);
    check(match.key === m.key && !match.approximate, `${tag}: ${JSON.stringify(aircraft)} resolves to ${match.key}${match.approximate ? " (approximate)" : ""}`);
  }
  if (m.scheduleOnly) check(!inFleets.has(m.key), `${tag}: a schedule-only type is in an airline's fleet`);
  else check(inFleets.has(m.key), `${tag}: a study type no airline flies`);
}
check(JSON.stringify(columnGroupsFor("2-2")) === JSON.stringify([["A", "B"], ["C", "D"]]), "2-2 column groups");
check(JSON.stringify(columnGroupsFor("3-3")) === JSON.stringify([["A", "B", "C"], ["D", "E", "F"]]) && JSON.stringify(columnGroupsFor("2-3-2")) === JSON.stringify([["A", "C"], ["D", "E", "F"], ["H", "K"]]), "existing column groups unchanged");
// The study's "newer designs are quieter" ordering holds with the new types in place.
const NEWER = ["A220-300", "A320neo", "A321neo", "A330-900neo", "A350-900", "A350-1000", "787-9", "787-10", "787-8", "737 MAX 8", "737 MAX 9", "A380-800"];
const OLDER = ["737-800", "737-900ER", "757-200", "767-300ER", "777-300ER", "737-700", "777-200ER", "A319", "A320-200", "A321-200", "CRJ-700", "CRJ-900"];
const noise = (keys: string[]) => keys.map((k) => getAircraftModel(k)!.cabinNoiseDb);
check(Math.max(...noise(NEWER)) <= Math.min(...noise(OLDER)), "a newer design is louder than the older ones");

// Cabins and fleet ages for the new types, for catalogue airlines and for one outside it.
for (const airline of ["DL", "AA", "OO", "ZZ"]) {
  for (const key of NEW_KEYS) {
    const model = getAircraftModel(key)!;
    const tag = `${airline} ${key} cabin`;
    const cabin = cabinConfigFor(airline, model);
    check(cabin === cabinConfigFor(airline, model), `${tag}: not cached`);
    const abreast = cabin.seatLayout.split("-").reduce((n, g) => n + Number(g), 0);
    check(cabin.seatLayout === model.seatLayout && columnGroupsFor(cabin.seatLayout).flat().length === abreast, `${tag}: layout ${cabin.seatLayout}`);
    const rows = cabin.rowNumbers;
    const expectedRows: [number, number] = abreast <= 4 ? [16, 20] : model.bodyType === "narrow" ? [18, 26] : [20, 28];
    check(rows.length >= expectedRows[0] && rows.length <= expectedRows[1] && rows.every((r, i) => i === 0 || r > rows[i - 1]), `${tag}: ${rows.length} rows`);
    check(abreast > 4 || (rows[0] >= 4 && rows[0] <= 10), `${tag}: a regional jet's map starts at row ${rows[0]}`);
    check(0 < cabin.wingFirstIndex && cabin.wingFirstIndex < cabin.wingLastIndex && cabin.wingLastIndex < rows.length - 1, `${tag}: wing rows`);
    const overWing = rows.slice(cabin.wingFirstIndex, cabin.wingLastIndex + 1);
    check(cabin.exitRows.length >= 1 && cabin.exitRows.every((r) => overWing.includes(r)), `${tag}: exit rows ${cabin.exitRows.join(",")} not over the wing`);
    check(cabin.typicalSeats >= model.typicalSeats * 0.9 && cabin.typicalSeats <= model.typicalSeats * 1.1 && cabin.seatWidthIn === model.seatWidthIn, `${tag}: ${cabin.typicalSeats} seats, ${cabin.seatWidthIn} in`);
    for (const year of [2026, 2027]) {
      const ages = fleetAgesFor(airline, model, year);
      check(JSON.stringify(ages) === JSON.stringify(fleetAgesFor(airline, model, year)), `${tag} ${year}: fleet ages not deterministic`);
      check(ages.min >= 0.8 && ages.min <= ages.avg && ages.avg <= ages.max && ages.max <= year - model.modelInServiceSince, `${tag} ${year}: fleet ages ${ages.min}/${ages.avg}/${ages.max}`);
      if (model.productionEnded !== undefined) check(ages.min >= year - model.productionEnded - 1, `${tag} ${year}: a ${key} younger than the last one built (${ages.min})`);
    }
  }
}

// ── resolveAircraftKey: the codes and names real schedules use ──────────────

const CODES: Record<string, string> = {
  // ICAO
  B738: "737-800", B737: "737-700", B38M: "737 MAX 8", B39M: "737 MAX 9", B739: "737-900ER", B752: "757-200", B763: "767-300ER",
  B772: "777-200ER", B77W: "777-300ER", B788: "787-8", B789: "787-9", B78X: "787-10", B744: "747-8", B748: "747-8", A319: "A319",
  A320: "A320-200", A20N: "A320neo", A321: "A321-200", A21N: "A321neo", A332: "A330-200", A333: "A330-300", A339: "A330-900neo",
  A359: "A350-900", A35K: "A350-1000", A388: "A380-800", BCS3: "A220-300", E75L: "E175", E75S: "E175", E170: "E175", E190: "E175",
  CRJ7: "CRJ-700", CRJ9: "CRJ-900", CR9: "CRJ-900", CR7: "CRJ-700",
  // IATA
  "73G": "737-700", "738": "737-800", "7M8": "737 MAX 8", "7M9": "737 MAX 9", "739": "737-900ER", "752": "757-200", "763": "767-300ER",
  "772": "777-200ER", "77W": "777-300ER", "788": "787-8", "789": "787-9", "781": "787-10", "744": "747-8", "748": "747-8", "319": "A319",
  "320": "A320-200", "32N": "A320neo", "321": "A321-200", "32Q": "A321neo", "332": "A330-200", "333": "A330-300", "339": "A330-900neo",
  "359": "A350-900", "351": "A350-1000", "388": "A380-800", "223": "A220-300", E75: "E175", E7W: "E175", E70: "E175", E90: "E175",
};
const APPROXIMATE_CODES = new Set(["B744", "744", "E170", "E190", "E70", "E90"]);
for (const [code, key] of Object.entries(CODES)) {
  const match = resolveAircraft({ code });
  check(match.key === key, `code ${code} → ${match.key}, expected ${key}`);
  check(match.approximate === APPROXIMATE_CODES.has(code), `code ${code}: approximate flag ${match.approximate}`);
  check(resolveAircraftKey({ code: ` ${code.toLowerCase()} ` }) === key && resolveAircraftKey({ code: "", name: code }) === key, `code ${code}: case, spaces, or given as the name`);
  check(Boolean(getAircraftModel(match.key)), `code ${code}: ${match.key} is not a catalogue key`);
}
const NAMES: Record<string, [string, boolean]> = {
  "Boeing 737-800": ["737-800", false], "Airbus A321neo": ["A321neo", false], "Boeing 737 MAX 8": ["737 MAX 8", false], "Embraer 175": ["E175", false],
  "Canadair Regional Jet 900": ["CRJ-900", false], "Boeing 737 MAX 9": ["737 MAX 9", false], "Boeing 737-700": ["737-700", false], "Boeing 737-900ER": ["737-900ER", false],
  "Boeing 737-900": ["737-900ER", false], "Boeing 737-800 (winglets)": ["737-800", false], "Boeing 737-8": ["737 MAX 8", false], "Boeing 737-9": ["737 MAX 9", false],
  "Boeing 737 MAX": ["737 MAX 8", true], "Boeing 737 MAX 10": ["737 MAX 9", true], "Boeing 737": ["737-800", true], "Boeing 737-300": ["737-700", true],
  "Airbus A319": ["A319", false], "Airbus A320": ["A320-200", false], "Airbus A320-200": ["A320-200", false], "Airbus A320-232": ["A320-200", false],
  "Airbus A321": ["A321-200", false], "Airbus A321-200": ["A321-200", false], "Airbus A321-271N": ["A321neo", false], "Airbus A321LR": ["A321neo", false],
  "Airbus A320neo": ["A320neo", false], "Airbus A320-251N": ["A320neo", false], "Airbus A318": ["A319", true], "Airbus A220-300": ["A220-300", false],
  "Airbus A220-100": ["A220-300", true], "Boeing 757-200": ["757-200", false], "Boeing 767-300ER": ["767-300ER", false], "Boeing 767-400ER": ["767-300ER", true],
  "Boeing 777-200ER": ["777-200ER", false], "Boeing 777-200": ["777-200ER", false], "Boeing 777-200LR": ["777-200ER", true], "Boeing 777-300ER": ["777-300ER", false],
  "Boeing 777-9": ["777-300ER", true], "Boeing 787-8 Dreamliner": ["787-8", false], "Boeing 787-9": ["787-9", false], "Boeing 787-10": ["787-10", false],
  "Boeing 787 Dreamliner": ["787-9", true], "Boeing 747-8": ["747-8", false], "Boeing 747-8I": ["747-8", false], "Boeing 747-400": ["747-8", true],
  "Airbus A330-300": ["A330-300", false], "Airbus A330-200": ["A330-200", false], "Airbus A330-243": ["A330-200", false], "Airbus A330-900neo": ["A330-900neo", false],
  "Airbus A330-941": ["A330-900neo", false], "Airbus A330neo": ["A330-900neo", false], "Airbus A330-800": ["A330-900neo", true], "Airbus A330": ["A330-300", true],
  "Airbus A340-300": ["A330-300", true], "Airbus A350-900": ["A350-900", false], "Airbus A350-1000": ["A350-1000", false], "Airbus A350": ["A350-900", false],
  "Airbus A380-800": ["A380-800", false], "Airbus A380": ["A380-800", false], "Embraer ERJ-175": ["E175", false], "Embraer E175": ["E175", false],
  "Embraer 175 (enhanced winglets)": ["E175", false], "Embraer 170": ["E175", true], "Embraer 190": ["E175", true], "Embraer E195-E2": ["E175", true],
  "Embraer ERJ-145": ["E175", true], "Bombardier CRJ-900": ["CRJ-900", false], "Mitsubishi CRJ-900": ["CRJ-900", false], "CRJ900": ["CRJ-900", false],
  "Canadair Regional Jet 700": ["CRJ-700", false], "Bombardier CRJ-700": ["CRJ-700", false], "Canadair Regional Jet 1000": ["CRJ-900", true],
  "Bombardier CRJ-200": ["CRJ-700", true], "De Havilland Dash 8-400": ["E175", true], "ATR 72-600": ["E175", true], "ATR 42-500": ["CRJ-700", true],
  "McDonnell Douglas MD-11": ["787-9", true], "Mystery jet": ["A320neo", true], "": ["A320neo", true],
};
for (const [name, [key, approximate]] of Object.entries(NAMES)) {
  const match = resolveAircraft({ name });
  check(match.key === key && match.approximate === approximate, `name "${name}" → ${match.key}${match.approximate ? " (approximate)" : ""}, expected ${key}${approximate ? " (approximate)" : ""}`);
}
check(resolveAircraftKey({}) === "A320neo" && resolveAircraftKey({ code: "XX99", name: "Mystery jet" }) === "A320neo", "nothing to go on → the single-aisle default");
check(resolveAircraftKey({ code: "B744", name: "Boeing 747-400" }) === "747-8" && resolveAircraftKey({ code: "ZZZZ", name: "Boeing 777-300ER" }) === "777-300ER", "an unknown code defers to the name");
check(resolveAircraftKey({ code: "B38M", name: "Boeing 737-800" }) === "737 MAX 8", "the code comes before the name");

// ── fallbackAirlineProfile ──────────────────────────────────────────────────

const skywest = fallbackAirlineProfile("oo", " SkyWest Airlines ");
check(skywest.code === "OO" && skywest.name === "SkyWest Airlines" && skywest.country === "US" && skywest.region === "NA", `SkyWest fallback ${JSON.stringify(skywest)}`);
check(skywest.hubs.length === 0 && skywest.fleet.length === 0 && skywest.fareTier === undefined && skywest.amenities.length >= 3 && skywest.tailPatterns.length > 0, "fallback: standard tier, no hubs, no fleet, amenities, a tail pattern");
check(JSON.stringify(skywest) === JSON.stringify(fallbackAirlineProfile("OO", "SkyWest Airlines")), "fallback: deterministic");
const unknown = fallbackAirlineProfile("ZZ");
check(unknown.name === "ZZ" && unknown.country === "" && unknown.tailPatterns.length > 0, `unknown carrier fallback ${JSON.stringify(unknown)}`);
check(fallbackAirlineProfile("ZZ", "Zed Air", "gb").country === "GB" && fallbackAirlineProfile("ZZ", "Zed Air", "GB").tailPatterns[0] === "G-LLLL", "fallback: the caller's country wins, with its registration style");
check(fallbackAirlineProfile("FR").country === "IE" && fallbackAirlineProfile("WS").country === "CA" && fallbackAirlineProfile("U2").country === "GB", "fallback: known carriers' countries");
check(getAirline("DL")?.name === "Delta Air Lines" && getAirline("OO") === undefined, "getAirline unchanged by the fallback");
checkWords("fallback profile", { name: skywest.name, amenities: skywest.amenities });

// ── The generator as a provider reproduces searchFlights ────────────────────

const SAMPLE: FlightInput[] = [
  { origin: "JFK", destination: "LAX", date: "2026-11-26" }, // busy, Thanksgiving
  { origin: "LGA", destination: "BOS", date: "2026-12-05" }, // busy, Saturday, perimeter airport inside its limit
  { origin: "ATL", destination: "MCO", date: "2027-02-13" }, // busy, Saturday
  { origin: "ORD", destination: "DEN", date: "2027-03-14" }, // US clocks change
  { origin: "SEA", destination: "HNL", date: "2027-07-09" }, // long domestic
  { origin: "BOI", destination: "SEA", date: "2026-10-17" }, // ordinary
  { origin: "JFK", destination: "LHR", date: "2027-03-28" }, // long, EU clocks change
  { origin: "SFO", destination: "NRT", date: "2027-01-12" }, // long, overnight westbound
  { origin: "LHR", destination: "CDG", date: "2026-11-01" }, // busy, Europe
  { origin: "DEL", destination: "BOM", date: "2027-05-22" }, // busy, South Asia
  { origin: "LAX", destination: "SYD", date: "2026-12-30" }, // oceanic, overnight, a curfew
  { origin: "GRU", destination: "EZE", date: "2027-08-21" }, // South America
  { origin: "LGA", destination: "LAX", date: "2026-11-26" }, // perimeter: flown from JFK
  { origin: "New York", destination: "Los Angeles", date: "2027-04-04" }, // typed city names
  { origin: "DCA", destination: "LHR", date: "2027-05-22" }, // perimeter: flown from Dulles
  { origin: "JFK", destination: "LAX", date: addDays("2026-11-04", SCHEDULE_DAYS) }, // the far end of the booking horizon
];
let daysWithFlights = 0;
let flightsReproduced = 0;
let reproduceMs = 0;
for (const q of SAMPLE) {
  const tag = `${q.origin}-${q.destination} ${q.date}`;
  const norm = normalizeInput(q);
  const day = routeDay(norm);
  const ref = searchFlights(q);
  const gen = generatedSchedule(q, FETCHED_AT);
  check(gen.provider === "generator" && gen.fetchedAt === FETCHED_AT && gen.origin === norm.origin && gen.destination === norm.destination && gen.date === norm.date, `${tag}: schedule header ${JSON.stringify({ ...gen, rows: gen.rows.length })}`);
  check(gen.served === hasNonstopService(q.origin, q.destination) && gen.served === (gen.rows.length > 0), `${tag}: served ${gen.served} with ${gen.rows.length} rows`);
  check(JSON.stringify(gen) === JSON.stringify(generatedSchedule({ ...q }, FETCHED_AT)), `${tag}: generatedSchedule not deterministic`);
  gen.rows.forEach((row, i) => {
    const rtag = `${tag} row ${i}`;
    check(/^[A-Z0-9]{2}$/.test(row.airline) && Boolean(getAirline(row.airline)) && row.airlineName === getAirline(row.airline)?.name, `${rtag}: airline ${row.airline}`);
    check(/^\d{1,4}$/.test(row.number) && `${row.airline} ${row.number}` === ref.options[i]?.flight.flightNumber, `${rtag}: number "${row.number}"`);
    check(row.origin === day.origin.code && row.destination === day.destination.code && row.date === norm.date, `${rtag}: endpoints ${row.origin}-${row.destination} ${row.date}`);
    check(/^\d{2}:\d{2}$/.test(row.departTime) && /^\d{2}:\d{2}$/.test(row.arriveTime) && [-1, 0, 1, 2].includes(row.arriveDayOffset), `${rtag}: times ${row.departTime} → ${row.arriveTime} +${row.arriveDayOffset}`);
    check(i === 0 || timeToMinutes(row.departTime) > timeToMinutes(gen.rows[i - 1].departTime), `${rtag}: not after the previous row`);
    check(Number.isInteger(row.blockMin) && row.blockMin >= day.airborneMin + 15, `${rtag}: block ${row.blockMin} for ${day.airborneMin} min in the air`);
    const model = AIRCRAFT_MODELS.find((m) => m.icao === row.aircraft.code);
    check(Boolean(model) && row.aircraft.name === model?.fullName && !model?.scheduleOnly, `${rtag}: aircraft ${JSON.stringify(row.aircraft)}`);
    check(row.terminal === undefined && row.codeshares === undefined, `${rtag}: the generator publishes no terminal or codeshares`);
    const f = ref.options[i]?.flight;
    check(Boolean(f) && f.departTime === row.departTime && f.arriveTime === row.arriveTime && f.arriveDayOffset === row.arriveDayOffset && f.blockMin === row.blockMin, `${rtag}: times differ from searchFlights'`);
  });

  const t0 = performance.now();
  const opts = optionsFromSchedule(gen);
  reproduceMs += performance.now() - t0;
  check(JSON.stringify(opts) === JSON.stringify(ref), `${tag}: optionsFromSchedule(generatedSchedule) is not searchFlights (${opts.options.length} vs ${ref.options.length} options)`);
  check(JSON.stringify(optionsFromSchedule(gen)) === JSON.stringify(opts), `${tag}: optionsFromSchedule not deterministic`);
  check(JSON.stringify(optionsFromSchedule({ ...gen, fetchedAt: "2027-01-01T00:00:00.000Z", provider: "aerodatabox" })) === JSON.stringify(opts), `${tag}: options depend on fetchedAt or the provider name`);
  check(Object.isFrozen(opts) && Object.isFrozen(opts.options), `${tag}: results not frozen`);
  check(JSON.stringify(opts.query) === JSON.stringify(norm), `${tag}: query not the normalized input`);
  const keys = opts.options.map((o) => o.key);
  check(new Set(keys).size === keys.length && keys.every((k, i) => k === optionKey(opts.options[i].flight) && k === `${gen.rows[i].airline}${gen.rows[i].number}`), `${tag}: keys ${keys.join(",")}`);
  check(opts.options.every((o, i) => i === 0 || timeToMinutes(o.flight.departTime) >= timeToMinutes(opts.options[i - 1].flight.departTime)), `${tag}: options not by departure time`);
  check(opts.options.every((o, i) => [0, 1, 7, 35, 63, 330].every((d) => fareAt(o, d) === fareAt(ref.options[i], d))), `${tag}: fareAt differs`);
  // Rows in any order, with a repeat: the same day, the first row of a key kept.
  const shuffled: RouteDaySchedule = { ...gen, rows: [...gen.rows].reverse() };
  if (gen.rows.length > 0) shuffled.rows.push({ ...gen.rows[0], departTime: "23:55", aircraft: { name: "Boeing 777-300ER" } });
  check(JSON.stringify(optionsFromSchedule(shuffled)) === JSON.stringify(opts), `${tag}: rows out of order or repeated change the day`);
  if (opts.options.length > 0) {
    daysWithFlights++;
    flightsReproduced += opts.options.length;
  }
}
check(daysWithFlights >= 12, `${daysWithFlights} route-days with flights reproduced (need 12)`);
let threw = false;
try {
  optionsFromSchedule({ origin: "JFK", destination: "LAX", date: "2026-02-30", provider: "generator", fetchedAt: FETCHED_AT, rows: [], served: null });
} catch {
  threw = true;
}
check(threw, "an invalid date must throw (like searchFlights)");
const empty = optionsFromSchedule({ origin: "JFK", destination: "LAX", date: "2026-11-26", provider: "aerodatabox", fetchedAt: FETCHED_AT, rows: [], served: null });
check(empty.options.length === 0 && Object.isFrozen(empty.options) && empty.query.origin === "JFK", "a day with no rows has no options");

// ── Real-looking rows: a provider's day on JFK–LAX ──────────────────────────

const REAL_DAY = "2027-02-10";
const realDay = routeDay({ origin: "JFK", destination: "LAX", date: REAL_DAY });
const base = { origin: "JFK", destination: "LAX", date: REAL_DAY, arriveTime: "12:00", arriveDayOffset: 0 };
const REAL_ROWS: ScheduleRow[] = [
  { ...base, airline: "OO", airlineName: "SkyWest Airlines", number: "3456", departTime: "10:20", blockMin: 378, aircraft: { code: "E75L", name: "Embraer 175" } },
  { ...base, airline: "DL", airlineName: "Delta Air Lines", number: "423", departTime: "06:00", blockMin: 385, aircraft: { code: "B738" }, terminal: "7", codeshares: ["AF", "KL", "VS"] },
  { ...base, airline: "AA", number: "1", departTime: "07:30", blockMin: 375, aircraft: { name: "Boeing 737 MAX 8" } },
  { ...base, airline: "B6", number: "623", departTime: "08:45", blockMin: 380, aircraft: { code: "A21N", name: "Airbus A321neo" } },
  { ...base, airline: "UA", number: "2021", departTime: "09:10", blockMin: 390, aircraft: { name: "Boeing 777-200ER" } },
  { ...base, airline: "ZZ", number: "99", departTime: "11:00", blockMin: 377, aircraft: { code: "XX99", name: "Mystery jet" } },
  { ...base, airline: "QF", airlineName: "Qantas", number: "12", departTime: "00:30", blockMin: 380, aircraft: { code: "A388" } },
  { ...base, airline: "B6", number: "623", departTime: "20:00", blockMin: 380, aircraft: { name: "Airbus A320" } }, // repeats a key: dropped
  { ...base, airline: "AA", number: "2", departTime: "15:00", blockMin: 200, aircraft: { code: "B772" } }, // block shorter than the day's airborne time
  { ...base, airline: "dl", number: " 1423 ", departTime: "17:05", blockMin: 376.4, aircraft: { code: "B739" } }, // untidy, off the 5-minute grid
  { ...base, airline: "9E", airlineName: "Endeavor Air", number: "5123", departTime: "23:45", blockMin: 375, aircraft: { code: "CRJ9", name: "Canadair Regional Jet 900" } },
  { ...base, airline: "AA", number: "3", departTime: "24:10", blockMin: 375, aircraft: { code: "B738" } }, // not a wall-clock time: left out
  { ...base, airline: "", number: "4", departTime: "12:10", blockMin: 375, aircraft: { code: "B738" } }, // no carrier: left out
];
const realSchedule: RouteDaySchedule = { origin: "JFK", destination: "LAX", date: REAL_DAY, provider: "aerodatabox", fetchedAt: FETCHED_AT, rows: REAL_ROWS, served: true };
const refJson = JSON.stringify(searchFlights({ origin: "JFK", destination: "LAX", date: REAL_DAY }));
const t1 = performance.now();
const real = optionsFromSchedule(realSchedule);
const realMs = performance.now() - t1;
check(JSON.stringify(optionsFromSchedule(realSchedule)) === JSON.stringify(real), "real rows: not deterministic");
const realKeys = real.options.map((o) => o.key);
check(JSON.stringify(realKeys) === JSON.stringify(["QF12", "DL423", "AA1", "B6623", "UA2021", "OO3456", "ZZ99", "AA2", "DL1423", "9E5123"]), `real rows: keys ${realKeys.join(",")}`);
const byKey = new Map(real.options.map((o) => [o.key, o]));
const flightOf = (key: string): Flight => byKey.get(key)!.flight;

// The published arrival and block are what the flight shows; a short block keeps its arrival and the air time fits inside it.
check(flightOf("DL423").arriveTime === "12:00" && flightOf("DL423").arriveDayOffset === 0 && flightOf("DL423").blockMin === 385, "real rows: the published arrival and block are kept");
check(
  flightOf("AA2").blockMin === 200 && flightOf("AA2").airborneMin === 185 && flightOf("AA2").arriveTime === "12:00" && flightOf("AA2").weather.destination.localTime === "12:00",
  `real rows: a short published block keeps its arrival and fits the air time (${flightOf("AA2").airborneMin} of ${flightOf("AA2").blockMin} min)`,
);
check(flightOf("ZZ99").aircraft.listedAs === "Mystery jet" && flightOf("QF12").aircraft.listedAs === undefined && flightOf("OO3456").aircraft.listedAs === undefined, "real rows: a type the catalogue stands in for is listed under the schedule's name, a known type is not");
check(flightOf("ZZ99").aircraft.fullName === "Airbus A320neo" && flightOf("ZZ99").aircraft.model === "A320neo", "real rows: the stand-in type's own facts stay the catalogue's");

const EASA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH",
]);
const NATIONAL_REGULATORS: Record<string, string> = { CA: "Transport Canada", AU: "CASA", NZ: "CAA New Zealand", SG: "CAAS", JP: "JCAB", AE: "GCAA", IN: "DGCA" };
function expectedCrew(airlineCountry: string, blockMin: number): CrewInfo {
  const pilots: CrewInfo["pilots"] = blockMin > 12.5 * 60 ? 4 : blockMin > 8.5 * 60 ? 3 : 2;
  if (airlineCountry === "US") return { pilots, regime: "faa", regulator: "FAA" };
  if (airlineCountry === "GB") return { pilots, regime: "easa", regulator: "UK CAA" };
  if (EASA_COUNTRIES.has(airlineCountry)) return { pilots, regime: "easa", regulator: "EASA" };
  return { pilots, regime: "icao", regulator: NATIONAL_REGULATORS[airlineCountry] ?? "the national aviation authority" };
}

/** The dashboard renders every section from these: the shape rules of the generator's own checks. */
function checkFlightShape(tag: string, f: Flight): void {
  check(f.distanceMi >= 120 && f.airborneMin >= 30 && f.blockMin >= f.airborneMin + 15, `${tag}: distance / airborne / block`);
  check(/^\d{2}:\d{2}$/.test(f.departTime) && /^\d{2}:\d{2}$/.test(f.arriveTime) && [-1, 0, 1, 2].includes(f.arriveDayOffset), `${tag}: times`);
  check(f.terminal.length > 0 && /^[A-Z]\d{1,2}$/.test(f.gate), `${tag}: terminal/gate ${f.terminal} ${f.gate}`);
  const ac = f.aircraft;
  const model = getAircraftModel(ac.model);
  check(Boolean(model) && ac.fullName === model?.fullName && ac.bodyType === model?.bodyType && ac.manufacturer === model?.manufacturer, `${tag}: aircraft ${ac.model} vs the catalogue`);
  check(ac.ageYears >= 0.8 && ac.ageYears <= 36 && ac.deliveredYear >= ac.modelInServiceSince && (model?.productionEnded === undefined || ac.deliveredYear <= model.productionEnded), `${tag}: airframe age ${ac.ageYears}, delivered ${ac.deliveredYear}`);
  const [youngest, oldest] = ac.fleetAgeRange;
  check(youngest <= ac.ageYears && ac.ageYears <= oldest && youngest <= ac.fleetAvgAgeYears && ac.fleetAvgAgeYears <= oldest, `${tag}: ages vs the fleet`);
  check(ac.safetyRecord.length >= 4 && /^[A-Z0-9-]{4,}$/.test(ac.tailNumber), `${tag}: aircraft facts / tail ${ac.tailNumber}`);
  check(JSON.stringify(f.crew) === JSON.stringify(expectedCrew(f.airline.country, f.blockMin)), `${tag}: crew ${JSON.stringify(f.crew)} vs the rules for "${f.airline.country}"`);
  const t = f.turbulence;
  check(t.points[0]?.minute === 0 && t.points[t.points.length - 1]?.minute === f.airborneMin && t.points.length >= 7, `${tag}: points span`);
  check(t.phases.length === 5 && t.phases.every((p, i) => p.phase === PHASES[i]) && t.phases[0].startMin === 0 && t.phases[4].endMin === f.airborneMin, `${tag}: phases`);
  check(t.windows.length <= 3 && t.history.flightsAnalyzed >= 180 && t.smoothMinutesPct >= 0 && t.smoothMinutesPct <= 100, `${tag}: windows / history`);
  check(f.smoothness.score >= 58 && f.smoothness.score <= 97 && f.smoothness.summary.length > 10, `${tag}: score ${f.smoothness.score}`);
  check(f.weather.origin.localTime === f.departTime && f.weather.destination.localTime === f.arriveTime && f.weather.origin.airportCode === f.origin.code, `${tag}: weather times`);
  const a = f.airlineStats;
  check(a.safetyScore >= 92 && a.safetyScore <= 99 && a.onTimePct >= 74 && a.onTimePct <= 90 && a.comfortScore >= 7.2 && a.comfortScore <= 9.3 && a.amenities.length >= 3, `${tag}: airline stats`);
  const sm = f.seatMap;
  const letters = sm.columnGroups.flat();
  const rows = sm.rows.map((r) => r.row);
  const cabin = cabinConfigFor(f.airline.code, model!);
  check(sm.columnGroups.map((g) => g.length).join("-") === ac.seatLayout && JSON.stringify(rows) === JSON.stringify(cabin.rowNumbers) && ac.typicalSeats === cabin.typicalSeats, `${tag}: seat map is not ${f.airline.code}'s ${ac.model} cabin`);
  check(sm.rows.some((r) => r.exit) && sm.recommended.length === 3 && sm.recommended.every((id) => letters.includes(id.slice(-1)) && rows.includes(Number(id.slice(0, -1))) && !sm.occupied.includes(id)), `${tag}: exits / recommended seats`);
  const minutes = f.sounds.map((c) => c.minute).filter((m): m is number => m !== null);
  check(f.sounds.length >= 10 && f.sounds.length <= 14 && minutes.every((m, i) => i === 0 || m >= minutes[i - 1]) && new Set(f.sounds.map((c) => c.id)).size === f.sounds.length, `${tag}: sounds`);
  check(/^A3(19|20|21)/.test(ac.model) === f.sounds.some((c) => c.id === "taxi-ptu"), `${tag}: barking-dog cue vs ${ac.model}`);
  check(f.alternatives.length === 0 && JSON.stringify(f.prefs) === "{}", `${tag}: alternatives / prefs`);
  for (const line of ac.safetyRecord) {
    const layout = /\b\d-\d(?:-\d)?\b/.exec(line);
    check(!layout || layout[0] === ac.seatLayout, `${tag}: model fact names a ${layout?.[0]} cabin, this one is ${ac.seatLayout}`);
  }
  checkWords(tag, f);
}
for (const o of real.options) {
  const tag = `real ${o.key}`;
  const f = o.flight;
  check(o.key === optionKey(f) && f.id === hashId(`c|JFK|LAX|${REAL_DAY}|${o.key}`) && JSON.stringify(f.input) === JSON.stringify({ origin: "JFK", destination: "LAX", date: REAL_DAY }), `${tag}: key / id / input`);
  check(Number.isInteger(o.fareUsd) && o.fareUsd >= 39 && [0, 1, 35, 63, 330].every((d) => Number.isInteger(fareAt(o, d)) && fareAt(o, d) >= 39) && fareAt(o, 63) === o.fareUsd, `${tag}: fare ${o.fareUsd}`);
  check(f.airborneMin === realDay.airborneMin && f.origin.code === "JFK" && f.destination.code === "LAX", `${tag}: the day's shared facts`);
  checkFlightShape(tag, f);
}
check(new Set(real.options.map((o) => o.flight.id)).size === real.options.length, "real rows: flight ids unique");
// The rows' own facts came through.
const dl423 = flightOf("DL423");
check(dl423.terminal === "7" && dl423.aircraft.model === "737-800" && dl423.airline.name === "Delta Air Lines" && dl423.departTime === "06:00" && dl423.blockMin === 385, `DL423: ${dl423.terminal} ${dl423.aircraft.model} ${dl423.departTime} ${dl423.blockMin}`);
const aa1 = flightOf("AA1");
check(aa1.aircraft.model === "737 MAX 8" && aa1.aircraft.fullName === "Boeing 737 MAX 8" && aa1.aircraft.modelInServiceSince === 2017 && aa1.crew.regulator === "FAA", `AA1: ${aa1.aircraft.fullName}`);
const ua = flightOf("UA2021");
check(ua.aircraft.model === "777-200ER" && ua.aircraft.bodyType === "wide" && ua.seatMap.columnGroups.length === 3, `UA2021: ${ua.aircraft.fullName}`);
const oo = flightOf("OO3456");
check(oo.airline.name === "SkyWest Airlines" && oo.airline.country === "US" && oo.crew.regime === "faa" && oo.aircraft.model === "E175" && oo.aircraft.manufacturer === "Embraer", `OO3456: ${JSON.stringify(oo.airline)} ${oo.aircraft.fullName} ${JSON.stringify(oo.crew)}`);
check(JSON.stringify(oo.seatMap.columnGroups) === JSON.stringify([["A", "B"], ["C", "D"]]) && oo.seatMap.rows.length >= 16 && oo.seatMap.rows.length <= 20 && oo.aircraft.typicalSeats >= 68 && oo.aircraft.typicalSeats <= 84 && /^N\d{3}[A-Z]{2}$/.test(oo.aircraft.tailNumber), `OO3456: cabin ${oo.seatMap.rows.length} rows, ${oo.aircraft.typicalSeats} seats, tail ${oo.aircraft.tailNumber}`);
const zz = flightOf("ZZ99");
check(zz.airline.name === "ZZ" && zz.airline.country === "" && zz.crew.regime === "icao" && zz.crew.regulator === "the national aviation authority" && zz.aircraft.model === "A320neo", `ZZ99: ${JSON.stringify(zz.airline)} ${zz.aircraft.fullName} ${JSON.stringify(zz.crew)}`);
const qf = flightOf("QF12");
check(qf.departTime === "00:30" && qf.aircraft.model === "A380-800" && qf.aircraft.bodyType === "wide" && qf.crew.regulator === "CASA", `QF12: ${qf.departTime} ${qf.aircraft.fullName} ${JSON.stringify(qf.crew)}`);
const aa2 = flightOf("AA2");
check(aa2.blockMin === 200 && aa2.airborneMin === 185 && aa2.airborneMin < realDay.airborneMin && aa2.aircraft.model === "777-200ER", `AA2: a published 200-minute block is kept, the air time fits inside it (${aa2.airborneMin}; the day's is ${realDay.airborneMin})`);
const dl1423 = flightOf("DL1423");
check(dl1423.flightNumber === "DL 1423" && dl1423.departTime === "17:05" && dl1423.blockMin === 376 && dl1423.aircraft.model === "737-900ER", `DL1423: ${dl1423.flightNumber} ${dl1423.departTime} ${dl1423.blockMin}`);
const crj = flightOf("9E5123");
check(crj.aircraft.model === "CRJ-900" && crj.aircraft.manufacturer === "Bombardier" && crj.airline.name === "Endeavor Air" && crj.crew.regulator === "FAA" && crj.departTime === "23:45", `9E5123: ${crj.aircraft.fullName} ${JSON.stringify(crj.crew)}`);
const b6 = flightOf("B6623");
check(b6.departTime === "08:45" && b6.aircraft.model === "A321neo", `B6623: the first row of a repeated key is kept (${b6.departTime} ${b6.aircraft.model})`);
// Flights in one air block share its bumps: the same body type sees the identical series.
const windowsOf = (f: Flight) => JSON.stringify(f.turbulence.windows.map((w) => [w.phase, w.startMin, w.durationMin, w.intensity]));
check(windowsOf(aa1) === windowsOf(b6) && JSON.stringify(aa1.turbulence.points) === JSON.stringify(b6.turbulence.points) && aa1.smoothness.score === b6.smoothness.score, "AA1 and B6623 (07–09 block, both single-aisle) don't share their air block's bumps");
check(windowsOf(ua) === windowsOf(oo) && ua.turbulence.points.every((p, k) => p.level <= oo.turbulence.points[k].level) && ua.smoothness.score >= oo.smoothness.score, "UA2021 (wide-body, 09–11 block) feels the block's bumps more than OO3456");
// A published terminal only where the row has one: the others are drawn as before.
check(flightOf("AA1").terminal === "8" && flightOf("B6623").terminal === "5", "terminals drawn for rows without one (JFK: AA 8, B6 5)");
console.log(`\nJFK→LAX ${REAL_DAY} from ${REAL_ROWS.length} provider rows · ${real.options.length} flights`);
for (const o of real.options) {
  const f = o.flight;
  console.log(`  ${f.departTime}→${f.arriveTime} ${o.key.padEnd(7)} ${f.airline.name.padEnd(18)} ${f.aircraft.fullName.padEnd(24)} T${f.terminal.padEnd(3)} ${f.crew.pilots} pilots · ${f.crew.regulator.padEnd(32)} seats ${f.aircraft.seatLayout.padEnd(6)} ${String(f.smoothness.score).padStart(3)} · $${o.fareUsd}`);
}

// ── The study's generator and version C's day are untouched ────────────────

check(JSON.stringify(searchFlights({ origin: "JFK", destination: "LAX", date: REAL_DAY })) === refJson, "searchFlights' day changed after optionsFromSchedule built real rows on it");
check(abHash() === abBefore, "generateFlight output changed after schedules were built (cache leak into A/B)");

// ── No clock, no network: the module is pure ────────────────────────────────

const source = readFileSync(new URL("../src/schedule.ts", import.meta.url), "utf8");
for (const pattern of [/Date\.now/, /new Date\(/, /Math\.random/, /\bfetch\(/, /\bprocess\./, /\brequire\(/, /from "node:/, /\bwindow\b/, /\bdocument\b/]) {
  check(!pattern.test(source), `schedule.ts uses ${pattern}`);
}

// ── Speed ───────────────────────────────────────────────────────────────────

check(reproduceMs / SAMPLE.length <= 150 && realMs <= 250, `optionsFromSchedule takes ${(reproduceMs / SAMPLE.length).toFixed(1)} ms per generated day, ${realMs.toFixed(1)} ms for the provider's day (cold)`);

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\nGenerator as a provider · ${daysWithFlights} route-days, ${flightsReproduced} flights reproduce searchFlights field for field · ${(reproduceMs / SAMPLE.length).toFixed(1)} ms per day`);
console.log(`Catalogue · ${AIRCRAFT_MODELS.length} types (${NEW_KEYS.length} schedule-only) · ${Object.keys(CODES).length} codes and ${Object.keys(NAMES).length} names mapped`);
if (failures > 0) {
  console.error(`\n${failures} schedule check(s) failed, ${warnings} warning(s).`);
  process.exit(1);
}
console.log(`\nSchedule checks passed (${warnings} warning(s)).`);
