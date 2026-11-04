/*
 * Version D — published schedules (docs/REAL_DATA.md, "Step 1 build specification").
 *
 * A provider (the backend's AeroDataBox adapter, or the generator standing in for it) gives a
 * route-day's nonstop flights as ScheduleRow[]: operating carrier, number, local times, block time,
 * the scheduled aircraft type, the terminal. optionsFromSchedule turns them into the FlightOption[]
 * every D page reads (search.ts's shape), each flight hydrated by fakeFlight's buildScheduledFlight
 * from the real row's facts. The carrier, number, departure, block time, type and terminal are the
 * row's; what no later step has made real yet (weather, turbulence, seats, sounds) is still
 * generated from the same shared day facts version C uses — one airborne time, the route history,
 * the weather by hour, one bump draw per air block — so the ratings and every page keep working.
 *
 * generatedSchedule is the generator as a provider: the rows searchFlights builds its day from, so
 * optionsFromSchedule(generatedSchedule(q)) is searchFlights(q) field for field (check-schedule.ts),
 * and the app works with no key. resolveAircraftKey maps a provider's type code or name onto the
 * catalogue, with a family fallback for a type it has no entry for.
 *
 * Pure: no fetch, no clock (fetchedAt is the provider's, carried through untouched), no Node APIs.
 */
import { buildScheduledFlight, normalizeInput, routeDay } from "./fakeFlight";
import { fallbackAirlineProfile, getAirline } from "./airlines";
import { getAircraftModel } from "./aircraft";
import { minutesToTime, timeToMinutes } from "./dates";
import { hashId } from "./random";
import { airBlockOf, illustrativeFare, scheduledDepartures, type FlightOption, type SearchResults } from "./search";
import type { FlightInput } from "./types";

/** One nonstop flight in a route's published schedule, as a provider returns it. */
export interface ScheduleRow {
  /** Operating carrier IATA designator, e.g. "DL". */
  airline: string;
  /** Carrier name as the provider gives it (used when the carrier is not in the catalogue). */
  airlineName?: string;
  /** Flight number digits as published, e.g. "1423" (no carrier prefix, no spaces). */
  number: string;
  /** The airports as flown (IATA), the local departure date and local wall-clock times. */
  origin: string;
  destination: string;
  /** "YYYY-MM-DD" at the origin. */
  date: string;
  /** "HH:MM" local at the origin. */
  departTime: string;
  /** "HH:MM" local at the destination. */
  arriveTime: string;
  arriveDayOffset: number;
  /** Published gate-to-gate minutes (from the two scheduled instants). */
  blockMin: number;
  /** The aircraft as the provider names it: an ICAO or IATA type code and/or free text. */
  aircraft: { code?: string; name?: string };
  /** Origin terminal when published. */
  terminal?: string;
  /** Marketing carriers selling this flight under their own numbers (informational). */
  codeshares?: string[];
}

export interface RouteDaySchedule {
  origin: string;
  destination: string;
  date: string;
  provider: "generator" | "aerodatabox";
  /** ISO instant the rows were fetched from the provider. */
  fetchedAt: string;
  rows: ScheduleRow[];
  /** true: the route has nonstop service; false: nobody flies it nonstop; null: unknown (a day with no rows). */
  served: boolean | null;
}

// ── Aircraft types ──────────────────────────────────────────────────────────

/** Where a provider's aircraft code or name landed in the catalogue. */
export interface AircraftMatch {
  /** Catalogue key (getAircraftModel). */
  key: string;
  /**
   * true: the catalogue has no entry for the type named, so `key` is the nearest member of its
   * family (a 747-400 shows the 747-8's facts) or the single-aisle / twin-aisle default, and the
   * facts shown are approximate — say so where they appear.
   */
  approximate: boolean;
}

/** The type an unknown single-aisle (or unreadable) entry stands in as, and an unknown twin-aisle one. */
const NARROW_DEFAULT = "A320neo";
const WIDE_DEFAULT = "787-9";

/** Letters and digits only, upper case, one space between runs: "Boeing 737-800" → "BOEING 737 800", "b-738" → "B 738". */
function normalise(text: string | undefined): string {
  return (text ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

type Rule = readonly [pattern: RegExp, key: string, approximate: boolean];

/**
 * Codes and names → catalogue keys, first match wins: ICAO designators (B738, A21N, E75L), IATA
 * equipment codes (738, 32Q, E75), manufacturers' names ("Boeing 737-800", Boeing's "737-8" for the
 * MAX 8, "Airbus A321-271N" with its engine-variant suffix, "Canadair Regional Jet 900"). A type the
 * catalogue lacks maps to its nearest family member, approximate; the family rule comes last.
 */
const RULES: readonly Rule[] = [
  // 737: the MAX by its number, then the Next Generation members, then the classics.
  [/\bMAX ?10\b|\b737 ?10\b|\bB3XM\b|\b7MJ\b/, "737 MAX 9", true],
  [/\bMAX ?9\b|\b737 ?9\b|\bB39M\b|\b7M9\b/, "737 MAX 9", false],
  [/\bMAX ?7\b|\b737 ?7\b|\bB37M\b|\b7M7\b/, "737 MAX 8", true],
  [/\bMAX ?8\b|\b737 ?8\b|\bB38M\b|\b7M8\b/, "737 MAX 8", false],
  [/\b737\b.*\bMAX\b|\bMAX\b.*\b737\b/, "737 MAX 8", true],
  [/\b737 ?900\w*|\bB739\b|\b739\b|\b73J\b/, "737-900ER", false],
  [/\b737 ?800\w*|\bB738\b|\b738\b|\b73H\b/, "737-800", false],
  [/\b737 ?700\w*|\bB737\b|\b73G\b|\b73W\b/, "737-700", false],
  [/\b737 ?[3456]00\w*|\bB73[3456]\b|\b73[3456]\b/, "737-700", true],
  [/\b737\b|\bB73\w\b/, "737-800", true],
  // The 757 and the 7x7 wide-bodies.
  [/\b757 ?300\w*|\bB753\b|\b753\b/, "757-200", true],
  [/\b757\b|\bB75\w\b|\b752\b/, "757-200", false],
  [/\b767 ?[24]00\w*|\bB76[24]\b|\b76[24]\b/, "767-300ER", true],
  [/\b767\b|\bB76\w\b|\b763\b/, "767-300ER", false],
  [/\b747 ?8\w*|\bB748\b|\b748\b|\b74H\b/, "747-8", false],
  [/\b747\b|\bB74\w\b|\b74\d\b/, "747-8", true],
  [/\b777 ?200LR\b|\bB77L\b|\b77L\b/, "777-200ER", true],
  [/\b777 ?200\w*|\bB772\b|\b772\b/, "777-200ER", false],
  [/\b777 ?300\w*|\bB77W\b|\b77W\b|\bB773\b|\b773\b/, "777-300ER", false],
  [/\b777\b|\bB77\w\b|\b77\d\b/, "777-300ER", true],
  [/\b787 ?8\b|\bB788\b|\b788\b/, "787-8", false],
  [/\b787 ?9\b|\bB789\b|\b789\b/, "787-9", false],
  [/\b787 ?10\b|\bB78X\b|\b78X\b|\b781\b/, "787-10", false],
  [/\b787\b|\bB78\w\b|\bDREAMLINER\b/, "787-9", true],
  // Airbus single-aisles: the neo members by name or their "N" engine-variant suffix, then the ceo members.
  [/\bA?321 ?NEO\b|\bA21N\b|\b32Q\b|\bA?321 ?2\d\dN\w*|\bA?321 ?X?LR\b/, "A321neo", false],
  [/\bA?320 ?NEO\b|\bA20N\b|\b32N\b|\bA?320 ?2\d\dN\w*/, "A320neo", false],
  [/\bA?319 ?NEO\b|\bA19N\b/, "A320neo", true],
  [/\bA?319\w*/, "A319", false],
  [/\bA?321\w*/, "A321-200", false],
  [/\bA?320\w*/, "A320-200", false],
  [/\bA?318\w*/, "A319", true],
  [/\bA?220 ?300\w*|\bBCS3\b|\b223\b|\bCS300\b|\bA223\b/, "A220-300", false],
  [/\bA?220\w*|\bBCS1\b|\b221\b|\bCS100\b|\bC ?SERIES\b/, "A220-300", true],
  // Airbus twin-aisles.
  [/\bA?330 ?2\w*|\bA332\b|\b332\b/, "A330-200", false],
  [/\bA?330 ?3\w*|\bA333\b|\b333\b/, "A330-300", false],
  [/\bA?330 ?9\w*|\bA?330 ?NEO\b|\bA339\b|\b339\b/, "A330-900neo", false],
  [/\bA?330 ?8\w*|\bA338\b|\b338\b/, "A330-900neo", true],
  [/\bA?330\w*|\bA33\w\b/, "A330-300", true],
  [/\bA?340\w*|\bA34\w\b|\b34[2-6]\b/, "A330-300", true],
  [/\bA?350 ?10\w*|\bA35K\b|\b351\b|\b35K\b/, "A350-1000", false],
  [/\bA?350\w*|\bA359\b|\b359\b|\bA35\w\b/, "A350-900", false],
  [/\bA?380\w*|\bA388\b|\b388\b|\bA38\w\b/, "A380-800", false],
  [/\bA?3[01]0\w*|\bA3[01]\w\b/, "A330-300", true],
  // Regional jets and turboprops: the catalogue's E175 and CRJs, or the closest of them.
  [/\b(E|ERJ|EMB|EMBRAER) ?175\w*|\bE75\w?\b|\bE7W\b/, "E175", false],
  [/\b(E|ERJ|EMB|EMBRAER) ?170\w*|\bE70\b/, "E175", true],
  [/\b(E|ERJ|EMB|EMBRAER) ?(19[05]|29[05])\w*|\bE9[05]\b|\bE29[05]\b/, "E175", true],
  [/\b(E|ERJ|EMB|EMBRAER) ?1[34]5\w*|\bER[34]\b/, "E175", true],
  [/\bEMBRAER\b|\bERJ\b|\bEMB\b/, "E175", true],
  [/\b(CRJ|CR) ?900\w*|\b(CRJ|CR) ?9\b|\bREGIONAL JET 900\b/, "CRJ-900", false],
  [/\b(CRJ|CR) ?700\w*|\b(CRJ|CR) ?7\b|\bREGIONAL JET 700\b/, "CRJ-700", false],
  [/\b(CRJ|CR) ?1000\w*|\bCRJX\b|\bCRK\b|\bREGIONAL JET 1000\b/, "CRJ-900", true],
  [/\bCRJ\w*|\bCR[12]\b|\bCANADAIR\b|\bREGIONAL JET\b/, "CRJ-700", true],
  [/\bDH8D\b|\bDH4\b|\bDASH ?8 ?400\w*|\bQ400\b|\bAT7\w?\b|\bATR ?72\w*/, "E175", true],
  [/\bDH8[ABC]\b|\bDH[123]\b|\bDASH ?8\w*|\bAT4\w?\b|\bAT5\b|\bATR ?42\w*|\bATR\b/, "CRJ-700", true],
];

/** Twin-aisle types no rule above names: the wide-body default rather than the single-aisle one. */
const WIDE_HINT = /\bWIDE ?BODY\b|\bMD ?11\b|\bDC ?10\b|\bIL ?96\b|\bL ?1011\b|\bJUMBO\b/;

/**
 * The catalogue entry for a provider's aircraft code and/or name, and whether its facts are the
 * type's own. A recognised code decides; the name only when the code is missing or unknown.
 */
export function resolveAircraft(aircraft: { code?: string; name?: string }): AircraftMatch {
  const code = normalise(aircraft.code);
  const name = normalise(aircraft.name);
  for (const text of [code, name]) {
    if (!text) continue;
    for (const [pattern, key, approximate] of RULES) if (pattern.test(text)) return { key, approximate };
  }
  return { key: WIDE_HINT.test(`${code} ${name}`) ? WIDE_DEFAULT : NARROW_DEFAULT, approximate: true };
}

/** The catalogue key for a provider's aircraft code or name ("B738" → "737-800"), or a family fallback. */
export function resolveAircraftKey(aircraft: { code?: string; name?: string }): string {
  return resolveAircraft(aircraft).key;
}

// ── Rows → options ──────────────────────────────────────────────────────────

/** The shortest block a row can publish: the shortest air time plus its taxi (fakeFlight's floor). */
const MIN_BLOCK_MIN = 45;

const WALL_CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** "DL" + "1423" → "DL1423": the option key, as optionKey makes it from a flight number. */
function keyOf(row: ScheduleRow): string {
  return `${row.airline}${row.number}`.replace(/\s+/g, "").toUpperCase();
}

/**
 * A row the hydration can use: a carrier, a number, a wall-clock departure, a positive block and an
 * aircraft field that is an object (or missing). Anything else is a provider slip: that row is left
 * out, never the day. Checked by type, so a corrupt payload cannot throw its way to the generator.
 */
function usable(row: ScheduleRow): boolean {
  const aircraftOk = row.aircraft === undefined || (typeof row.aircraft === "object" && row.aircraft !== null);
  return (
    typeof row.airline === "string" &&
    row.airline.trim().length > 0 &&
    typeof row.number === "string" &&
    row.number.trim().length > 0 &&
    typeof row.departTime === "string" &&
    WALL_CLOCK.test(row.departTime) &&
    typeof row.blockMin === "number" &&
    Number.isFinite(row.blockMin) &&
    row.blockMin > 0 &&
    aircraftOk
  );
}

/** The row's published arrival when it is well formed; otherwise the arrival follows from the block. */
function publishedArrival(row: ScheduleRow): { arriveTime: string; arriveDayOffset: number } | undefined {
  const offset = row.arriveDayOffset;
  if (typeof row.arriveTime !== "string" || !WALL_CLOCK.test(row.arriveTime) || !Number.isInteger(offset) || offset < -1 || offset > 2) return undefined;
  return { arriveTime: row.arriveTime, arriveDayOffset: offset };
}

/** The type as the schedule names it, for a row the catalogue stands in for. */
function listedName(aircraft: ScheduleRow["aircraft"] | undefined): string | undefined {
  const name = aircraft?.name?.trim() || aircraft?.code?.trim();
  return name ? name : undefined;
}

/**
 * The air block of a departure: search.ts's two-hour blocks. The hour after midnight (a published
 * red-eye) is a block of its own, so no block shares a key with a different reference time.
 */
function blockOf(departMin: number): { start: number; airMin: number } {
  return departMin < 60 ? { start: 0, airMin: 0 } : airBlockOf(departMin);
}

/**
 * Real rows → the day's FlightOption[] (search.ts shape), by departure time, each flight hydrated
 * by buildScheduledFlight. A key (airline + number, uppercase) that repeats within the day keeps
 * its first row. The carrier is the catalogue's when it lists it, else a fallback profile; the
 * type is resolveAircraft's (listed under the schedule's own name when the catalogue stands in for
 * it); the block and the arrival are the published ones, the air time fitting inside the block; the
 * fare is the same illustrative one searchFlights gives (fareAt keeps working). Frozen, like
 * searchFlights' results.
 * Throws only on an invalid date, like normalizeInput.
 */
export function optionsFromSchedule(schedule: RouteDaySchedule): SearchResults {
  const norm = normalizeInput({ origin: schedule.origin, destination: schedule.destination, date: schedule.date });
  const day = routeDay(norm);
  const seen = new Set<string>();
  const rows = schedule.rows
    .filter(usable)
    .map((row) => ({ row, key: keyOf(row), departMin: timeToMinutes(row.departTime) }))
    .sort((a, b) => a.departMin - b.departMin || a.key.localeCompare(b.key))
    .filter(({ key }) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const options: FlightOption[] = rows.map(({ row, key, departMin }) => {
    const listed = getAirline(row.airline);
    const airline = listed ?? fallbackAirlineProfile(row.airline, row.airlineName);
    const block = blockOf(departMin);
    const match = resolveAircraft(row.aircraft ?? {});
    const flight = buildScheduledFlight(day, {
      id: hashId(`c|${norm.origin}|${norm.destination}|${norm.date}|${key}`),
      seed: `c|${day.route}|${norm.date}|${key}`,
      airline: airline.code,
      airlineProfile: listed ? undefined : airline,
      flightNumber: `${airline.code} ${row.number.trim()}`,
      departTime: row.departTime,
      aircraft: match.key,
      aircraftListedAs: match.approximate ? listedName(row.aircraft) : undefined,
      blockMin: Math.max(MIN_BLOCK_MIN, Math.round(row.blockMin)),
      arrival: publishedArrival(row),
      airKey: `air|${day.route}|${norm.date}|${minutesToTime(block.start)}`,
      airTime: minutesToTime(block.airMin),
      terminal: row.terminal,
    });
    return { key, flight, fareUsd: illustrativeFare(day, airline, departMin, key) };
  });
  // Shared by every page of the day (the store keeps one snapshot): sort or filter a copy, never the list itself.
  Object.freeze(options);
  return Object.freeze({ query: norm, options });
}

// ── The generator as a provider ─────────────────────────────────────────────

/**
 * The schedule rows the generator would publish for a route-day: searchFlights' own departures,
 * with the arrival each lands at and the type's ICAO code, so the backend's generator provider and
 * the tests share one path with version C. `served` is the route's nonstop-service fact (false on
 * a route nobody flies nonstop, whose rows are empty). Throws only on an invalid date.
 */
export function generatedSchedule(input: FlightInput, fetchedAt: string): RouteDaySchedule {
  const norm = normalizeInput(input);
  const day = routeDay(norm);
  const rows: ScheduleRow[] = scheduledDepartures(norm).map((d) => {
    const model = getAircraftModel(d.aircraft);
    const arrival = day.arrival(d.departTime, d.blockMin);
    return {
      airline: d.airline,
      airlineName: getAirline(d.airline)?.name,
      number: d.flightNumber.split(" ")[1],
      origin: day.origin.code,
      destination: day.destination.code,
      date: norm.date,
      departTime: d.departTime,
      arriveTime: arrival.arriveTime,
      arriveDayOffset: arrival.arriveDayOffset,
      blockMin: d.blockMin,
      aircraft: model ? { code: model.icao, name: model.fullName } : { name: d.aircraft },
    };
  });
  return {
    origin: norm.origin,
    destination: norm.destination,
    date: norm.date,
    provider: "generator",
    fetchedAt,
    rows,
    served: day.carriers.length > 0,
  };
}
