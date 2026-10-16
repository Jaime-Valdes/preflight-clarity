/*
 * Checks the fake-flight generator: determinism, value ranges, internal
 * consistency, forbidden words, and the real-world feasibility rules
 * (docs/FEASIBILITY.md): crew from the rules only (no pilot profiles anywhere),
 * fleet ages instead of maintenance records, seat maps per airline and model,
 * sound timings on a 5-minute grid. Run from the repo root:
 *
 *   npx tsx shared/scripts/check-fake-flight.ts        (also: npm run test -w shared)
 *
 * Exits non-zero on any failure and prints a compact table to eyeball variety.
 */
import { departWindowOf, flightSeed, generateFlight, normalizeInput, normalizePrefs } from "../src/fakeFlight";
import { AIRPORTS, getAirport, resolveAirport, searchAirports } from "../src/airports";
import { AIRLINES, candidateAirlines, getAirline, isRetiredFlightNumber } from "../src/airlines";
import { AIRCRAFT_MODELS, cabinConfigFor, fleetAgesFor, getAircraftModel } from "../src/aircraft";
import { addDays, timeToMinutes } from "../src/dates";
import type { AlternativeFlight, CrewInfo, DepartWindow, Flight, FlightInput, FlightPhase, FlightPrefs } from "../src/types";

const INPUTS: FlightInput[] = [
  // Short and medium haul, North America
  { origin: "JFK", destination: "BOS", date: "2026-11-26" },
  { origin: "LGA", destination: "ORD", date: "2026-12-20" },
  { origin: "EWR", destination: "MCO", date: "2027-03-14" },
  { origin: "jfk", destination: "lax", date: "2026-10-30" },
  { origin: "SFO", destination: "DEN", date: "2027-01-09" },
  { origin: "DEN", destination: "ATL", date: "2026-07-18" },
  { origin: "LAX", destination: "JFK", date: "2027-02-02" },
  { origin: "SEA", destination: "HNL", date: "2026-08-21" },
  { origin: "DFW", destination: "PHX", date: "2026-06-05" },
  { origin: "MIA", destination: "SJU", date: "2026-09-12" },
  { origin: "BOS", destination: "SFO", date: "2027-05-17" },
  { origin: "YYZ", destination: "YVR", date: "2026-11-02" },
  { origin: "ORD", destination: "MEX", date: "2027-04-22" },
  { origin: "ATL", destination: "CUN", date: "2026-12-27" },
  // Transatlantic and Europe
  { origin: "JFK", destination: "LHR", date: "2026-10-30" },
  { origin: "LHR", destination: "JFK", date: "2027-01-15" },
  { origin: "BOS", destination: "DUB", date: "2026-11-10" },
  { origin: "LHR", destination: "CDG", date: "2027-06-08" },
  { origin: "FRA", destination: "FCO", date: "2026-08-03" },
  { origin: "AMS", destination: "BCN", date: "2027-07-30" },
  { origin: "MAD", destination: "LIS", date: "2026-10-05" },
  { origin: "CDG", destination: "MXP", date: "2027-02-19" },
  { origin: "ARN", destination: "HEL", date: "2026-12-04" },
  { origin: "KEF", destination: "JFK", date: "2027-03-28" },
  // Middle East, Asia, Oceania, Africa, South America
  { origin: "LHR", destination: "DXB", date: "2026-11-21" },
  { origin: "DXB", destination: "DEL", date: "2027-01-30" },
  { origin: "DEL", destination: "BOM", date: "2026-07-11" },
  { origin: "SIN", destination: "SYD", date: "2027-08-14" },
  { origin: "HND", destination: "KIX", date: "2026-11-15" },
  { origin: "HKG", destination: "TPE", date: "2027-04-03" },
  { origin: "ICN", destination: "SFO", date: "2026-10-18" },
  { origin: "JFK", destination: "SIN", date: "2027-05-05" },
  { origin: "SYD", destination: "AKL", date: "2026-12-13" },
  { origin: "JNB", destination: "CPT", date: "2027-01-24" },
  { origin: "NBO", destination: "ADD", date: "2026-09-29" },
  { origin: "CMN", destination: "CDG", date: "2027-06-21" },
  { origin: "GRU", destination: "EZE", date: "2026-08-09" },
  { origin: "SCL", destination: "EZE", date: "2027-02-11" },
  { origin: "BOG", destination: "MIA", date: "2026-10-02" },
  { origin: "LAX", destination: "SYD", date: "2026-12-30" },
  { origin: "SIN", destination: "JFK", date: "2026-11-26" },
  { origin: "PER", destination: "LHR", date: "2027-03-20" },
  { origin: "JFK", destination: "SYD", date: "2026-11-26" },
  { origin: "JFK", destination: "HKG", date: "2027-02-06" },
  // Perimeter airports
  { origin: "LGA", destination: "LAX", date: "2026-11-26" },
  { origin: "LGA", destination: "DEN", date: "2027-04-09" },
  { origin: "DCA", destination: "LAX", date: "2026-12-02" },
  { origin: "DCA", destination: "LHR", date: "2027-05-22" },
  // Free text, aliases and edge cases
  { origin: "New York", destination: "Los Angeles", date: "2026-11-05" },
  { origin: "Boise", destination: "Seattle", date: "2027-03-02" },
  { origin: "boise, id", destination: "Chicago (ORD)", date: "2026-10-23" },
  { origin: "Portland, Maine", destination: "JFK", date: "2026-12-19" },
  { origin: "Fargo", destination: "Orlando", date: "2027-07-04" },
  { origin: "Timbuktu", destination: "Shangri-La", date: "2027-04-14" },
  { origin: "Paris", destination: "Tokyo", date: "2026-11-11" },
  { origin: "JFK", destination: "JFK", date: "2026-10-21" },
  { origin: " sfo ", destination: "  Lhr", date: "2027-01-01" },
  { origin: "São Paulo", destination: "Lisbon", date: "2026-12-24" },
];

const FORBIDDEN =
  /\b(crash\w*|danger\w*|severe\w*|emergenc\w*|warning\w*|fatal\w*|accident\w*|incident\w*|death\w*|die|dies|died|dying|risk\w*)\b/i;
/** Words we'd rather not show anxious flyers; reported as warnings, not failures. */
const DISCOURAGED = /\b(storm\w*|thunder\w*|lightning|fail\w*|plunge\w*|stall\w*|fear\w*|panic\w*|scary|alarm\w*|violent\w*|rough)\b/i;

const PHASES: FlightPhase[] = ["takeoff", "climb", "cruise", "descent", "landing"];

/** Alternative reasons that credit the time of day (only fair more than an hour apart). */
const TIME_OF_DAY = /at its departure time|at its time|at that time|time of day|early in the day|after sunset|afternoon heating|heat-driven|day's warmth|breezier time/;

// ── Feasibility rules (docs/FEASIBILITY.md) ─────────────────────────────────

/**
 * Fields of the old pilot profiles and airframe maintenance records: none may appear anywhere in a Flight
 * ("name" is fine on airports and airlines; the crew object itself may only hold pilots / regime / regulator).
 */
const IMPOSSIBLE_KEYS = new Set([
  "captain", "firstOfficer", "pilot", "initials", "rating", "ratingCount", "totalHours", "hoursOnType", "yearsFlying",
  "timesOnRoute", "base", "background", "badges", "lastInspectionDaysAgo", "lastCheckType", "nextCheckDueDays", "maintenanceStatus",
]);

/** Text of the old pilot profiles: backgrounds and "passengers mention" badges (the removed names.ts), home bases, hours, ratings. */
const PILOT_PROFILE_TEXT = [
  "Air Force veteran", "Navy veteran", "Former flight instructor", "Check pilot", "Started flying gliders", "Former regional airline captain",
  "Flew cargo before passengers", "Aerospace engineering degree", "Mentors new first officers", "Volunteer pilot", "Former airline simulator instructor",
  "Grew up around a family flying club", "Former military pilot", "Joined through the airline's cadet program", "Flew regional turboprops",
  "Aeronautical engineering degree", "Joined from a regional airline", "Former corporate jet pilot", "Aviation university graduate",
  "Flew air ambulance", "Flew survey planes", "Airline cadet program graduate", "Instructs in the simulator",
  "Smooth landings", "Clear announcements", "Calm voice", "Keeps you informed", "Friendly welcome", "Gentle turns", "Explains the bumps",
  "On-time arrivals", "Steady in bumpy air", "Warm goodbye at the door",
];
const PILOT_PROFILE_PATTERN =
  /\b(based in|passengers? mention|passenger ratings?|\d{1,3}(,\d{3})+ (flight )?hours|\d{3,} (flight )?hours|hours on (type|the)|years flying|times on this route)\b/i;
/** A named pilot: "Captain Owen", "Capt. Murphy", "First Officer Jung" (case-sensitive, so "the captain will" passes). */
const NAMED_PILOT = /\b(Capt\. [A-Z]|Captain [A-Z][a-z]|First Officer [A-Z][a-z])/;

/** Model facts are verifiable comparisons: no superlatives, no promises about bumps. */
const OVERCLAIM = /\b(quietest|safest|smoothest|most advanced|smooths? out|eliminat\w*|never|in the sky)\b/i;
/** Copy that assumes the reader is on this flight (version C shows flights the reader isn't on). */
const YOUR_FLIGHT = /\byour (flight|departure|arrival|pilots?|plane|aircraft)\b/i;

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

/** Every key anywhere in a value, with its path. */
function keysOf(value: unknown, path: string, out: Array<[string, string]>) {
  if (Array.isArray(value)) value.forEach((v, i) => keysOf(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out.push([`${path}.${k}`, k]);
      keysOf(v, `${path}.${k}`, out);
    }
  }
}

const isOneDecimal = (x: number) => Math.abs(x * 10 - Math.round(x * 10)) < 1e-9;

/** "About 25 min after takeoff" / "About 1h 5m before landing": every minute count in a timing is a multiple of 5. */
function timingsOnGrid(when: string): boolean {
  for (const m of when.matchAll(/(\d+)h (\d+)m\b/g)) if (Number(m[2]) % 5 !== 0) return false;
  for (const m of when.matchAll(/(\d+) min\b/g)) if (Number(m[1]) % 5 !== 0) return false;
  return true;
}

/** Facts that belong to an airline's fleet of a model (and year), not to one flight: the same on every flight that shares them. */
const FLEET_FACTS = new Map<string, string>();
const SEAT_GEOMETRY = new Map<string, string>();
const OCCUPANCY_BY_CABIN = new Map<string, Set<string>>();

let failures = 0;
let warnings = 0;
function check(cond: boolean, message: string) {
  if (!cond) {
    failures++;
    console.error(`  FAIL ${message}`);
  }
}
function warn(message: string) {
  warnings++;
  console.warn(`  warn ${message}`);
}

function stringsOf(value: unknown, path: string, out: Array<[string, string]>) {
  if (typeof value === "string") out.push([path, value]);
  else if (Array.isArray(value)) value.forEach((v, i) => stringsOf(v, `${path}[${i}]`, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) stringsOf(v, `${path}.${k}`, out);
  }
}

function checkFlight(input: FlightInput, flight: Flight, prefs?: FlightPrefs) {
  const tag = `${input.origin}→${input.destination} ${input.date}${prefs && Object.keys(prefs).length ? " " + JSON.stringify(prefs) : ""}`;
  const again = generateFlight(input, prefs);
  check(JSON.stringify(again) === JSON.stringify(flight), `${tag}: not deterministic`);
  const normTwice = normalizeInput(normalizeInput(input));
  check(JSON.stringify(normTwice) === JSON.stringify(flight.input), `${tag}: normalizeInput is not idempotent`);

  // Route and timing
  check(flight.distanceMi >= 120 && flight.distanceMi <= 12000, `${tag}: distance ${flight.distanceMi}`);
  check(flight.airborneMin >= 30 && flight.airborneMin <= 1200, `${tag}: airborne ${flight.airborneMin}`);
  check(flight.blockMin - flight.airborneMin >= 15 && flight.blockMin - flight.airborneMin <= 35, `${tag}: taxi time`);
  check(/^\d{2}:\d{2}$/.test(flight.departTime) && /^\d{2}:\d{2}$/.test(flight.arriveTime), `${tag}: time format`);
  check(Number(flight.departTime.slice(3)) % 5 === 0, `${tag}: departure not on 5 min`);
  check([-1, 0, 1, 2].includes(flight.arriveDayOffset), `${tag}: day offset ${flight.arriveDayOffset}`);
  check(/^[A-Z]{2}|[A-Z0-9]{2} \d{1,4}$/.test(flight.flightNumber), `${tag}: flight number ${flight.flightNumber}`);
  check(flight.terminal.length > 0 && flight.gate.length > 0, `${tag}: terminal/gate`);

  // Aircraft: the assigned airframe within the airline's fleet of the model; no maintenance records.
  const ac = flight.aircraft;
  const model = getAircraftModel(ac.model);
  check(Boolean(model), `${tag}: unknown model ${ac.model}`);
  check(ac.ageYears >= 0.8 && ac.ageYears <= 36, `${tag}: aircraft age ${ac.ageYears}`);
  check(ac.deliveredYear >= ac.modelInServiceSince, `${tag}: delivered before model entered service`);
  const ended = model?.productionEnded;
  check(ended === undefined || ac.deliveredYear <= ended, `${tag}: ${ac.model} delivered ${ac.deliveredYear} after production ended ${ended}`);
  const [youngest, oldest] = ac.fleetAgeRange;
  check(youngest >= 0.8 && youngest < oldest && oldest <= 36, `${tag}: fleet age range ${youngest}–${oldest}`);
  check(youngest <= ac.ageYears && ac.ageYears <= oldest, `${tag}: airframe age ${ac.ageYears} outside the fleet's ${youngest}–${oldest}`);
  check(youngest <= ac.fleetAvgAgeYears && ac.fleetAvgAgeYears <= oldest, `${tag}: fleet average ${ac.fleetAvgAgeYears} outside ${youngest}–${oldest}`);
  check([ac.ageYears, ac.fleetAvgAgeYears, youngest, oldest].every(isOneDecimal), `${tag}: ages not to one decimal`);
  const year = Number(flight.input.date.slice(0, 4));
  if (model) {
    const fleet = fleetAgesFor(flight.airline.code, model, year);
    check(fleet.avg === ac.fleetAvgAgeYears && fleet.min === youngest && fleet.max === oldest, `${tag}: fleet ages are not the airline's (fleetAgesFor)`);
    check(ended === undefined || youngest >= year - ended - 1, `${tag}: a ${ac.model} younger than the last one built`);
  }
  for (const key of ["lastInspectionDaysAgo", "lastCheckType", "nextCheckDueDays", "maintenanceStatus"]) check(!(key in ac), `${tag}: maintenance field ${key}`);
  check(!/MAX/i.test(ac.model), `${tag}: 737 MAX must not appear`);
  check(ac.safetyRecord.length >= 3, `${tag}: safety record lines`);
  for (const line of ac.safetyRecord) {
    const m = OVERCLAIM.exec(line);
    check(!m, `${tag}: overclaiming model fact "${line}"`);
    const layout = /\b\d-\d(?:-\d)?\b/.exec(line);
    check(!layout || layout[0] === ac.seatLayout, `${tag}: model fact names a ${layout?.[0]} cabin, this one is ${ac.seatLayout}`);
  }
  check(ac.cabinNoiseDb >= 78 && ac.cabinNoiseDb <= 86, `${tag}: cabin noise ${ac.cabinNoiseDb} dB outside measured cruise levels`);
  if (flight.distanceMi >= 2800) check(ac.bodyType === "wide", `${tag}: long route on a narrow-body (${ac.model})`);
  check(!isRetiredFlightNumber(flight.flightNumber), `${tag}: retired flight number ${flight.flightNumber}`);

  // Perimeter airports: short routes only, narrow-body gates.
  const codes = [flight.origin.code, flight.destination.code];
  const other = (code: string) => (flight.origin.code === code ? flight.destination.code : flight.origin.code);
  if (codes.includes("LGA")) check(flight.distanceMi <= 1500 || other("LGA") === "DEN", `${tag}: LGA beyond its perimeter (${flight.distanceMi} mi)`);
  if (codes.includes("DCA"))
    check(flight.distanceMi <= 1250 || ["LAX", "SFO", "SEA", "LAS", "PHX", "SLC", "DEN", "SAN", "AUS", "PDX"].includes(other("DCA")), `${tag}: DCA beyond its perimeter`);
  if (codes.includes("LGA") || codes.includes("DCA")) {
    check(ac.bodyType === "narrow", `${tag}: wide-body at a narrow-body-only airport (${ac.model})`);
    check(flight.alternatives.every((a) => a.bodyType === "narrow"), `${tag}: wide-body alternative at a narrow-body-only airport`);
  }
  // Sensible arrival hours: never inside a curfew, and not in the dead of night except at round-the-clock hubs.
  const arriveHour = Number(flight.arriveTime.slice(0, 2)) + Number(flight.arriveTime.slice(3)) / 60;
  const dest = flight.destination.code;
  if (dest === "SYD") check(arriveHour >= 6 && arriveHour < 23, `${tag}: lands inside the Sydney curfew at ${flight.arriveTime}`);
  if (dest === "LHR") check(arriveHour >= 4.5 && arriveHour < 23.5, `${tag}: lands inside the Heathrow curfew at ${flight.arriveTime}`);
  if (!["DXB", "DOH", "AUH", "IST", "SIN", "KUL", "BKK"].includes(dest)) check(!(arriveHour >= 0.75 && arriveHour < 5.5), `${tag}: dead-of-night arrival ${flight.arriveTime}`);

  // Crew: from the rules alone (pilots by scheduled block time, the rule set by the airline's country).
  check(JSON.stringify(Object.keys(flight.crew).sort()) === '["pilots","regime","regulator"]', `${tag}: crew has fields beyond pilots/regime/regulator`);
  const crew = expectedCrew(flight.airline.country, flight.blockMin);
  check(JSON.stringify(flight.crew) === JSON.stringify(crew), `${tag}: crew ${JSON.stringify(flight.crew)}, the rules say ${JSON.stringify(crew)}`);
  check(getAirline(flight.airline.code)?.country === flight.airline.country, `${tag}: airline country`);

  // Turbulence
  const t = flight.turbulence;
  check(t.points.length >= 7, `${tag}: too few points (${t.points.length})`);
  check(t.points[0].minute === 0, `${tag}: first point not at 0`);
  check(t.points[t.points.length - 1].minute === flight.airborneMin, `${tag}: last point not at airborneMin`);
  for (let i = 1; i < t.points.length; i++) {
    const prev = t.points[i - 1].minute;
    const cur = t.points[i].minute;
    check(cur > prev && (cur - prev === 5 || i === t.points.length - 1), `${tag}: point spacing at ${cur}`);
  }
  check(t.points.every((p) => p.level >= 0 && p.level <= 2), `${tag}: point level out of range`);
  check(t.phases.length === 5 && t.phases.every((p, i) => p.phase === PHASES[i]), `${tag}: phases order`);
  check(t.phases[0].startMin === 0 && t.phases[4].endMin === flight.airborneMin, `${tag}: phase bounds`);
  for (let i = 1; i < 5; i++) {
    check(t.phases[i].startMin === t.phases[i - 1].endMin, `${tag}: phases not contiguous at ${i}`);
    check(t.phases[i].endMin > t.phases[i].startMin, `${tag}: empty phase ${t.phases[i].phase}`);
  }
  // Phase intensity matches the points inside it.
  for (const ph of t.phases) {
    const peak = Math.max(0, ...t.points.filter((p) => p.phase === ph.phase).map((p) => p.level));
    const expected = peak < 0.5 ? "none" : peak < 1.5 ? "light" : "moderate";
    check(ph.intensity === expected, `${tag}: ${ph.phase} intensity ${ph.intensity} vs points ${expected}`);
    check(ph.note.length > 10, `${tag}: ${ph.phase} note`);
  }
  check(t.windows.length <= 3, `${tag}: too many windows`);
  for (let i = 0; i < t.windows.length; i++) {
    const w = t.windows[i];
    check(w.startMin >= 0 && w.startMin + w.durationMin <= flight.airborneMin, `${tag}: window outside flight`);
    check(w.phase !== "takeoff" && w.phase !== "landing", `${tag}: window in ${w.phase}`);
    if (i > 0) check(w.startMin >= t.windows[i - 1].startMin + t.windows[i - 1].durationMin, `${tag}: windows overlap or unsorted`);
    const phase = t.phases.find((p) => p.phase === w.phase)!;
    check(w.startMin >= phase.startMin && w.startMin + w.durationMin < phase.endMin, `${tag}: window not inside its phase`);
    check(w.label.startsWith(w.intensity === "moderate" ? "Moderate bumps possible" : "Light bumps likely"), `${tag}: label "${w.label}"`);
    check(w.typicalLabel.startsWith("On flights like this one,"), `${tag}: typicalLabel`);
    check(w.cause.endsWith("."), `${tag}: cause without period "${w.cause}"`);
    // Whether the sign goes on is the crew's call on the day: only a moderate stretch is said to have it on.
    check(w.seatbeltSign === (w.intensity === "moderate"), `${tag}: seatbelt sign ${w.seatbeltSign} for a ${w.intensity} stretch`);
    const inside = t.points.filter((p) => p.minute >= w.startMin && p.minute <= w.startMin + w.durationMin);
    const peak = Math.max(...inside.map((p) => p.level));
    check(w.intensity === "moderate" ? peak >= 1.5 : peak >= 0.5 && peak < 1.5, `${tag}: window peak ${peak} for ${w.intensity}`);
  }
  check(t.windows.filter((w) => w.intensity === "moderate").length <= 1, `${tag}: more than one moderate window`);
  // Bump causes agree with the weather card for the same airport.
  const clearish = (c: string) => c === "clear" || c === "mostly_clear" || c === "breezy";
  for (const w of t.windows) {
    const cloudy = /cloud|shower/i.test(w.cause);
    if (w.phase === "climb" && clearish(flight.weather.origin.condition)) check(!cloudy, `${tag}: climb cause "${w.cause}" but origin is ${flight.weather.origin.condition}`);
    if (w.phase === "descent" && clearish(flight.weather.destination.condition)) check(!cloudy, `${tag}: descent cause "${w.cause}" but destination is ${flight.weather.destination.condition}`);
  }
  const cruiseCauses = t.windows.filter((w) => w.phase === "cruise").map((w) => w.cause);
  check(new Set(cruiseCauses).size === cruiseCauses.length, `${tag}: two cruise windows share a cause`);
  check(!t.phases.some((p) => /bumps (.+) and later \1\./.test(p.note)), `${tag}: repetitive phase note`);
  const expectedMax = t.windows.some((w) => w.intensity === "moderate") ? "moderate" : t.windows.length > 0 ? "light" : "none";
  check(t.maxIntensity === expectedMax, `${tag}: maxIntensity`);
  check(t.smoothMinutesPct >= 0 && t.smoothMinutesPct <= 100, `${tag}: smoothMinutesPct`);
  check(t.history.smoothPct >= 72 && t.history.smoothPct <= 96, `${tag}: history smoothPct`);
  // Past flights with turbulence reports: the route's daily nonstops (2 for a route nobody flies nonstop) × the month × 4 years.
  check(t.history.flightsAnalyzed >= 180 && t.history.flightsAnalyzed <= 1740 && t.history.flightsAnalyzed % 10 === 0, `${tag}: flightsAnalyzed ${t.history.flightsAnalyzed}`);
  check(t.history.month.length >= 3 && /^[A-Z]/.test(t.history.month), `${tag}: month`);

  // Smoothness
  const s = flight.smoothness;
  check(s.score >= 58 && s.score <= 97, `${tag}: score ${s.score}`);
  const expectedLabel = s.score >= 88 ? "Very smooth" : s.score >= 75 ? "Mostly smooth" : "Some bumps expected";
  check(s.label === expectedLabel, `${tag}: label ${s.label} for ${s.score}`);
  const hasModerate = t.windows.some((w) => w.intensity === "moderate");
  check(/moderate/i.test(s.summary) === hasModerate, `${tag}: summary mentions moderate=${/moderate/i.test(s.summary)} but windows=${hasModerate}`);
  check(t.windows.length === 0 ? /smooth flight/i.test(s.summary) : /bumps/i.test(s.summary), `${tag}: summary "${s.summary}"`);

  // Weather
  for (const w of [flight.weather.origin, flight.weather.destination]) {
    check(w.tempF === Math.round((w.tempC * 9) / 5 + 32), `${tag}: tempF mismatch`);
    check(w.tempC >= -35 && w.tempC <= 48, `${tag}: temp ${w.tempC}C at ${w.airportCode}`);
    check(w.windKts >= 3 && w.windKts <= 18, `${tag}: wind`);
    check(w.gustKts === null || w.gustKts > w.windKts, `${tag}: gusts`);
    check(w.visibilityMi >= 1 && w.visibilityMi <= 10, `${tag}: visibility`);
    check(w.precipPct >= 0 && w.precipPct <= 100, `${tag}: precip`);
    if (w.condition === "light_snow") check(w.tempC <= 1, `${tag}: snow at ${w.tempC}C`);
    if (w.condition === "fog") check(w.visibilityMi <= 3, `${tag}: fog visibility`);
    check(w.impactNote.length > 10, `${tag}: impact note`);
    check(!/\byour\b/i.test(w.impactNote), `${tag}: impact note assumes the reader's flight: "${w.impactNote}"`);
  }

  // Airline stats
  const a = flight.airlineStats;
  check(a.safetyScore >= 92 && a.safetyScore <= 99, `${tag}: safety score`);
  check(a.onTimePct >= 74 && a.onTimePct <= 90, `${tag}: on-time`);
  check(Math.abs(a.onTimeRoutePct - a.onTimePct) <= 5, `${tag}: route on-time`);
  check(a.comfortScore >= 7.2 && a.comfortScore <= 9.3, `${tag}: comfort ${a.comfortScore}`);
  check(a.seatPitchIn >= 30 && a.seatPitchIn <= 33, `${tag}: pitch`);
  check(a.seatWidthIn >= 17 && a.seatWidthIn <= 18.5, `${tag}: width`);
  check(a.crewRating >= 4.5 && a.crewRating <= 4.9, `${tag}: crew rating`);
  check(a.amenities.length >= 3, `${tag}: amenities`);
  check(a.cabinNoiseDb === ac.cabinNoiseDb, `${tag}: airline and aircraft sections disagree on cabin noise`);
  // The on-time rate on a route is one per airline ("last 12 months"), whichever of its flights.
  const routeFact = `route|${flight.origin.code}|${flight.destination.code}|${flight.airline.code}`;
  const seenRoute = FLEET_FACTS.get(routeFact);
  check(seenRoute === undefined || seenRoute === String(a.onTimeRoutePct), `${tag}: ${flight.airline.code}'s on-time rate on this route differs between flights`);
  FLEET_FACTS.set(routeFact, String(a.onTimeRoutePct));

  // Seat map: the geometry is the airline's cabin for the model (the same on every flight);
  // only which seats are unavailable, and so the picks, change per flight.
  const sm = flight.seatMap;
  const letters = sm.columnGroups.flat();
  const rowNumbers = sm.rows.map((r) => r.row);
  check(sm.rows.length >= 18 && sm.rows.length <= 28, `${tag}: rows ${sm.rows.length}`);
  check(rowNumbers.every((r, i) => i === 0 || r > rowNumbers[i - 1]), `${tag}: rows not increasing`);
  check(sm.wingStartRow < sm.wingEndRow && rowNumbers.includes(sm.wingStartRow) && rowNumbers.includes(sm.wingEndRow), `${tag}: wing rows`);
  check(sm.rows.some((r) => r.exit), `${tag}: no exit row`);
  check(sm.rows.filter((r) => r.exit).every((r) => r.zone === "smoothest"), `${tag}: exit row not over the wing`);
  check(sm.columnGroups.map((g) => g.length).join("-") === ac.seatLayout, `${tag}: seat map columns ${sm.columnGroups.map((g) => g.length).join("-")} vs layout ${ac.seatLayout}`);
  if (model) {
    const cabin = cabinConfigFor(flight.airline.code, model);
    check(ac.seatLayout === cabin.seatLayout && ac.typicalSeats === cabin.typicalSeats && a.seatWidthIn === cabin.seatWidthIn, `${tag}: layout / seats / width are not the airline's cabin`);
    check(JSON.stringify(rowNumbers) === JSON.stringify(cabin.rowNumbers), `${tag}: seat rows are not the airline's cabin`);
    check(sm.wingStartRow === cabin.rowNumbers[cabin.wingFirstIndex] && sm.wingEndRow === cabin.rowNumbers[cabin.wingLastIndex], `${tag}: wing rows are not the airline's cabin`);
    check(JSON.stringify(sm.rows.filter((r) => r.exit).map((r) => r.row)) === JSON.stringify([...cabin.exitRows].sort((x, y) => x - y)), `${tag}: exit rows are not the airline's cabin`);
    check(sm.rows.every((r, i) => r.zone === (i < cabin.wingFirstIndex ? "smooth" : i <= cabin.wingLastIndex ? "smoothest" : "more_motion")), `${tag}: zones don't follow the wing`);
  }
  const cabinKey = `${flight.airline.code}|${ac.model}`;
  const geometry = JSON.stringify([ac.seatLayout, ac.typicalSeats, sm.columnGroups, sm.rows, sm.wingStartRow, sm.wingEndRow]);
  const seenGeometry = SEAT_GEOMETRY.get(cabinKey);
  check(seenGeometry === undefined || seenGeometry === geometry, `${tag}: ${cabinKey} shows a different seat map than on another flight`);
  SEAT_GEOMETRY.set(cabinKey, geometry);
  OCCUPANCY_BY_CABIN.set(cabinKey, (OCCUPANCY_BY_CABIN.get(cabinKey) ?? new Set()).add(JSON.stringify(sm.occupied)));
  const seatCount = sm.rows.length * letters.length;
  const occ = sm.occupied.length / seatCount;
  check(occ >= 0.45 && occ <= 0.85, `${tag}: occupancy ${Math.round(occ * 100)}%`);
  check(new Set(sm.occupied).size === sm.occupied.length, `${tag}: duplicate occupied seats`);
  check(sm.recommended.length === 3 && new Set(sm.recommended).size === 3, `${tag}: recommended count`);
  // Best open seats, smoothest first: over the wing while it has open seats, then the nearest others.
  const taken = new Set(sm.occupied);
  const openOverWing = sm.rows.filter((r) => r.zone === "smoothest").reduce((n, r) => n + letters.filter((l) => !taken.has(`${r.row}${l}`)).length, 0);
  sm.recommended.forEach((id, i) => {
    const row = Number(id.slice(0, -1));
    const letter = id.slice(-1);
    check(rowNumbers.includes(row) && letters.includes(letter), `${tag}: recommended seat ${id} does not exist`);
    check(!taken.has(id), `${tag}: recommended seat ${id} is unavailable`);
    if (i < openOverWing) check(sm.rows.find((r) => r.row === row)?.zone === "smoothest", `${tag}: recommended seat ${id} off the wing while the wing has open seats`);
  });
  check(sm.why.includes(`${sm.wingStartRow}–${sm.wingEndRow}`), `${tag}: why does not name the wing rows`);

  // Sounds: in order, typical timings on a 5-minute grid, plane-specific cues named for their type.
  check(flight.sounds.length >= 10 && flight.sounds.length <= 14, `${tag}: ${flight.sounds.length} sound cues`);
  const minutes = flight.sounds.map((c) => c.minute).filter((m): m is number => m !== null);
  check(minutes.every((m, i) => i === 0 || m >= minutes[i - 1]), `${tag}: sounds not chronological`);
  check(new Set(flight.sounds.map((c) => c.id)).size === flight.sounds.length, `${tag}: duplicate sound ids`);
  check(flight.sounds[0].moment === "boarding" && flight.sounds[flight.sounds.length - 1].moment === "landing", `${tag}: sound order`);
  const cue = (id: string) => flight.sounds.find((c) => c.id === id);
  for (const c of flight.sounds) {
    check(timingsOnGrid(c.when), `${tag}: ${c.id} timing "${c.when}" not rounded to 5 minutes`);
    const offset = /(?:(\d+)h(?: (\d+)m)?|(\d+) min) (before landing|after takeoff)/.exec(c.when);
    if (offset && c.minute !== null) {
      const n = offset[3] !== undefined ? Number(offset[3]) : Number(offset[1]) * 60 + Number(offset[2] ?? 0);
      check(c.minute === (offset[4] === "after takeoff" ? n : flight.airborneMin - n), `${tag}: ${c.id} says "${c.when}" but sits at minute ${c.minute}`);
    }
  }
  const descentStart = cue("descent-start")?.minute ?? 0;
  check(flight.sounds.filter((c) => c.moment === "descent" && c.id !== "descent-start").every((c) => (c.minute ?? Infinity) > descentStart), `${tag}: a descent cue before the descent starts`);
  check(cue("cruise-bumps")?.when === "If bumps come", `${tag}: the light-bumps cue must be conditional, on every flight`);
  check(!/may be wet/.test(cue("landing-touchdown")?.why ?? ""), `${tag}: the touchdown cue reads the arrival forecast`);
  const a320Family = /^A32[01]/.test(ac.model);
  check(a320Family === Boolean(cue("taxi-ptu")), `${tag}: barking-dog cue vs ${ac.model}`);
  if (a320Family) check(cue("taxi-ptu")!.detail.startsWith("On Airbus A320-family jets"), `${tag}: the barking-dog cue doesn't name its type`);
  const roar = cue("takeoff-roll")?.detail ?? "";
  if (ac.bodyType === "wide") check(roar.startsWith("On wide-body jets"), `${tag}: the wide-body takeoff cue doesn't name its type`);
  else if (ac.model === "A220-300") check(roar.startsWith("On the Airbus A220"), `${tag}: the A220 takeoff cue doesn't name its type`);
  else check(!/^On /.test(roar), `${tag}: a type-specific takeoff cue on a ${ac.model}`);

  // Alternatives
  const alts = flight.alternatives;
  check(alts.length >= 2 && alts.length <= 3, `${tag}: ${alts.length} alternatives`);
  check(alts.every((x, i) => i === 0 || x.smoothnessScore <= alts[i - 1].smoothnessScore), `${tag}: alternatives unsorted`);
  for (const alt of alts) {
    check(alt.scoreDelta === alt.smoothnessScore - s.score, `${tag}: alt delta`);
    check(alt.smoothnessScore >= 58 && alt.smoothnessScore <= 97, `${tag}: alt score`);
    check(alt.fareDiffUsd >= -40 && alt.fareDiffUsd <= 160, `${tag}: fare ${alt.fareDiffUsd}`);
    check(alt.flightNumber !== flight.flightNumber, `${tag}: alt reuses the flight number`);
    check(Math.abs(alt.blockMin - flight.blockMin) <= 60, `${tag}: alt block time`);
    check(alt.reason.length > 10 && alt.reason.endsWith("."), `${tag}: alt reason "${alt.reason}"`);
    check(Boolean(alt.input) && Boolean(alt.prefs) && Object.keys(alt.prefs ?? {}).length > 0, `${tag}: alt without input/prefs`);
  }
  check(new Set(alts.map((x) => x.id)).size === alts.length, `${tag}: alt ids`);
  // Compare never argues with the route-history tile about the best time of day.
  const tileSlot = /^Morning/.test(t.history.bestDepartureWindow) ? "morning"
    : /^Midday/.test(t.history.bestDepartureWindow) ? "midday"
    : /^Afternoon/.test(t.history.bestDepartureWindow) ? "afternoon"
    : "evening";
  for (const alt of alts.filter((a) => a.date === flight.input.date)) {
    const m = /^(Morning|Midday|Afternoon|Evening) departure/.exec(alt.reason);
    if (!m) continue;
    const reasonSlot = m[1].toLowerCase();
    if (alt.scoreDelta > 0) check(reasonSlot === tileSlot, `${tag}: smoother alt says "${alt.reason}" but history says "${t.history.bestDepartureWindow}"`);
    if (alt.scoreDelta < 0) check(reasonSlot !== tileSlot, `${tag}: bumpier alt blames the history-best slot: "${alt.reason}"`);
    check(!isRetiredFlightNumber(alt.flightNumber), `${tag}: alt retired flight number ${alt.flightNumber}`);
  }
  // The time of day is credited only more than an hour apart; within the hour it's "a similar time",
  // and a plane named as larger / smaller really is.
  for (const alt of alts.filter((a) => a.date === flight.input.date)) {
    const gap = Math.abs(timeToMinutes(alt.departTime) - timeToMinutes(flight.departTime));
    if (TIME_OF_DAY.test(alt.reason)) check(gap > 60, `${tag}: "${alt.reason}" leaves ${gap} min from this flight`);
    if (/similar time|slightly (earlier|later)/.test(alt.reason)) check(gap <= 60, `${tag}: "${alt.reason}" leaves ${gap} min from this flight`);
    if (/on a larger plane/.test(alt.reason)) check(alt.bodyType === "wide" && ac.bodyType === "narrow", `${tag}: "${alt.reason}" on a ${alt.bodyType}-body`);
    if (/on a smaller plane/.test(alt.reason)) check(alt.bodyType === "narrow" && ac.bodyType === "wide", `${tag}: "${alt.reason}" on a ${alt.bodyType}-body`);
  }

  // Nothing a real product could never know: no pilot profile or maintenance field anywhere, under any key.
  const keys: Array<[string, string]> = [];
  keysOf(flight, "flight", keys);
  for (const [path, key] of keys) check(!IMPOSSIBLE_KEYS.has(key), `${tag}: impossible field at ${path}`);

  // Words
  const strings: Array<[string, string]> = [];
  stringsOf(flight, "flight", strings);
  for (const [path, value] of strings) {
    const m = FORBIDDEN.exec(value);
    check(!m, `${tag}: forbidden word "${m?.[0]}" at ${path}: "${value}"`);
    const d = DISCOURAGED.exec(value);
    if (d) warn(`${tag}: discouraged word "${d[0]}" at ${path}: "${value}"`);
    check(!value.includes("!"), `${tag}: exclamation mark at ${path}: "${value}"`);
    check(!/undefined|NaN|\[object/.test(value), `${tag}: broken interpolation at ${path}: "${value}"`);
    const profile = PILOT_PROFILE_TEXT.find((p) => value.includes(p)) ?? PILOT_PROFILE_PATTERN.exec(value)?.[0] ?? NAMED_PILOT.exec(value)?.[0];
    check(!profile, `${tag}: pilot-profile text "${profile}" at ${path}: "${value}"`);
    check(!YOUR_FLIGHT.test(value), `${tag}: "${YOUR_FLIGHT.exec(value)?.[0]}" at ${path} (the copy must read right for any flight)`);
  }
}

function pad(s: string | number, n: number) {
  const str = String(s);
  return str.length >= n ? str.slice(0, n) : str + " ".repeat(n - str.length);
}

function describeWindows(flight: Flight): string {
  return flight.turbulence.windows.map((w) => `${w.phase[0]}${w.intensity === "moderate" ? "M" : "l"}@${w.startMin}+${w.durationMin}`).join(" ") || "—";
}

// ── Airports ────────────────────────────────────────────────────────────────

console.log(`Airports: ${AIRPORTS.length}`);
check(AIRPORTS.length >= 120, "fewer than 120 airports");
check(new Set(AIRPORTS.map((a) => a.code)).size === AIRPORTS.length, "duplicate airport codes");
for (const a of AIRPORTS) {
  check(/^[A-Z]{3}$/.test(a.code), `bad code ${a.code}`);
  check(Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180, `bad coordinates for ${a.code}`);
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: a.tz });
  } catch {
    check(false, `invalid time zone ${a.tz} for ${a.code}`);
  }
}
check(searchAirports("").length >= 8 && searchAirports("")[0].code === "JFK", "empty search → popular");
check(searchAirports("new y")[0].code === "JFK", "search 'new y'");
check(searchAirports("zur")[0].code === "ZRH", "search 'zur' (diacritics)");
check(searchAirports("sao")[0].code === "GRU", "search 'sao'");
check(searchAirports("lax")[0].code === "LAX", "search 'lax'");
check(searchAirports("heath")[0].code === "LHR", "search name-word prefix");
check(searchAirports("japan").map((a) => a.code).includes("HND"), "search by country");
check(resolveAirport("Heathrow").code === "LHR", "resolve Heathrow");
check(resolveAirport("london").code === "LHR", "resolve london");
check(resolveAirport("Tokyo (NRT)").code === "NRT", "resolve City (CODE)");
check(resolveAirport("washington dc").code === "DCA", "resolve alias");
check(resolveAirport("Boise").known && resolveAirport("Boise").code === "BOI", "resolve Boise");
check(resolveAirport("boise, id").code === "BOI", "resolve 'boise, id'");
check(resolveAirport("Fargo").known === false && resolveAirport("Fargo").code === "FAR", "synthetic Fargo");
check(resolveAirport("santa fe").code !== "SAN", "synthetic code must not collide with a real one");
check(resolveAirport("Burlington, Iowa").code !== "BUR" && resolveAirport("Burlington, Iowa").known === false, "synthetic code must not borrow a well-known real code");
check(resolveAirport("Portland, Maine").code === "PWM" && resolveAirport("Portland, ME").code === "PWM", "resolve Portland, Maine");
check(resolveAirport("Portland").code === "PDX" && resolveAirport("Portland, Oregon").code === "PDX", "resolve Portland (Oregon)");
check(resolveAirport("San Jose, Costa Rica").code === "SJO" && resolveAirport("San Jose, CA").code === "SJC", "resolve San Jose by country / state");
check(resolveAirport("Manchester, NH").code === "MHT" && resolveAirport("Manchester, UK").code === "MAN", "resolve Manchester by suffix");
check(resolveAirport("Paris, Texas").known === false && resolveAirport("Paris, France").code === "CDG", "mismatched state → synthetic");
check(resolveAirport("Melbourne, FL").known === false && resolveAirport("London, Ontario").known === false, "wrong-country suffix → synthetic");
check(resolveAirport("Denver, CO").code === "DEN" && resolveAirport("New York, NY").code === "JFK", "resolve City, State");
check(resolveAirport("Buffalo").code === "BUF" && resolveAirport("Hyderabad").code === "HYD", "secondary airports are catalog rows");
check(resolveAirport("Washington, DC").code === "DCA", "resolve Washington, DC");
check(resolveAirport("").known === false, "empty resolves to synthetic");
check(normalizeInput({ origin: " jfk ", destination: "Los Angeles", date: "2026-11-26" }).origin === "JFK", "normalize code");
check(normalizeInput({ origin: "Fargo", destination: "LAX", date: "2026-11-26" }).origin === "Fargo", "normalize keeps free text");
let threw = false;
try {
  normalizeInput({ origin: "JFK", destination: "LAX", date: "2026-02-30" });
} catch {
  threw = true;
}
check(threw, "invalid date must throw");

// ── Routes ──────────────────────────────────────────────────────────────────

// Ultra-long routes stay with the endpoint countries' carriers; nothing draws Hawaiian.
for (const [o, d] of [["JFK", "SYD"], ["LHR", "SYD"], ["EWR", "MEL"], ["MNL", "EZE"]]) {
  for (const date of ["2026-11-26", "2027-03-14", "2027-08-02"]) {
    const f = generateFlight({ origin: o, destination: d, date });
    const countries = [f.origin.country, f.destination.country];
    check(countries.includes(f.airline.country), `${o}→${d} ${date}: ${f.airline.name} is from neither endpoint country`);
    check(f.alternatives.every((a) => a.airline.code !== "HA"), `${o}→${d} ${date}: Hawaiian alternative`);
    check(f.alternatives.every((a) => countries.includes(a.airline.country)), `${o}→${d} ${date}: third-country alternative`);
  }
}
const aklJfk = candidateAirlines(getAirport("AKL")!, getAirport("JFK")!, 8833, true).map(([a]) => a.code);
check(aklJfk.includes("NZ"), "AKL→JFK candidates lack Air New Zealand");
const perLhr = candidateAirlines(getAirport("PER")!, getAirport("LHR")!, 9015, true).map(([a]) => a.code);
check(perLhr.includes("QF"), "PER→LHR candidates lack Qantas");
const jfkLax = candidateAirlines(getAirport("JFK")!, getAirport("LAX")!, 2470, false).map(([a]) => a.code);
check(!jfkLax.includes("UA"), "United does not serve JFK");
const lgaMia = candidateAirlines(getAirport("LGA")!, getAirport("MIA")!, 1096, false).map(([a]) => a.code);
check(!lgaMia.includes("AS"), "Alaska has no presence on LGA→MIA");

// Typed cities that are not in the catalog give the same hop on every date.
const fargoA = generateFlight({ origin: "Fargo", destination: "Orlando", date: "2026-11-20" });
const fargoB = generateFlight({ origin: "Fargo", destination: "Orlando", date: "2027-07-04" });
check(fargoA.distanceMi === fargoB.distanceMi && fargoA.distanceMi <= 1600, `synthetic route distance changes by date (${fargoA.distanceMi} vs ${fargoB.distanceMi})`);
check(fargoA.aircraft.bodyType === "narrow", "synthetic hop on a wide-body");

// Block times on ultra-long routes stay close to real schedules.
const sinJfk = generateFlight({ origin: "SIN", destination: "JFK", date: "2026-11-26" }).blockMin;
check(sinJfk >= 17.5 * 60 && sinJfk <= 19.75 * 60, `SIN→JFK block ${sinJfk} min (real ≈ 18h40)`);
const jfkHkg = generateFlight({ origin: "JFK", destination: "HKG", date: "2027-02-06" }).blockMin;
check(jfkHkg >= 15 * 60 && jfkHkg <= 17 * 60, `JFK→HKG block ${jfkHkg} min (real ≈ 16h00)`);

// ── Fleets and cabins ───────────────────────────────────────────────────────

// Every airline's cabin for every model it flies: a real seat-map geometry, fixed per airline and model.
const LAYOUTS = new Set(["3-3", "2-3", "3-3-3", "2-4-2", "3-4-3", "2-3-2"]);
let cabins = 0;
for (const airline of AIRLINES.map((a) => a.code)) {
  const profile = getAirline(airline);
  check(Boolean(profile), `airline ${airline} missing from the catalog`);
  if (!profile) continue;
  const skips13 = new Set<boolean>();
  for (const key of profile.fleet) {
    const model = getAircraftModel(key);
    check(Boolean(model), `${airline}: unknown model ${key}`);
    if (!model) continue;
    cabins++;
    const cabin = cabinConfigFor(airline, model);
    const tag = `${airline} ${key} cabin`;
    check(cabin === cabinConfigFor(airline, model), `${tag}: not cached`);
    check(LAYOUTS.has(cabin.seatLayout), `${tag}: unknown layout ${cabin.seatLayout}`);
    check(cabin.rowNumbers.length >= 18 && cabin.rowNumbers.length <= 28, `${tag}: ${cabin.rowNumbers.length} rows`);
    check(cabin.rowNumbers.every((r, i) => i === 0 || r > cabin.rowNumbers[i - 1]), `${tag}: rows not increasing`);
    check(0 < cabin.wingFirstIndex && cabin.wingFirstIndex < cabin.wingLastIndex && cabin.wingLastIndex < cabin.rowNumbers.length - 1, `${tag}: wing rows`);
    const overWing = cabin.rowNumbers.slice(cabin.wingFirstIndex, cabin.wingLastIndex + 1);
    check(cabin.exitRows.length >= 1 && cabin.exitRows.every((r) => overWing.includes(r)), `${tag}: exit rows ${cabin.exitRows.join(",")} not over the wing`);
    check(cabin.typicalSeats >= 100 && cabin.typicalSeats <= 450, `${tag}: ${cabin.typicalSeats} seats`);
    check(cabin.seatWidthIn >= 17 && cabin.seatWidthIn <= 18.5, `${tag}: seat width ${cabin.seatWidthIn}`);
    if (cabin.rowNumbers[0] < 13 && cabin.rowNumbers[cabin.rowNumbers.length - 1] > 13) skips13.add(!cabin.rowNumbers.includes(13));
    for (const year of [2026, 2027]) {
      const ages = fleetAgesFor(airline, model, year);
      check(JSON.stringify(ages) === JSON.stringify(fleetAgesFor(airline, model, year)), `${tag}: fleet ages not deterministic`);
      check(ages.min >= 0.8 && ages.min <= ages.avg && ages.avg <= ages.max && ages.max <= year - model.modelInServiceSince, `${tag} ${year}: fleet ages ${ages.min}/${ages.avg}/${ages.max}`);
    }
  }
  check(skips13.size <= 1, `${airline}: row 13 skipped on some models and not others`);
}
// Model facts: verifiable comparisons, and cabin noise that sits where measurements do (newer designs a little quieter).
for (const m of AIRCRAFT_MODELS) {
  for (const line of m.safetyRecord) check(!OVERCLAIM.test(line) && !FORBIDDEN.test(line), `${m.key}: overclaiming model fact "${line}"`);
  check(m.cabinNoiseDb >= 78 && m.cabinNoiseDb <= 86, `${m.key}: cabin noise ${m.cabinNoiseDb} dB`);
}
const NEWER = ["A220-300", "A320neo", "A321neo", "A330-900neo", "A350-900", "A350-1000", "787-9", "787-10"];
const OLDER = ["737-800", "737-900ER", "757-200", "767-300ER", "777-300ER"];
const noise = (keys: string[]) => keys.map((k) => getAircraftModel(k)!.cabinNoiseDb);
check(Math.max(...noise(NEWER)) < Math.min(...noise(OLDER)), "a newer design is not quieter than the older ones");
console.log(`Cabins: ${cabins} airline × model configurations`);

// ── Flights ─────────────────────────────────────────────────────────────────

const header = `${pad("route", 9)} ${pad("date", 10)} ${pad("airline", 24)} ${pad("flight", 8)} ${pad("aircraft", 18)} ${pad("air", 5)} ${pad("dep→arr", 13)} ${pad("sc", 3)} ${pad("label", 20)} ${pad("windows", 24)} summary`;
console.log(`\n${header}`);
console.log("-".repeat(header.length + 40));

const flights: Flight[] = [];
for (const input of INPUTS) {
  let flight: Flight;
  try {
    flight = generateFlight(input);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${input.origin}→${input.destination}: threw ${(err as Error).message}`);
    continue;
  }
  flights.push(flight);
  checkFlight(input, flight);
  const route = `${flight.origin.code}→${flight.destination.code}`;
  const arr = `${flight.departTime}→${flight.arriveTime}${flight.arriveDayOffset ? (flight.arriveDayOffset > 0 ? "+" : "") + flight.arriveDayOffset : ""}`;
  console.log(
    `${pad(route, 9)} ${pad(input.date, 10)} ${pad(flight.airline.name, 24)} ${pad(flight.flightNumber, 8)} ${pad(flight.aircraft.fullName, 18)} ${pad(flight.airborneMin, 5)} ${pad(arr, 13)} ${pad(flight.smoothness.score, 3)} ${pad(flight.smoothness.label, 20)} ${pad(describeWindows(flight), 24)} ${flight.smoothness.summary}`,
  );
}

// ── Free exploration: prefs, causality, wide-bodies, real alternatives ─────

function summarize(alt: AlternativeFlight | Flight) {
  if ("smoothnessScore" in alt) {
    const { airline, flightNumber, date, departTime, arriveTime, arriveDayOffset, blockMin, aircraft, bodyType, smoothnessScore } = alt;
    return JSON.stringify({ airline: airline.code, flightNumber, date, departTime, arriveTime, arriveDayOffset, blockMin, aircraft, bodyType, smoothnessScore });
  }
  const f = alt;
  return JSON.stringify({
    airline: f.airline.code, flightNumber: f.flightNumber, date: f.input.date, departTime: f.departTime, arriveTime: f.arriveTime,
    arriveDayOffset: f.arriveDayOffset, blockMin: f.blockMin, aircraft: f.aircraft.fullName, bodyType: f.aircraft.bodyType, smoothnessScore: f.smoothness.score,
  });
}

// Prefs determinism and seeds.
const jfkLaxIn: FlightInput = { origin: "JFK", destination: "LAX", date: "2026-10-30" };
check(flightSeed(jfkLaxIn) === "JFK|LAX|2026-10-30" && flightSeed(jfkLaxIn, {}) === "JFK|LAX|2026-10-30", "empty-prefs seed changed");
check(flightSeed(jfkLaxIn, { airline: "dl", bodyType: "wide", departWindow: "morning" }) === "JFK|LAX|2026-10-30|w=morning|b=wide|a=DL", "prefs seed format");
check(JSON.stringify(normalizePrefs({ airline: "ZZ", departWindow: "night" as DepartWindow })) === "{}", "unknown prefs not dropped");
for (const input of INPUTS.slice(0, 20)) {
  const plain = JSON.stringify(generateFlight(input));
  check(plain === JSON.stringify(generateFlight(input, {})) && plain === JSON.stringify(generateFlight(input, undefined)), `${input.origin}→${input.destination}: {} / undefined prefs differ`);
  check(JSON.stringify(generateFlight(input).prefs) === "{}", `${input.origin}→${input.destination}: reference prefs not {}`);
  for (const prefs of [{ departWindow: "evening" }, { bodyType: "wide" }, { airline: "dl", departWindow: "morning" }] as FlightPrefs[]) {
    const a = generateFlight(input, prefs);
    const b = generateFlight(input, { ...normalizePrefs(prefs) });
    check(JSON.stringify(a) === JSON.stringify(b), `${input.origin}→${input.destination} ${JSON.stringify(prefs)}: not deterministic`);
    check(JSON.stringify(a.prefs) === JSON.stringify(normalizePrefs(prefs)), `${input.origin}→${input.destination}: Flight.prefs not set`);
    check(a.id !== generateFlight(input).id, `${input.origin}→${input.destination} ${JSON.stringify(prefs)}: same id as the reference`);
    if (prefs.departWindow) check(departWindowOf(a.departTime) === prefs.departWindow, `${input.origin}→${input.destination}: ${a.departTime} outside the ${prefs.departWindow} window`);
    if (prefs.airline) check(a.airline.code === "DL", `${input.origin}→${input.destination}: airline pref ignored (${a.airline.code})`);
  }
}

// Departure-window causality: ≥ 200 summer seeds, morning ≥ afternoon on average; winter stays plausible.
const CAUSAL_ROUTES = [["JFK", "ORD"], ["ATL", "DEN"], ["DFW", "LAX"], ["BOS", "MIA"], ["SEA", "SFO"], ["ORD", "PHX"], ["FRA", "FCO"], ["MAD", "CDG"], ["LHR", "AMS"], ["DEL", "BOM"]];
function windowMeans(months: number[], days: number): { morning: number; afternoon: number; evening: number; n: number; outside: number; tileDisagrees: number } {
  const sum = { morning: 0, afternoon: 0, evening: 0 };
  let n = 0;
  let outside = 0;
  let tileDisagrees = 0;
  for (const [o, d] of CAUSAL_ROUTES)
    for (const m of months)
      for (let day = 1; day <= days; day++) {
        const input = { origin: o, destination: d, date: `2027-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
        const ref = generateFlight(input);
        for (const w of ["morning", "afternoon", "evening"] as DepartWindow[]) {
          const f = generateFlight(input, { departWindow: w });
          sum[w] += f.smoothness.score;
          if (departWindowOf(f.departTime) !== w) outside++;
          if (f.turbulence.history.bestDepartureWindow !== ref.turbulence.history.bestDepartureWindow) tileDisagrees++;
        }
        n++;
      }
  return { morning: sum.morning / n, afternoon: sum.afternoon / n, evening: sum.evening / n, n, outside, tileDisagrees };
}
const summer = windowMeans([6, 7, 8], 8);
console.log(`\nSummer (${summer.n} seeds) mean score · morning ${summer.morning.toFixed(1)} · afternoon ${summer.afternoon.toFixed(1)} · evening ${summer.evening.toFixed(1)}`);
check(summer.n >= 200, "causality sample too small");
check(summer.morning >= summer.afternoon, `summer: morning mean ${summer.morning.toFixed(1)} < afternoon ${summer.afternoon.toFixed(1)}`);
check(summer.afternoon >= summer.evening - 1, `summer: evening clearly smoother than afternoon (${summer.evening.toFixed(1)})`);
check(summer.outside === 0 && summer.tileDisagrees === 0, `summer: ${summer.outside} departures outside their window, ${summer.tileDisagrees} history tiles disagree with the reference`);
const winter = windowMeans([12, 1, 2], 4);
console.log(`Winter (${winter.n} seeds) mean score · morning ${winter.morning.toFixed(1)} · afternoon ${winter.afternoon.toFixed(1)} · evening ${winter.evening.toFixed(1)}`);
for (const w of ["morning", "afternoon", "evening"] as const) check(winter[w] >= 75 && winter[w] <= 92, `winter: implausible ${w} mean ${winter[w].toFixed(1)}`);
check(Math.max(winter.morning, winter.afternoon, winter.evening) - Math.min(winter.morning, winter.afternoon, winter.evening) <= 6, "winter: time of day matters implausibly much");
check(winter.outside === 0 && winter.tileDisagrees === 0, `winter: ${winter.outside} departures outside their window, ${winter.tileDisagrees} history tiles disagree`);

// Wide-bodies honoured where a carrier on the route has one; never at LGA/DCA.
for (const [o, d] of [["JFK", "LAX"], ["JFK", "BOS"], ["ATL", "DEN"], ["LHR", "CDG"], ["FRA", "FCO"], ["HND", "KIX"], ["DEN", "ATL"], ["SFO", "HNL"], ["DXB", "DEL"]]) {
  for (const date of ["2026-11-26", "2027-07-14"]) {
    const f = generateFlight({ origin: o, destination: d, date }, { bodyType: "wide" });
    check(f.aircraft.bodyType === "wide", `${o}→${d} ${date}: wide-body pref not honoured (${f.airline.code} ${f.aircraft.model})`);
  }
}
check(generateFlight({ origin: "LGA", destination: "ORD", date: "2027-01-10" }, { bodyType: "wide" }).aircraft.bodyType === "narrow", "wide-body at LaGuardia");

// Shared facts. The route history is one per route and month (any day, year or prefs); the weather
// one per airport, date and hour; the airborne time one per route and day. Options leaving within an
// hour of the day's reference flight fly in its air: the same bumps, which a wide-body feels less.
const weatherFacts = (w: Flight["weather"]["origin"]) =>
  JSON.stringify([w.condition, w.label, w.tempC, w.windKts, w.windDir, w.gustKts, w.visibilityMi, w.precipPct, w.impact]);
const bumpsOf = (f: Flight) => JSON.stringify(f.turbulence.windows.map((w) => [w.phase, w.startMin, w.durationMin, w.intensity]));
let sameAir = 0;
let wideInSameAir = 0;
for (const input of INPUTS) {
  const ref = generateFlight(input);
  const tag = `${input.origin}→${input.destination} ${input.date}`;
  const history = JSON.stringify(ref.turbulence.history);
  const sameDay = [
    ref,
    ...(["morning", "afternoon", "evening"] as DepartWindow[]).map((w) => generateFlight(input, { departWindow: w })),
    generateFlight(input, { bodyType: "wide", departWindow: departWindowOf(ref.departTime) }),
    generateFlight(input, { bodyType: "wide" }),
    ...ref.alternatives.filter((a) => a.date === input.date).map((a) => generateFlight(a.input!, a.prefs)),
  ];
  const month = input.date.slice(0, 8);
  const sameMonth = [
    generateFlight({ ...input, date: `${month}01` }),
    generateFlight({ ...input, date: `${month}28` }, { departWindow: "evening" }),
    generateFlight({ ...input, date: `${Number(input.date.slice(0, 4)) + 1}${input.date.slice(4, 8)}12` }),
    ...ref.alternatives.filter((a) => a.date !== input.date && a.date.startsWith(month)).map((a) => generateFlight(a.input!, a.prefs)),
  ];
  for (const f of [...sameDay, ...sameMonth])
    check(JSON.stringify(f.turbulence.history) === history, `${tag}: route history differs on ${f.input.date} ${JSON.stringify(f.prefs)}`);

  const weatherByHour = new Map<string, string>();
  for (const f of sameDay) {
    const which = `${tag} ${JSON.stringify(f.prefs)}`;
    check(f.airborneMin === ref.airborneMin, `${which}: airborne ${f.airborneMin} min vs ${ref.airborneMin} for the day's reference`);
    const sides: Array<[string, Flight["weather"]["origin"]]> = [
      [`${f.origin.code} ${f.input.date} ${f.departTime.slice(0, 2)}h`, f.weather.origin],
      [`${f.destination.code} ${addDays(f.input.date, f.arriveDayOffset)} ${f.arriveTime.slice(0, 2)}h`, f.weather.destination],
    ];
    for (const [hour, w] of sides) {
      const seen = weatherByHour.get(hour);
      check(seen === undefined || seen === weatherFacts(w), `${which}: different weather at ${hour} than another flight then`);
      weatherByHour.set(hour, weatherFacts(w));
    }
    if (f === ref || Math.abs(timeToMinutes(f.departTime) - timeToMinutes(ref.departTime)) > 60) continue;
    sameAir++;
    check(bumpsOf(f) === bumpsOf(ref), `${which}: leaves within an hour of the reference but has other bumps`);
    if (f.aircraft.bodyType === ref.aircraft.bodyType) {
      check(JSON.stringify(f.turbulence.points) === JSON.stringify(ref.turbulence.points) && f.smoothness.score === ref.smoothness.score, `${which}: same air and body type but a different series`);
    } else if (f.aircraft.bodyType === "wide") {
      wideInSameAir++;
      const below = f.turbulence.points.every((p, i) => p.level <= ref.turbulence.points[i].level);
      check(below && f.smoothness.score >= ref.smoothness.score, `${which}: a wide-body at a similar time is bumpier (${f.smoothness.score} vs ${ref.smoothness.score})`);
    }
  }
}
console.log(`Shared air: ${sameAir} options within an hour of their reference (${wideInSameAir} wide-body vs narrow-body)`);
check(sameAir >= 20 && wideInSameAir >= 3, "shared-air sample too small");

// Every alternative row equals the full flight it opens; opened alternatives pass every flight check.
let altRows = 0;
let opened = 0;
const kindsSeen = new Set<string>();
for (const input of INPUTS) {
  const flight = generateFlight(input);
  for (const alt of flight.alternatives) {
    altRows++;
    const full = generateFlight(alt.input!, alt.prefs);
    check(summarize(alt) === summarize(full), `${input.origin}→${input.destination}: alt row ≠ its flight\n    row  ${summarize(alt)}\n    full ${summarize(full)}`);
    check(alt.id === full.id, `${input.origin}→${input.destination}: alt id ${alt.id} is not the id of the flight it opens (${full.id})`);
    check(JSON.stringify(full.prefs) === JSON.stringify(alt.prefs), `${input.origin}→${input.destination}: alt prefs not round-tripped`);
    kindsSeen.add(Object.keys(alt.prefs ?? {}).sort().join("+") + (alt.date === flight.input.date ? "" : " other-day"));
    if (opened < 60) {
      checkFlight(alt.input!, full, alt.prefs);
      opened++;
    }
  }
}
console.log(`Alternatives: ${altRows} rows match their flights · shapes ${[...kindsSeen].join(", ")}`);

// Depth limit: opening an alternative of an alternative (5 hops) stays one level deep and fast.
let hop = generateFlight({ origin: "DEN", destination: "ATL", date: "2026-07-18" });
const hopStart = performance.now();
for (let i = 0; i < 5; i++) {
  const alt = hop.alternatives[0];
  hop = generateFlight(alt.input!, alt.prefs);
  check(hop.alternatives.length >= 2 && hop.alternatives.every((a) => !("alternatives" in a)), "alternatives nest");
}
check(performance.now() - hopStart < 500, "alternative chain too slow");

// Performance: a flight with alternatives generates in < 30 ms on average.
const perfStart = performance.now();
let perfN = 0;
for (const input of INPUTS)
  for (const prefs of [undefined, { departWindow: "morning" }, { bodyType: "wide" }] as Array<FlightPrefs | undefined>) {
    generateFlight({ ...input, date: input.date.replace(/-\d\d$/, "-11") }, prefs);
    perfN++;
  }
const perfMs = (performance.now() - perfStart) / perfN;
console.log(`Performance: ${perfMs.toFixed(1)} ms per flight with alternatives (${perfN} flights)`);
check(perfMs < 30, `generateFlight too slow: ${perfMs.toFixed(1)} ms`);

// ── Variety ─────────────────────────────────────────────────────────────────

const scores = flights.map((f) => f.smoothness.score);
const windowCounts = [0, 1, 2, 3].map((n) => flights.filter((f) => f.turbulence.windows.length === n).length);
const moderate = flights.filter((f) => f.turbulence.maxIntensity === "moderate").length;
const airlines = new Set(flights.map((f) => f.airline.code)).size;
const models = new Set(flights.map((f) => f.aircraft.model)).size;
const conditions = new Set(flights.flatMap((f) => [f.weather.origin.condition, f.weather.destination.condition])).size;
console.log(`\n${flights.length} flights · scores ${Math.min(...scores)}–${Math.max(...scores)} (mean ${Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)})`);
console.log(`windows 0/1/2/3: ${windowCounts.join("/")} · moderate: ${moderate} · airlines: ${airlines} · aircraft models: ${models} · weather conditions: ${conditions}`);
check(windowCounts[0] < flights.length / 2, "too many flights without windows");
check(moderate >= 1, "no flight with a moderate window in the sample");
check(airlines >= 12, "too little airline variety");
check(models >= 6, "too little aircraft variety");
// One seat map per airline and model; which seats are open changes from flight to flight.
const sharedCabins = [...OCCUPANCY_BY_CABIN.values()].filter((sets) => sets.size > 1).length;
console.log(`Seat maps: ${SEAT_GEOMETRY.size} airline × model cabins across every flight checked, each one map; ${sharedCabins} seen on several flights with different open seats`);
check(SEAT_GEOMETRY.size >= 20 && sharedCabins >= 10, "too few cabins seen on several flights to show the per-flight seat availability");

if (failures > 0) {
  console.error(`\n${failures} check(s) failed, ${warnings} warning(s).`);
  process.exit(1);
}
console.log(`\nAll checks passed (${warnings} warning(s)).`);
