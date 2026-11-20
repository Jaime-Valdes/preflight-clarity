/*
 * Version C — flight search (illustrative). For a route and date: the day's
 * nonstop flights, each a full `Flight` plus an illustrative fare.
 * Deterministic: the same route and date always give the same results.
 *
 * Contract: docs/VERSION_C.md ("Data contract"). The exported names and shapes
 * are fixed; everything below them is internal.
 *
 * Only routes an airline would plausibly fly nonstop get flights
 * (docs/FEASIBILITY.md: no invented nonstops). The carriers come from
 * nonstopCarriers in airlines.ts (via routeDay): a carrier from one end's home
 * market with a hub or focus city at one end, whose fleet reaches, whose
 * long-haul network serves the far end, to a far end big enough for the distance
 * — plus the listed real routes, the only ones beyond 6,500 mi. Everything else
 * — a typed (made-up) airport, two airports in one metro area, a small city far
 * from any hub, a market no carrier's network links (Delhi–Guadalajara), a
 * distance nobody flies nonstop (JFK–SYD) — has no options on any date, and
 * dayOverview counts 0 flights. hasNonstopService says which kind a route is,
 * without building a day.
 *
 * A day is built in three steps:
 *  1. A timetable per route and IATA season (seed `sched|ROUTE|SEASON`): how many
 *     flights the market gets (busy 8–14, ordinary 4–8, long-haul 2–5), which
 *     carriers fly them (nonstopCarriers; hub carriers fly several), their flight
 *     numbers, aircraft, departure times and published block times (on the
 *     5-minute grid, see scheduledBlock). Like a real timetable it repeats, so
 *     DL1423 leaves and lands at the same times every day of the season and the
 *     same flight can be compared across days. A few frequencies skip Saturdays.
 *  2. The day (seed `sched|ROUTE|DATE`): the frequencies flying that weekday, the
 *     odd equipment swap, and each departure checked against that date's arrival
 *     rules (daylight saving moves arrivals; one that would land inside a curfew or
 *     in the dead of night moves to the nearest time that works).
 *  3. Every flight is built by fakeFlight's buildScheduledFlight from the day's
 *     shared facts: one airborne time (the day's winds, for the turbulence model;
 *     the schedule shows the published block), the A/B route history, the weather
 *     by airport, date and hour, and one bump draw per two-hour air block (airBlockOf).
 *
 * Fares never look at the turbulence: distance, carrier tier, the date's demand
 * (weekday, US holidays), departure hour and a ±10% seeded jitter, on realistic
 * price points, at least $39. FlightOption.fareUsd is the base fare at a typical
 * booking lead time; fareAt(option, daysUntil) moves it along the lead-time
 * curve (last-minute high, a sweet spot 3–8 weeks out) for the UI to show.
 */
import { buildScheduledFlight, normalizeInput, routeDay, routeNonstopCarriers, type RouteCarrier, type RouteDay } from "./fakeFlight";
import { isRetiredFlightNumber, makeFlightNumber, type AirlineProfile } from "./airlines";
import { chooseAircraftModel, getAircraftModel } from "./aircraft";
import { addDays, daysBetween, minutesToTime, parseISODate, weekdayIndex } from "./dates";
import { clamp, createRng, hashId, hashString, type Rng } from "./random";
import type { Flight, FlightInput } from "./types";

export interface FlightOption {
  /** Unique within route + date, stable: airline code + number, no space — "DL1423". */
  key: string;
  /** Full flight (dashboard shape). `alternatives` is [] — C shows other options from the same results. */
  flight: Flight;
  /**
   * Illustrative one-way economy fare, whole US dollars: the base fare, at a typical booking lead
   * time (FARE_REFERENCE_LEAD_DAYS). Show fareAt(option, daysUntil) — the fare at today's lead time.
   */
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

const SERVICE = new Map<string, boolean>();
const SERVICE_MAX = 4096;
/** Any valid date: who flies a route doesn't depend on it. */
const SERVICE_DATE = "2026-01-15";

/**
 * Whether any airline would plausibly fly this route nonstop (docs/FEASIBILITY.md) — a fact about the
 * route, the same on every date. When false, searchFlights has no options on any day and dayOverview
 * counts 0; when true, every day has flights. Takes the endpoints searchFlights takes (a long LaGuardia
 * trip counts as the JFK route it is flown as; typed text that matches no catalogue airport is never
 * served). Cached and cheap: no day is built.
 */
export function hasNonstopService(origin: string, destination: string): boolean {
  const norm = normalizeInput({ origin, destination, date: SERVICE_DATE });
  const key = `${norm.origin}|${norm.destination}`;
  const hit = SERVICE.get(key);
  if (hit !== undefined) return hit;
  if (SERVICE.size >= SERVICE_MAX) SERVICE.delete(SERVICE.keys().next().value as string);
  const served = routeNonstopCarriers(norm.origin, norm.destination).length > 0;
  SERVICE.set(key, served);
  return served;
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
 * a departure in its middle (the last block's at 23:30). Exported for schedule.ts, which gives a
 * published flight the same block as a generated one at that time.
 */
export function airBlockOf(departMin: number): { start: number; airMin: number } {
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
  /** Published gate-to-gate minutes, the same every day of the season (scheduledBlock). */
  blockMin: number;
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

/**
 * The block time a timetable publishes for a frequency, as airlines do: one per season, on the
 * 5-minute grid — the route's longest airborne time in its daily winds plus the frequency's taxi,
 * rounded up. A flight's published arrival is then the same every day of the season, and the day's
 * own winds (Flight.airborneMin) stay inside the turbulence model.
 */
function scheduledBlock(day: RouteDay, taxiMin: number): number {
  return Math.ceil((day.longestAirborneMin + taxiMin) / 5) * 5;
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
  // Nobody would fly this route nonstop: no timetable at all.
  if (carriers.length === 0) return { market, frequencies: [] };
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
  // hours on a mid-season day with half an hour to spare either way (each frequency's own block
  // time, the clock changes on other dates).
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
    blockMin: scheduledBlock(plan, taxiFor(p.draft.taxiBase, p.draft.aircraft)),
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

/**
 * The timetable's flights that operate on the day, each landing at a sensible hour that date, on the
 * published block time (an equipment swap keeps it, as it does in real schedules).
 */
function departuresFor(day: RouteDay): Departure[] {
  const rng = createRng(`sched|${day.route}|${day.input.date}`);
  const table = timetableFor(day);
  const first = table.market === "long" ? FIRST_LONG_DEPARTURE : FIRST_DEPARTURE;
  const saturday = weekdayIndex(day.input.date) === 6;
  const todays = table.frequencies
    .filter((f) => !saturday || f.saturday)
    .map((f) => {
      const swap = rng.chance(SWAP_CHANCE) ? chooseAircraftModel(rng, f.carrier.fleet, day.distanceMi, day.oceanic).key : f.aircraft;
      return { carrier: f.carrier, flightNumber: f.flightNumber, aircraft: swap, departMin: f.departMin, blockMin: f.blockMin };
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
//
// One-way economy fares that look like the ones booking sites show, without ever being real:
// a base fare from the route (distance, oceanic or international, cheaper regional markets), the
// carrier's tier, the date's demand (weekday, US holidays) and the departure hour, with a ±10%
// seeded jitter, on realistic price points. Calibrated to roughly the one-way equivalent of the
// BTS average domestic itinerary fare (about $390 in 2025, one-way and round-trip tickets mixed)
// plus the typical nonstop one-way economy ranges booking sites show (LGA–ORD ~$90–180, ATL–MCO
// ~$75–140, JFK–LAX ~$200–320, JFK–LHR ~$400–650, SFO–NRT ~$520–820, LAX–SYD ~$780–1,150) — a
// synthesis, not a published per-route figure; check-search.ts prints the medians. Never from the turbulence, the plane
// or "today": the base fare is cached with the day; fareAt adds the lead time when the UI asks.

/** Sunday … Saturday: Fridays and Sundays a little higher, Tuesdays, Wednesdays and Saturdays a little lower. */
const WEEKDAY_FARE: readonly number[] = [1.08, 1.03, 0.93, 0.95, 1.02, 1.08, 0.92];

/** Markets where fares run well below the distance curve: low-cost competition, lower incomes. */
const SOUTH_ASIA = new Set(["IN", "PK", "BD", "LK", "NP"]);
const SOUTHEAST_ASIA = new Set(["TH", "MY", "ID", "VN", "PH"]);
const LATIN_AMERICA = new Set(["MX", "BR", "AR", "CL", "CO", "PE", "PA"]);
const AFRICA = new Set(["ZA", "EG", "ET", "KE", "NG", "GH", "MA"]);

/**
 * Departures before 06:30 and after 21:00 a little lower, the 07:00–09:30 and 16:00–19:00 peaks
 * a little higher (half as much on long-haul, where the day has one or two departures).
 */
function hourFare(departMin: number, longHaul: boolean): number {
  const h = departMin / 60;
  const f = h < 6.5 ? 0.9 : h < 7 ? 0.97 : h < 9.5 ? 1.07 : h < 16 ? 0.98 : h < 19 ? 1.07 : h < 21 ? 0.99 : 0.9;
  return longHaul ? 1 + (f - 1) / 2 : f;
}

/** Demand around the US holidays, by offset in days from the holiday (Thanksgiving, Memorial Day, Labor Day). */
const THANKSGIVING_FARE: Readonly<Record<number, number>> = { [-2]: 1.12, [-1]: 1.25, 0: 0.92, 1: 0.95, 2: 1.06, 3: 1.28, 4: 1.12 };
const LONG_WEEKEND_FARE: Readonly<Record<number, number>> = { [-4]: 1.05, [-3]: 1.1, 0: 1.08 };
/** Christmas, New Year and the Fourth of July, by "MM-DD": the days around the holiday high, the day itself lower. */
const FIXED_HOLIDAY_FARE: Readonly<Record<string, number>> = {
  "12-18": 1.08, "12-19": 1.12, "12-20": 1.18, "12-21": 1.22, "12-22": 1.22, "12-23": 1.18, "12-24": 1.0, "12-25": 0.92,
  "12-26": 1.12, "12-27": 1.15, "12-28": 1.15, "12-29": 1.15, "12-30": 1.12, "12-31": 0.95, "01-01": 1.08, "01-02": 1.2,
  "01-03": 1.18, "01-04": 1.1, "01-05": 1.05,
  "07-01": 1.06, "07-02": 1.1, "07-03": 1.12, "07-04": 0.95, "07-05": 1.08, "07-06": 1.05,
};
/** Christmas and New Year travel everywhere, at half the US amplitude. */
const WINTER_HOLIDAYS = /^12-(1[89]|2\d|3[01])$|^01-0[1-5]$/;

/** The n-th (1-based) given weekday (0 = Sunday) of a month, "YYYY-MM-DD". */
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  const first = `${y}-${pad2(m)}-01`;
  return addDays(first, ((weekday - weekdayIndex(first) + 7) % 7) + 7 * (n - 1));
}

/** The last given weekday of a month. */
function lastWeekday(y: number, m: number, weekday: number): string {
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad2(m + 1)}-01`;
  const last = addDays(next, -1);
  return addDays(last, -((weekdayIndex(last) - weekday + 7) % 7));
}

/**
 * How much the date's holidays move fares: on routes touching the US, the days around Thanksgiving,
 * Christmas and New Year, the Fourth of July, Memorial Day and Labor Day (the holiday itself is a
 * quiet travel day); elsewhere only the Christmas and New Year period, more gently. 1 on other days.
 */
function holidayFare(date: string, touchesUS: boolean): number {
  const monthDay = date.slice(5);
  const fixed = FIXED_HOLIDAY_FARE[monthDay] ?? 1;
  if (!touchesUS) return WINTER_HOLIDAYS.test(monthDay) ? 1 + (fixed - 1) / 2 : 1;
  const { y } = parseISODate(date);
  const offset = (holiday: string) => daysBetween(holiday, date);
  const movable =
    THANKSGIVING_FARE[offset(nthWeekday(y, 11, 4, 4))] ?? LONG_WEEKEND_FARE[offset(lastWeekday(y, 5, 1))] ?? LONG_WEEKEND_FARE[offset(nthWeekday(y, 9, 1, 1))] ?? 1;
  return fixed * movable;
}

/**
 * The fare's last digit, drawn once per flight: fares end in 7, 9 or 4 far more often than not,
 * as fare ladders do, and a flight keeps its ending along the lead-time curve ($187, $227, $329).
 * Round hundreds happen only by coincidence (a 0 ending on a round tens value).
 */
const ENDING_WEIGHTS: ReadonlyArray<readonly [number, number]> = [[7, 30], [9, 27], [4, 17], [8, 8], [3, 6], [2, 4], [6, 3], [1, 2], [5, 2], [0, 1]];
const ENDING_TOTAL = ENDING_WEIGHTS.reduce((s, [, w]) => s + w, 0);

/** What a flight's fares look like, the same on every date and at every lead time. */
interface FareShape {
  /** Last digit of every fare of this flight. */
  ending: number;
  /** Days the lead-time curve is shifted by for this flight (−1.5 … 1.5), so flights don't move in lockstep. */
  shift: number;
  /** Exponent on the lead-time factor (0.85 … 1.15): how sharply this flight's fare rises close to departure. */
  elasticity: number;
}

function fareShape(origin: string, destination: string, key: string): FareShape {
  const [a, b, c] = hashString(`fare-shape|${origin}|${destination}|${key}`);
  let r = (a / 4294967296) * ENDING_TOTAL;
  let ending = ENDING_WEIGHTS[ENDING_WEIGHTS.length - 1][0];
  for (const [digit, w] of ENDING_WEIGHTS) {
    r -= w;
    if (r < 0) {
      ending = digit;
      break;
    }
  }
  return { ending, shift: (b / 4294967296) * 3 - 1.5, elasticity: 0.85 + (c / 4294967296) * 0.3 };
}

/**
 * The nearest whole-dollar amount with the given last digit, at least $39 (the lowest amount with
 * that ending from $39 up: $39, $44, $47 …). Monotonic in the amount, and a price point maps to itself.
 */
function pricePoint(amount: number, ending: number): number {
  const lowest = 39 + ((ending + 1) % 10);
  return Math.max(lowest, 10 * Math.floor((amount + 5 - ending) / 10) + ending);
}

/**
 * Base fare: one-way economy at a typical booking lead time, from the route, the carrier, the date
 * and the departure hour with a ±10% seeded jitter — never from the turbulence, the plane or "today".
 */
function fareFor(day: RouteDay, airline: AirlineProfile, departMin: number, key: string): number {
  const d = day.distanceMi;
  let fare = 42 + 36 * Math.sqrt(d / 100) + 0.04 * Math.max(0, d - 2000);
  if (day.oceanic) fare *= 1.4;
  else if (!day.domestic) fare *= 1.1;
  const within = (set: ReadonlySet<string>) => set.has(day.origin.country) && set.has(day.destination.country);
  if (within(SOUTH_ASIA)) fare *= 0.55;
  else if (within(SOUTHEAST_ASIA)) fare *= 0.7;
  else if (within(AFRICA)) fare *= 0.8;
  else if (within(LATIN_AMERICA)) fare *= 0.85;
  if (airline.fareTier === "value") fare *= 0.84;
  else if (airline.fareTier === "premium") fare *= day.longHaul ? 1.15 : 1.04;
  const touchesUS = [day.origin.country, day.destination.country].some((c) => c === "US" || c === "PR");
  fare *= WEEKDAY_FARE[weekdayIndex(day.input.date)] * holidayFare(day.input.date, touchesUS) * hourFare(departMin, day.longHaul);
  fare *= createRng(`fare|${day.route}|${day.input.date}|${key}`).float(0.9, 1.1);
  return pricePoint(fare, fareShape(day.origin.code, day.destination.code, key).ending);
}

/**
 * How the fare moves with the days left before departure, as a factor on the base fare: last-minute
 * high (0–3 days ×1.5–1.85), easing through the first two weeks (×1.2–1.35), near the base at three
 * weeks, a sweet spot 3–8 weeks out (×0.95–0.98), the base again at about two months, and a little
 * above it far out (×1.03–1.12). Linear between the knots.
 */
const LEAD_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 1.85], [1, 1.74], [2, 1.62], [3, 1.5], [4, 1.35], [7, 1.28], [13, 1.2], [14, 1.1], [20, 1.05], [21, 1.0], [28, 0.97],
  [42, 0.95], [50, 0.96], [56, 0.98], [60, 1.0], [66, 1.0], [90, 1.03], [120, 1.07], [180, 1.09], [330, 1.12],
];

/** Lead time at which fareAt is the base fare (FlightOption.fareUsd): about two months out, where the curve is 1.0. */
export const FARE_REFERENCE_LEAD_DAYS = 63;

function leadFactor(days: number): number {
  const last = LEAD_CURVE[LEAD_CURVE.length - 1];
  if (days <= LEAD_CURVE[0][0]) return LEAD_CURVE[0][1];
  if (days >= last[0]) return last[1];
  for (let i = 1; i < LEAD_CURVE.length; i++) {
    const [x1, y1] = LEAD_CURVE[i];
    if (days > x1) continue;
    const [x0, y0] = LEAD_CURVE[i - 1];
    return y0 + ((days - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

/**
 * The fare to show for an option when its departure is `daysUntil` days away (0 or less: today, the
 * last-minute fare): the base fare (fareUsd) moved along the lead-time curve, with each flight's own
 * small shift and steepness so a day's fares don't move in lockstep, on the flight's price points, at
 * least $39. Deterministic in the option and the lead time; never looks at the turbulence. The UI
 * sorts "Cheapest", filters by price and fills the date strip with this, not with fareUsd.
 */
export function fareAt(option: FlightOption, daysUntil: number): number {
  const f = option.flight;
  const shape = fareShape(f.origin.code, f.destination.code, option.key);
  const days = Number.isFinite(daysUntil) ? clamp(daysUntil, 0, LEAD_CURVE[LEAD_CURVE.length - 1][0]) : FARE_REFERENCE_LEAD_DAYS;
  return pricePoint(option.fareUsd * leadFactor(days + shape.shift) ** shape.elasticity, shape.ending);
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

// ── Published schedules (version D) ────────────────────────────────────────
//
// schedule.ts turns a provider's rows into the FlightOption shape above. These give it the two
// pieces of this file it needs: the generator's own departures for a day, so the backend's generator
// provider and the tests share one path with searchFlights, and the fare path searchFlights uses.
// Additive: nothing above changes.

/** One departure of the generator's timetable on a day: the facts a schedule publishes. */
export interface ScheduledDeparture {
  /** Operating carrier, IATA. */
  airline: string;
  /** "DL 1423" */
  flightNumber: string;
  /** Catalogue model key. */
  aircraft: string;
  /** Local "HH:MM". */
  departTime: string;
  /** Published gate-to-gate minutes. */
  blockMin: number;
}

/** The generator's departures for a route-day, by departure time: what searchFlights builds its options from. */
export function scheduledDepartures(query: FlightInput): ScheduledDeparture[] {
  const day = routeDay(normalizeInput(query));
  return departuresFor(day).map((d) => ({
    airline: d.carrier.airline.code,
    flightNumber: d.flightNumber,
    aircraft: d.aircraft,
    departTime: minutesToTime(d.departMin),
    blockMin: d.blockMin,
  }));
}

/** The illustrative base fare of a scheduled flight, through the path searchFlights uses (fareFor). */
export function illustrativeFare(day: RouteDay, airline: AirlineProfile, departMin: number, key: string): number {
  return fareFor(day, airline, departMin, key);
}
