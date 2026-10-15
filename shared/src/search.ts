/*
 * Version C — flight search (illustrative). For a route and date: the day's
 * nonstop flights, each a full `Flight` plus an illustrative fare.
 * Deterministic: the same route and date always give the same results.
 *
 * Contract: docs/VERSION_C.md ("Data contract"). The exported names and shapes
 * are fixed; everything below them is internal.
 *
 * A day is built in three steps:
 *  1. A timetable per route and IATA season (seed `sched|ROUTE|SEASON`): how many
 *     flights the market gets (busy 8–14, ordinary 4–8, long-haul 2–5), which
 *     carriers fly them (candidateAirlines; hub carriers fly several), their flight
 *     numbers, aircraft, taxi times and departure times. Like a real timetable it
 *     repeats, so DL1423 leaves at the same time every day of the season and the
 *     same flight can be compared across days. A few frequencies skip Saturdays.
 *  2. The day (seed `sched|ROUTE|DATE`): the frequencies flying that weekday, the
 *     odd equipment swap, and each departure checked against that date's arrival
 *     rules (daylight saving moves arrivals; one that would land inside a curfew or
 *     in the dead of night moves to the nearest time that works).
 *  3. Every flight is built by fakeFlight's buildScheduledFlight from the day's
 *     shared facts: one airborne time, the A/B route history, the weather by
 *     airport, date and hour, and one bump draw per two-hour air block (airBlockOf).
 *
 * Fares never look at the turbulence: distance, carrier tier, weekday, departure
 * hour and a ±10% seeded jitter, whole dollars, at least $39.
 */
import { buildScheduledFlight, normalizeInput, routeDay, type RouteCarrier, type RouteDay } from "./fakeFlight";
import { isRetiredFlightNumber, makeFlightNumber, type AirlineProfile } from "./airlines";
import { chooseAircraftModel, getAircraftModel } from "./aircraft";
import { minutesToTime, parseISODate, weekdayIndex } from "./dates";
import { clamp, createRng, hashId, type Rng } from "./random";
import type { Flight, FlightInput } from "./types";

export interface FlightOption {
  /** Unique within route + date, stable: airline code + number, no space — "DL1423". */
  key: string;
  /** Full flight (dashboard shape). `alternatives` is [] — C shows other options from the same results. */
  flight: Flight;
  /** Illustrative one-way economy fare, whole US dollars. */
  fareUsd: number;
}

export interface SearchResults {
  /** Normalized query. */
  query: FlightInput;
  /** Every flight that day, by departure time. */
  options: FlightOption[];
}

export interface DayOverview {
  date: string;
  count: number;
  lowestFareUsd: number;
  /** Highest smoothness score that day. */
  bestScore: number;
}

/** "DL 1423" → "DL1423". */
export function optionKey(flight: Pick<Flight, "flightNumber">): string {
  return flight.flightNumber.replace(/\s+/g, "").toUpperCase();
}

// ── Markets ─────────────────────────────────────────────────────────────────

type Market = "busy" | "ordinary" | "long";

const MARKET_COUNTS: Record<Market, readonly [number, number]> = { busy: [8, 14], ordinary: [4, 8], long: [2, 5] };

/** Departures on the 5-minute grid from 05:30 (long-haul from 06:00) to 23:30, local time. */
const FIRST_DEPARTURE = 5 * 60 + 30;
const FIRST_LONG_DEPARTURE = 6 * 60;
const LAST_DEPARTURE = 23 * 60 + 30;

/** Minimum minutes between two departures: any two, the same carrier's, and two in different air blocks. */
const MIN_GAP = 15;
const SAME_CARRIER_GAP = 45;
const BLOCK_EDGE_GAP = 30;

/**
 * Carriers that fly the route here: a fleet that can, and a wide-body where the route needs
 * one (oceanic or 2,800 mi and up, as chooseAircraftModel would pick) when any carrier has one.
 */
function eligibleCarriers(day: RouteDay): readonly RouteCarrier[] {
  const needsWide = !day.narrowOnly && (day.oceanic || day.distanceMi >= 2800);
  const wide = needsWide ? day.carriers.filter((c) => c.wide) : [];
  return wide.length > 0 ? wide : day.carriers;
}

/**
 * Long-haul: oceanic, or international beyond 2,600 mi, or domestic beyond 3,000 mi (US
 * transcons are busy markets in their own right). Busy: hub carriers at both ends. Else ordinary.
 */
function marketOf(day: RouteDay, carriers: readonly RouteCarrier[]): Market {
  if (day.oceanic || day.distanceMi > 3000 || (!day.domestic && day.distanceMi > 2600)) return "long";
  const hubAt = (code: string) => carriers.some((c) => c.airline.hubs.includes(code));
  return hubAt(day.origin.code) && hubAt(day.destination.code) ? "busy" : "ordinary";
}

// ── Seasons ─────────────────────────────────────────────────────────────────

const pad2 = (n: number) => String(n).padStart(2, "0");

function lastSunday(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  return `${year}-${pad2(month)}-${pad2(last.getUTCDate() - last.getUTCDay())}`;
}

interface Season {
  /** "S2027" (summer), "W2026" (the winter starting in October 2026). */
  key: string;
  /** Mid-season date whose time zones the timetable is planned in. */
  planDate: string;
}

/** IATA seasons: summer from the last Sunday of March, winter from the last Sunday of October. */
function seasonOf(date: string): Season {
  const { y } = parseISODate(date);
  if (date >= lastSunday(y, 3) && date < lastSunday(y, 10)) return { key: `S${y}`, planDate: `${y}-07-15` };
  const start = date >= lastSunday(y, 10) ? y : y - 1;
  return { key: `W${start}`, planDate: `${start + 1}-01-15` };
}

// ── Air blocks ──────────────────────────────────────────────────────────────

/**
 * Two-hour air blocks on odd hours (05–07, 07–09, … 23–01), so no block straddles the 11:00 and
 * 17:00 edges of the time-of-day windows. Every flight in a block flies in one bump draw, made for
 * a departure in its middle (the last block's at 23:30).
 */
function airBlockOf(departMin: number): { start: number; airMin: number } {
  const start = 60 + Math.floor((departMin - 60) / 120) * 120;
  return { start, airMin: Math.min(start + 60, LAST_DEPARTURE) };
}

// ── Timetable ───────────────────────────────────────────────────────────────

interface Frequency {
  carrier: RouteCarrier;
  flightNumber: string;
  /** Model key. */
  aircraft: string;
  /** Taxi minutes before the wide-body allowance (see taxiFor). */
  taxiBase: number;
  /** Local minutes after midnight. */
  departMin: number;
  /** Flies on Saturdays (a few busy-market frequencies don't). */
  saturday: boolean;
}

interface Timetable {
  market: Market;
  /** By departure time. */
  frequencies: Frequency[];
}

/** Wide-bodies take a few minutes longer to push back and taxi. */
function taxiFor(taxiBase: number, aircraft: string): number {
  return clamp(taxiBase + (getAircraftModel(aircraft)?.bodyType === "wide" ? 4 : 0), 15, 35);
}

/** A departure at `m` keeps clear of the others: any two, the same carrier's, and across an air-block edge. */
function clearOf(m: number, carrier: string, others: ReadonlyArray<{ departMin: number; carrier: string }>): boolean {
  const block = airBlockOf(m).start;
  for (const o of others) {
    const gap = Math.abs(o.departMin - m);
    if (gap < MIN_GAP) return false;
    if (o.carrier === carrier && gap < SAME_CARRIER_GAP) return false;
    if (gap < BLOCK_EDGE_GAP && airBlockOf(o.departMin).start !== block) return false;
  }
  return true;
}

/** Busy markets: morning and late-afternoon banks, a quiet midday, a few late departures. */
const HOURLY_WEIGHT: readonly number[] = [
  0, 0, 0, 0, 0, 0.5, 1.5, 1.6, 1.4, 1.1, 0.9, 0.85, 0.85, 0.9, 1, 1.1, 1.3, 1.4, 1.3, 1.1, 0.8, 0.55, 0.3, 0.12,
];

/**
 * How often a timetable puts a departure at local minute `m`. Long-haul follows the generator's own
 * timing rules (buildTiming): overnight routes leave in the evening bank, with the odd day flight;
 * other long-haul routes by the same slot weights.
 */
function departureWeight(market: Market, day: RouteDay, m: number): number {
  if (market !== "long") return HOURLY_WEIGHT[Math.floor(m / 60)] ?? 0;
  if (day.overnight) return m >= 17 * 60 ? 3 : m < 11 * 60 ? 0.35 : 0.1;
  if (m < 10 * 60) return 35 / 48;
  if (m < 14 * 60) return 25 / 48;
  if (m < 18 * 60) return 25 / 48;
  if (m <= 21 * 60 + 30) return 15 / 43;
  return 0.1;
}

/** Items in a weighted random order (weighted sampling without replacement). */
function weightedOrder<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T[] {
  const pool = items.slice();
  const out: T[] = [];
  while (pool.length > 0) {
    const pick = rng.weighted(pool.map((item, i): [number, number] => [i, weight(item)]));
    out.push(pool.splice(pick, 1)[0]);
  }
  return out;
}

/**
 * Flight numbers stay with a route and carrier from season to season. Eastbound flights
 * get even numbers and westbound ones odd, so the two directions never share one.
 */
function flightNumbersFor(day: RouteDay, airline: AirlineProfile, count: number): string[] {
  const rng = createRng(`num|${day.route}|${airline.code}`);
  const parity = day.eastbound ? 0 : 1;
  const taken = new Set<number>();
  const out: string[] = [];
  for (let tries = 0; out.length < count; tries++) {
    let n = tries < 400 ? Number(makeFlightNumber(rng, airline, day.longHaul).split(" ")[1]) : 2 * tries + parity;
    if (n % 2 !== parity) n += n >= 9999 ? -1 : 1;
    if (n < 1 || n > 9999 || taken.has(n) || isRetiredFlightNumber(`${airline.code} ${n}`)) continue;
    taken.add(n);
    out.push(`${airline.code} ${n}`);
  }
  return out;
}

function buildTimetable(day: RouteDay, season: Season): Timetable {
  const rng = createRng(`sched|${day.route}|${season.key}`);
  const carriers = eligibleCarriers(day);
  const market = marketOf(day, carriers);
  const [lo, hi] = MARKET_COUNTS[market];
  const hubs = carriers.filter((c) => c.hub).length;
  const drawn =
    market === "busy" ? 7 + 2 * hubs + rng.int(-1, 1)
    : market === "ordinary" ? 3 + hubs + rng.int(0, 2)
    : hubs + rng.int(0, 1);
  const count = clamp(drawn, lo, hi);

  // Every carrier with a hub at either end flies the route (as many as there are flights), the rest by weight.
  const assigned = weightedOrder(rng, carriers.filter((c) => c.hub), (c) => c.weight).slice(0, count);
  const byWeight = carriers.map((c): [RouteCarrier, number] => [c, c.weight]);
  while (assigned.length < count) assigned.push(rng.weighted(byWeight));

  // Aircraft from each carrier's fleet for the distance; taxi times a few minutes apart.
  const routeTaxi = rng.int(17, 26);
  const drafts = assigned.map((carrier) => ({
    carrier,
    aircraft: chooseAircraftModel(rng, carrier.fleet, day.distanceMi, day.oceanic).key,
    taxiBase: routeTaxi + rng.int(-2, 3),
  }));

  // Departures: weighted by time of day, spread apart, clear of each other, landing at sensible
  // hours on a mid-season day with half an hour to spare either way (daily winds, other dates).
  const first = market === "long" ? FIRST_LONG_DEPARTURE : FIRST_DEPARTURE;
  const grid: number[] = [];
  for (let m = first; m <= LAST_DEPARTURE; m += 5) grid.push(m);
  const plan = routeDay({ ...day.input, date: season.planDate });
  const typicalBlock = plan.typicalAirborneMin + routeTaxi;
  const lands = grid.map((m) => plan.arrival(minutesToTime(m), typicalBlock).acceptable);
  const margin = 6; // grid steps: 30 min
  const ok = grid.map((_, i) => lands[i] && (i < margin || lands[i - margin]) && (i + margin >= grid.length || lands[i + margin]));
  // Departures keep apart in proportion to the day (or, on overnight routes, the evening bank) they share.
  const span = market === "long" && day.overnight ? LAST_DEPARTURE - 17 * 60 : LAST_DEPARTURE - first;
  const spread = clamp((span / count) * 0.7, 25, 120);

  const placed: Array<{ departMin: number; carrier: string; draft: (typeof drafts)[number] }> = [];
  for (const draft of rng.shuffle(drafts)) {
    const code = draft.carrier.airline.code;
    const options: Array<[number, number]> = [];
    grid.forEach((m, i) => {
      if (!ok[i] || !clearOf(m, code, placed)) return;
      let near = 1;
      for (const p of placed) near = Math.min(near, ((m - p.departMin) / spread) ** 2);
      options.push([m, departureWeight(market, day, m) * near]);
    });
    if (options.length === 0) continue;
    const total = options.reduce((s, [, w]) => s + w, 0);
    const departMin = total > 0 ? rng.weighted(options) : rng.pick(options)[0];
    placed.push({ departMin, carrier: code, draft });
  }
  placed.sort((a, b) => a.departMin - b.departMin);

  // Numbers in departure order, per carrier.
  const numbers = new Map<string, string[]>();
  for (const c of carriers) {
    const n = placed.filter((p) => p.carrier === c.airline.code).length;
    if (n > 0) numbers.set(c.airline.code, flightNumbersFor(day, c.airline, n));
  }
  const frequencies: Frequency[] = placed.map((p) => ({
    carrier: p.draft.carrier,
    flightNumber: numbers.get(p.carrier)!.shift()!,
    aircraft: p.draft.aircraft,
    taxiBase: p.draft.taxiBase,
    departMin: p.departMin,
    saturday: true,
  }));

  // Busy (and some ordinary) markets thin out on Saturdays; every carrier still flies, and the count stays in range.
  const skip = Math.min(market === "busy" ? rng.int(1, 3) : market === "ordinary" ? rng.int(0, 1) : 0, frequencies.length - lo);
  let skipped = 0;
  for (const f of rng.shuffle(frequencies)) {
    if (skipped >= skip) break;
    const code = f.carrier.airline.code;
    if (frequencies.filter((o) => o.saturday && o.carrier.airline.code === code).length < 2) continue;
    f.saturday = false;
    skipped++;
  }
  return { market, frequencies };
}

// ── Caches (bounded LRU) ────────────────────────────────────────────────────

function recall<V>(cache: Map<string, V>, key: string): V | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function remember<V>(cache: Map<string, V>, max: number, key: string, value: V): V {
  if (cache.size >= max) cache.delete(cache.keys().next().value as string);
  cache.set(key, value);
  return value;
}

/** A day of flights is ~200 KB; 32 days cover a results page, its date strip and a compare view. */
const RESULTS = new Map<string, SearchResults>();
const RESULTS_MAX = 32;
const OVERVIEWS = new Map<string, DayOverview>();
const OVERVIEWS_MAX = 256;
const TIMETABLES = new Map<string, Timetable>();
const TIMETABLES_MAX = 64;

function timetableFor(day: RouteDay): Timetable {
  const season = seasonOf(day.input.date);
  const key = `${day.route}|${season.key}`;
  return recall(TIMETABLES, key) ?? remember(TIMETABLES, TIMETABLES_MAX, key, buildTimetable(day, season));
}

// ── The day ─────────────────────────────────────────────────────────────────

interface Departure {
  carrier: RouteCarrier;
  flightNumber: string;
  aircraft: string;
  departMin: number;
  blockMin: number;
}

/** The share of frequencies flown by another of the carrier's aircraft on a given day. */
const SWAP_CHANCE = 0.08;

/** The timetable's flights that operate on the day, each landing at a sensible hour that date. */
function departuresFor(day: RouteDay): Departure[] {
  const rng = createRng(`sched|${day.route}|${day.input.date}`);
  const table = timetableFor(day);
  const first = table.market === "long" ? FIRST_LONG_DEPARTURE : FIRST_DEPARTURE;
  const saturday = weekdayIndex(day.input.date) === 6;
  const todays = table.frequencies
    .filter((f) => !saturday || f.saturday)
    .map((f) => {
      const swap = rng.chance(SWAP_CHANCE) ? chooseAircraftModel(rng, f.carrier.fleet, day.distanceMi, day.oceanic).key : f.aircraft;
      return { carrier: f.carrier, flightNumber: f.flightNumber, aircraft: swap, departMin: f.departMin, blockMin: day.airborneMin + taxiFor(f.taxiBase, swap) };
    });

  const kept: Departure[] = [];
  todays.forEach((d, i) => {
    const code = d.carrier.airline.code;
    const others = [...kept, ...todays.slice(i + 1)].map((o) => ({ departMin: o.departMin, carrier: o.carrier.airline.code }));
    const fits = (m: number) =>
      m >= first && m <= LAST_DEPARTURE && day.arrival(minutesToTime(m), d.blockMin).acceptable && clearOf(m, code, others);
    if (fits(d.departMin)) {
      kept.push(d);
      return;
    }
    for (let shift = 5; shift <= 120; shift += 5) {
      for (const m of [d.departMin - shift, d.departMin + shift]) {
        if (fits(m)) {
          kept.push({ ...d, departMin: m });
          return;
        }
      }
    }
  });
  return kept.sort((a, b) => a.departMin - b.departMin);
}

// ── Fares (illustrative) ────────────────────────────────────────────────────

/** Sunday … Saturday: Fridays and Sundays a little higher, Tuesdays, Wednesdays and Saturdays a little lower. */
const WEEKDAY_FARE: readonly number[] = [1.08, 1.03, 0.93, 0.95, 1.02, 1.08, 0.92];

const SOUTH_ASIA = new Set(["IN", "PK", "BD", "LK", "NP"]);
const SOUTHEAST_ASIA = new Set(["TH", "MY", "ID", "VN", "PH"]);

/** Early and late departures a little lower, the morning and evening peaks a little higher (half as much on long-haul). */
function hourFare(departMin: number, longHaul: boolean): number {
  const h = departMin / 60;
  const f = h < 7 ? 0.9 : h < 10 ? 1.06 : h < 16 ? 0.97 : h < 20 ? 1.06 : h < 22 ? 0.95 : 0.9;
  return longHaul ? 1 + (f - 1) / 2 : f;
}

/**
 * One-way economy, whole dollars, at least $39. Built from the route, the carrier, the weekday,
 * the departure hour and a ±10% seeded jitter — never from the turbulence, the plane or "today".
 */
function fareFor(day: RouteDay, airline: AirlineProfile, departMin: number, key: string): number {
  const d = day.distanceMi;
  let fare = 50 + 40 * Math.sqrt(d / 100) + 0.035 * Math.max(0, d - 2000);
  if (day.oceanic) fare *= 1.25;
  const within = (set: ReadonlySet<string>) => set.has(day.origin.country) && set.has(day.destination.country);
  if (within(SOUTH_ASIA)) fare *= 0.55;
  else if (within(SOUTHEAST_ASIA)) fare *= 0.7;
  if (airline.fareTier === "value") fare *= 0.82;
  else if (airline.fareTier === "premium") fare *= day.longHaul ? 1.15 : 1.04;
  fare *= WEEKDAY_FARE[weekdayIndex(day.input.date)] * hourFare(departMin, day.longHaul);
  fare *= createRng(`fare|${day.route}|${day.input.date}|${key}`).float(0.9, 1.1);
  return Math.max(39, Math.round(fare));
}

// ── Search ──────────────────────────────────────────────────────────────────

function build(norm: FlightInput): SearchResults {
  const day = routeDay(norm);
  const options: FlightOption[] = departuresFor(day).map((d) => {
    const key = optionKey(d);
    const block = airBlockOf(d.departMin);
    const flight = buildScheduledFlight(day, {
      id: hashId(`c|${norm.origin}|${norm.destination}|${norm.date}|${key}`),
      seed: `c|${day.route}|${norm.date}|${key}`,
      airline: d.carrier.airline.code,
      flightNumber: d.flightNumber,
      departTime: minutesToTime(d.departMin),
      aircraft: d.aircraft,
      blockMin: d.blockMin,
      airKey: `air|${day.route}|${norm.date}|${minutesToTime(block.start)}`,
      airTime: minutesToTime(block.airMin),
    });
    return { key, flight, fareUsd: fareFor(day, d.carrier.airline, d.departMin, key) };
  });
  // Shared by every caller (cached): sort or filter a copy, never the list itself.
  Object.freeze(options);
  return Object.freeze({ query: norm, options });
}

/** The day's flights for a route, by departure time. Cached and deterministic; throws on an invalid date. */
export function searchFlights(query: FlightInput): SearchResults {
  const norm = normalizeInput(query);
  const key = `${norm.origin}|${norm.destination}|${norm.date}`;
  return recall(RESULTS, key) ?? remember(RESULTS, RESULTS_MAX, key, build(norm));
}

/** One flight from a day's results by its key ("DL1423"), or null. */
export function findOption(query: FlightInput, key: string): FlightOption | null {
  const wanted = key.replace(/\s+/g, "").toUpperCase();
  return searchFlights(query).options.find((o) => o.key === wanted) ?? null;
}

/** Lowest fare and best smoothness score for the same route on another date (0s on a day without flights). */
export function dayOverview(query: FlightInput, date: string): DayOverview {
  const norm = normalizeInput({ ...query, date });
  const key = `${norm.origin}|${norm.destination}|${norm.date}`;
  const hit = recall(OVERVIEWS, key);
  if (hit) return hit;
  const { options } = searchFlights(norm);
  return remember(
    OVERVIEWS,
    OVERVIEWS_MAX,
    key,
    Object.freeze({
      date: norm.date,
      count: options.length,
      lowestFareUsd: options.reduce((min, o) => Math.min(min, o.fareUsd), options.length > 0 ? Infinity : 0),
      bestScore: options.reduce((max, o) => Math.max(max, o.flight.smoothness.score), 0),
    }),
  );
}
