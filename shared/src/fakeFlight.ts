/*
 * Fake-flight generator.
 *
 * generateFlight(input, prefs?) is a pure function of normalizeInput(input)
 * and normalizePrefs(prefs): no Math.random, no clock, no locale. Every facet
 * (route, crew, aircraft, turbulence, weather, seats, sounds, alternatives)
 * draws from its own sub-stream forked from the seed
 * `${origin}|${destination}|${date}` (+ a stable suffix for non-empty prefs,
 * see flightSeed), so a change in one facet never shifts another.
 *
 * Facts that are not about one flight are shared by every flight they cover,
 * whatever its prefs: the route history by route and month (routeMonthFor),
 * the weather by airport, date and hour (weatherAt), the airborne time by
 * route and day. Options leaving within an hour of the same day's reference
 * flight (empty prefs) fly in its air: they share its bump draw, and a
 * wide-body feels it a little less (referenceDay). Other options add an
 * explicit time-of-day model; see todModelFor.
 *
 * Version C's day schedules (search.ts) are built from the same parts through
 * routeDay and buildScheduledFlight, at the end of this file; they never
 * change what generateFlight returns.
 *
 * Every string here is shown verbatim to anxious flyers: calm, plain,
 * specific, never alarming and never promising.
 */
import type {
  Aircraft,
  AirlineStats,
  AlternativeFlight,
  Airport,
  BumpWindow,
  DepartWindow,
  Flight,
  FlightInput,
  FlightPhase,
  FlightPrefs,
  Intensity,
  PhaseForecast,
  CrewInfo,
  RouteHistory,
  SeatMap,
  SeatRow,
  Smoothness,
  SoundCue,
  TurbulenceForecast,
  TurbulencePoint,
  WeatherCondition,
  WeatherReport,
} from "./types";
import { clamp, createRng, hashId, hashString, round1, type Rng } from "./random";
import { climateFor, getAirport, resolveAirport } from "./airports";
import {
  candidateAirlines,
  getAirline,
  makeFlightNumber,
  marketOf,
  nonstopCarriers,
  regionOf,
  toAirline,
  type AirlineProfile,
} from "./airlines";
import {
  buildAircraft,
  cabinConfigFor,
  chooseAircraftModel,
  columnGroupsFor,
  getAircraftModel,
  type AircraftModel,
  type CabinConfig,
} from "./aircraft";
import { addDays, daysBetween, formatOffset, isISODate, minutesToTime, monthName, parseISODate, timeToMinutes } from "./dates";

// ── Input ───────────────────────────────────────────────────────────────────

function normalizeEndpoint(value: string): string {
  const raw = (value ?? "").trim().replace(/\s+/g, " ");
  if (!raw) return "";
  const airport = resolveAirport(raw);
  return airport.known ? airport.code : raw;
}

/**
 * Trims; a known airport code (any case), "City (ABC)" or a known city name
 * becomes that airport's code; other text is kept as typed. The date must be
 * a valid "YYYY-MM-DD" (throws otherwise).
 */
export function normalizeInput(input: FlightInput): FlightInput {
  const date = (input.date ?? "").trim();
  if (!isISODate(date)) throw new Error(`Invalid date: ${JSON.stringify(input.date)}`);
  return {
    origin: normalizeEndpoint(input.origin),
    destination: normalizeEndpoint(input.destination),
    date,
  };
}

// ── Prefs ───────────────────────────────────────────────────────────────────

export const DEPART_WINDOWS: readonly DepartWindow[] = ["morning", "afternoon", "evening"];

/** Departure windows in local minutes, inclusive, on a 5-minute grid: 06–11, 11–17, 17–23. */
const WINDOW_RANGES: Record<DepartWindow, [number, number]> = {
  morning: [6 * 60, 10 * 60 + 55],
  afternoon: [11 * 60, 16 * 60 + 55],
  evening: [17 * 60, 22 * 60 + 55],
};

/** The departure window a local "HH:MM" time falls in (before 06:00 counts as morning, after 23:00 as evening). */
export function departWindowOf(time: string): DepartWindow {
  const h = Number(time.slice(0, 2));
  return h < 11 ? "morning" : h < 17 ? "afternoon" : "evening";
}

/**
 * Drops unknown values, uppercases the airline code (unknown codes are
 * dropped) and orders the keys, so equal prefs always produce equal seeds.
 */
export function normalizePrefs(prefs?: FlightPrefs | null): FlightPrefs {
  const out: FlightPrefs = {};
  if (!prefs) return out;
  if (prefs.departWindow && DEPART_WINDOWS.includes(prefs.departWindow)) out.departWindow = prefs.departWindow;
  if (prefs.bodyType === "wide") out.bodyType = "wide";
  const code = typeof prefs.airline === "string" ? prefs.airline.trim().toUpperCase() : "";
  if (code && getAirline(code)) out.airline = code;
  return out;
}

/**
 * `${origin}|${destination}|${date}` for empty prefs (unchanged from the
 * original generator), plus `|w=<window>`, `|b=wide`, `|a=<IATA>` — in that
 * order, each only when set — for non-empty ones.
 */
export function flightSeed(input: FlightInput, prefs?: FlightPrefs | null): string {
  const norm = normalizeInput(input);
  const p = normalizePrefs(prefs);
  let seed = `${norm.origin}|${norm.destination}|${norm.date}`;
  if (p.departWindow) seed += `|w=${p.departWindow}`;
  if (p.bodyType) seed += `|b=${p.bodyType}`;
  if (p.airline) seed += `|a=${p.airline}`;
  return seed;
}

const hasPrefs = (p: FlightPrefs) => Boolean(p.departWindow || p.bodyType || p.airline);

// ── Time zones (Intl is deterministic for a given instant and zone) ─────────

const FORMATTERS = new Map<string, Intl.DateTimeFormat | null>();

function formatterFor(tz: string): Intl.DateTimeFormat | null {
  const cached = FORMATTERS.get(tz);
  if (cached !== undefined) return cached;
  let formatter: Intl.DateTimeFormat | null = null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    formatter = null;
  }
  FORMATTERS.set(tz, formatter);
  return formatter;
}

interface LocalParts {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
}

function localParts(tz: string, utcMs: number): LocalParts {
  const formatter = formatterFor(tz);
  if (!formatter) {
    const d = new Date(utcMs);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() };
  }
  const parts = formatter.formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { y: get("year"), m: get("month"), d: get("day"), hh: get("hour") % 24, mm: get("minute") };
}

/** Offset of `tz` from UTC in minutes at a given instant (whole minutes). */
function tzOffsetMinutes(tz: string, utcMs: number): number {
  const p = localParts(tz, utcMs);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm);
  return Math.round((asUtc - utcMs) / 60000);
}

function localToUtc(dateIso: string, hhmm: string, tz: string): number {
  const { y, m, d } = parseISODate(dateIso);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, h, mi);
  const off1 = tzOffsetMinutes(tz, wall);
  let utc = wall - off1 * 60000;
  const off2 = tzOffsetMinutes(tz, utc);
  if (off2 !== off1) utc = wall - off2 * 60000;
  return utc;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
/**
 * The UTC instant a flight leaves the gate (its departure date and local time at the origin).
 * Pure; the UI compares it with the client's clock to tell flights that already left today.
 */
export function departureUtcMs(flight: Pick<Flight, "input" | "departTime" | "origin">): number {
  return localToUtc(flight.input.date, flight.departTime, flight.origin.tz);
}


function utcToLocal(utcMs: number, tz: string): { date: string; time: string; hour: number } {
  const p = localParts(tz, utcMs);
  return { date: `${p.y}-${pad2(p.m)}-${pad2(p.d)}`, time: `${pad2(p.hh)}:${pad2(p.mm)}`, hour: p.hh + p.mm / 60 };
}

/** Local departure "HH:MM" on `date` → local arrival time and day offset at the destination. */
function arrivalFor(date: string, departTime: string, originTz: string, blockMin: number, destTz: string) {
  const depUtc = localToUtc(date, departTime, originTz);
  const arr = utcToLocal(depUtc + blockMin * 60000, destTz);
  return { arriveTime: arr.time, arriveDayOffset: daysBetween(date, arr.date), arriveDate: arr.date, arriveHour: arr.hour };
}

// ── Geometry and route context ──────────────────────────────────────────────

const toRad = (deg: number) => (deg * Math.PI) / 180;

function haversineMi(a: Airport, b: Airport): number {
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Point a fraction f (0–1) along the great circle from a to b. */
function alongRoute(a: Airport, b: Airport, f: number): { lat: number; lon: number } {
  const vec = (lat: number, lon: number) => {
    const la = toRad(lat);
    const lo = toRad(lon);
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  };
  const p = vec(a.lat, a.lon);
  const q = vec(b.lat, b.lon);
  const omega = Math.acos(clamp(p[0] * q[0] + p[1] * q[1] + p[2] * q[2], -1, 1));
  if (omega < 1e-9) return { lat: a.lat, lon: a.lon };
  const s1 = Math.sin((1 - f) * omega) / Math.sin(omega);
  const s2 = Math.sin(f * omega) / Math.sin(omega);
  const v = [s1 * p[0] + s2 * q[0], s1 * p[1] + s2 * q[1], s1 * p[2] + s2 * q[2]];
  return { lat: (Math.asin(v[2]) * 180) / Math.PI, lon: (Math.atan2(v[1], v[0]) * 180) / Math.PI };
}

function lonDelta(a: Airport, b: Airport): number {
  let d = b.lon - a.lon;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

type Season = "winter" | "spring" | "summer" | "autumn";
type Slot = "morning" | "midday" | "afternoon" | "evening" | "overnight";

interface MountainRange {
  name: string;
  short: string;
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
}

const RANGES: MountainRange[] = [
  { name: "the Rocky Mountains", short: "the Rockies", lonMin: -115, lonMax: -104, latMin: 35, latMax: 55 },
  { name: "the Sierra Nevada", short: "the Sierra Nevada", lonMin: -121, lonMax: -118, latMin: 35, latMax: 41 },
  { name: "the Alps", short: "the Alps", lonMin: 5.5, lonMax: 14, latMin: 44, latMax: 48 },
  { name: "the Pyrenees", short: "the Pyrenees", lonMin: -2, lonMax: 3, latMin: 42, latMax: 43.3 },
  { name: "the Andes", short: "the Andes", lonMin: -72, lonMax: -64, latMin: -45, latMax: -10 },
];

const COASTAL = new Set([
  "JFK", "LGA", "EWR", "BOS", "MIA", "FLL", "TPA", "LAX", "SAN", "SFO", "OAK", "SEA", "HNL", "OGG", "SJU", "CUN",
  "MBJ", "NAS", "PUJ", "LIM", "GIG", "NCE", "LIS", "BCN", "ATH", "IST", "TLV", "DXB", "AUH", "DOH", "HND", "KIX",
  "HKG", "SIN", "MNL", "DPS", "BOM", "SYD", "BNE", "PER", "AKL", "CPT", "LOS", "ACC", "CMN", "YVR", "KEF", "CPH",
]);

/**
 * Perimeter rules: LaGuardia and Reagan National only fly short routes, from
 * gates built for narrow-bodies. Longer trips really leave from JFK / Dulles.
 */
const PERIMETER: Record<string, { limitMi: number; exempt: readonly string[]; fallback: string }> = {
  LGA: { limitMi: 1500, exempt: ["DEN"], fallback: "JFK" },
  DCA: { limitMi: 1250, exempt: ["LAX", "SFO", "SEA", "LAS", "PHX", "SLC", "DEN", "SAN", "AUS", "PDX"], fallback: "IAD" },
};

interface RouteContext {
  origin: Airport;
  destination: Airport;
  distanceMi: number;
  synthetic: boolean;
  /** LGA / DCA: narrow-body gates only. */
  narrowOnly: boolean;
  domestic: boolean;
  oceanic: boolean;
  longHaul: boolean;
  eastbound: boolean;
  ewStrength: number;
  midLat: number;
  tropical: boolean;
  month: number;
  year: number;
  season: Season;
  crossings: Array<{ range: MountainRange; frac: number }>;
  originRange: MountainRange | null;
  destRange: MountainRange | null;
}

function inRange(lat: number, lon: number, r: MountainRange): boolean {
  return lon >= r.lonMin && lon <= r.lonMax && lat >= r.latMin && lat <= r.latMax;
}

function seasonFor(month: number, lat: number): Season {
  const m = lat < 0 ? ((month + 5) % 12) + 1 : month;
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

function withContext(a: Airport, other: Airport): Airport {
  if (a.known) return a;
  const [h1, h2] = hashString(`${a.city}|${other.code}`);
  const lat = clamp(other.lat + ((h1 % 2400) / 100 - 12), -55, 65);
  const lon = other.lon + ((h2 % 5000) / 100 - 25);
  return {
    ...a,
    country: other.country,
    tz: other.tz,
    lat: Math.round(lat * 1000) / 1000,
    lon: Math.round(((((lon + 180) % 360) + 360) % 360 - 180) * 1000) / 1000,
  };
}

function buildRoute(input: FlightInput): RouteContext {
  let origin = resolveAirport(input.origin);
  let destination = resolveAirport(input.destination);
  const synthetic = !origin.known || !destination.known;
  if (!origin.known && destination.known) origin = withContext(origin, destination);
  else if (!destination.known && origin.known) destination = withContext(destination, origin);
  else if (!origin.known && !destination.known) destination = withContext(destination, origin);

  const sameAirport = origin.code === destination.code && origin.known && destination.known;
  // Synthetic endpoints sit at a date-independent spot near the known one, so the
  // same typed route is always the same short or medium hop.
  const measure = () =>
    sameAirport ? 150 : synthetic ? clamp(Math.round(haversineMi(origin, destination)), 180, 1600) : Math.max(120, Math.round(haversineMi(origin, destination)));
  let distanceMi = measure();

  // A trip beyond LaGuardia's or National's perimeter really leaves from JFK / Dulles.
  for (const side of ["origin", "destination"] as const) {
    const here = side === "origin" ? origin : destination;
    const there = side === "origin" ? destination : origin;
    const rule = PERIMETER[here.code];
    if (!rule || !here.known || rule.exempt.includes(there.code) || distanceMi <= rule.limitMi) continue;
    const moved = getAirport(rule.fallback);
    if (!moved) continue;
    if (side === "origin") origin = moved;
    else destination = moved;
    distanceMi = measure();
  }
  const narrowOnly = origin.code in PERIMETER || destination.code in PERIMETER;

  const { y, m } = parseISODate(input.date);
  const dLon = lonDelta(origin, destination);
  const midLat = (origin.lat + destination.lat) / 2;
  const domestic = marketOf(origin.country) === marketOf(destination.country);
  const oceanic = regionOf(origin.country) !== regionOf(destination.country) && distanceMi > 1500;

  const crossings: RouteContext["crossings"] = [];
  const originRange = RANGES.find((r) => inRange(origin.lat, origin.lon, r)) ?? null;
  const destRange = RANGES.find((r) => inRange(destination.lat, destination.lon, r)) ?? null;
  if (!synthetic && !sameAirport) {
    for (const range of RANGES) {
      if (range === originRange || range === destRange) continue;
      for (let i = 2; i <= 38; i++) {
        const f = i / 40;
        const { lat, lon } = alongRoute(origin, destination, f);
        if (inRange(lat, lon, range)) {
          crossings.push({ range, frac: f });
          break;
        }
      }
    }
  }

  return {
    origin,
    destination,
    distanceMi,
    synthetic,
    narrowOnly,
    domestic,
    oceanic,
    longHaul: oceanic || distanceMi > 2600,
    eastbound: dLon > 0,
    ewStrength: Math.min(1, Math.abs(dLon) / 40),
    midLat,
    tropical: Math.abs(midLat) < 23.5,
    month: m,
    year: y,
    season: seasonFor(m, midLat),
    crossings,
    originRange,
    destRange,
  };
}

// ── Timing ──────────────────────────────────────────────────────────────────

interface Timing {
  airborneMin: number;
  blockMin: number;
  departTime: string;
  departHour: number;
  slot: Slot;
  arriveTime: string;
  arriveDayOffset: number;
  arriveDate: string;
  arriveHour: number;
}

const round5 = (n: number) => Math.round(n / 5) * 5;

/** Airborne minutes in the route's typical winds, before the day's ±2% variation. */
function typicalAirborne(ctx: RouteContext): number {
  const distanceMi = ctx.distanceMi;
  // Wide-bodies cruise faster and spend proportionally less of the trip climbing and
  // descending: effective speed ramps from ~490 mph on short hops to ~545 mph on ultra-long routes.
  const milesPerMin = 8.2 + clamp((distanceMi - 2500) / 6000, 0, 0.9);
  const base = distanceMi / milesPerMin + 18;
  // Jet-stream asymmetry fades on near-antipodal pairs, which are flown over the pole
  // (SIN–JFK and HKG–JFK schedules differ by only ~10 min each way).
  const polar = clamp((Math.abs(lonDelta(ctx.origin, ctx.destination)) - 140) / 40, 0, 1);
  const windAmp = (distanceMi > 5000 ? 0.055 : 0.08) * (1 - 0.6 * polar);
  const wind = 1 + windAmp * ctx.ewStrength * (ctx.eastbound ? -1 : 1);
  return base * wind;
}

/** The day's winds lengthen or shorten the typical airborne time by up to 2%. */
const DAY_WINDS: readonly [number, number] = [0.98, 1.02];

function airborneFor(rng: Rng, ctx: RouteContext): number {
  return Math.max(30, Math.round(typicalAirborne(ctx) * rng.float(DAY_WINDS[0], DAY_WINDS[1])));
}

/** Long eastbound routes are flown overnight. A route fact, so the schedule and the route history agree. */
function overnightRoute(ctx: RouteContext): boolean {
  return ctx.longHaul && ctx.eastbound && typicalAirborne(ctx) >= 360;
}

const SLOT_RANGES: Record<Slot, [number, number]> = {
  morning: [6 * 60, 9 * 60 + 55],
  midday: [10 * 60, 13 * 60 + 55],
  afternoon: [14 * 60, 17 * 60 + 55],
  evening: [18 * 60, 21 * 60 + 30],
  overnight: [17 * 60, 23 * 60 + 30],
};

/** Airports closed to landings overnight: [closes at, reopens at] in local hours. */
const CURFEW: Record<string, [number, number]> = { SYD: [23, 6], FRA: [23, 5], ZRH: [23.5, 6], LHR: [23.5, 4.5] };
/** Round-the-clock hubs where a 3 AM arrival is normal. */
const ALL_NIGHT_HUBS = new Set(["DXB", "DOH", "AUH", "IST", "SIN", "KUL", "BKK"]);

function arrivalAcceptable(destination: Airport, arriveHour: number): boolean {
  const curfew = CURFEW[destination.code];
  if (curfew && (arriveHour >= curfew[0] || arriveHour < curfew[1])) return false;
  if (ALL_NIGHT_HUBS.has(destination.code)) return true;
  return !(arriveHour >= 0.75 && arriveHour < 5.5);
}

/**
 * A departure time in the wanted slot whose arrival lands at a sensible hour —
 * not in the dead of night and never inside the destination's curfew. When no
 * time in that slot works (LAX–SYD in the afternoon), the next slots are tried
 * in the order real airlines schedule such routes.
 */
function scheduleDeparture(
  rng: Rng,
  date: string,
  wanted: Slot,
  ctx: RouteContext,
  blockMin: number,
  taken: ReadonlySet<string> = new Set(),
): { departTime: string; slot: Slot } {
  const order: Slot[] = [wanted, "evening", "overnight", "morning", "midday", "afternoon"];
  const timesIn = (slot: Slot) => {
    const [lo, hi] = SLOT_RANGES[slot];
    const times: string[] = [];
    for (let m = lo; m <= hi; m += 5) times.push(minutesToTime(m));
    return times;
  };
  for (const slot of order) {
    const ok = timesIn(slot).filter(
      (t) => !taken.has(t) && arrivalAcceptable(ctx.destination, arrivalFor(date, t, ctx.origin.tz, blockMin, ctx.destination.tz).arriveHour),
    );
    if (ok.length > 0) return { departTime: rng.pick(ok), slot };
  }
  const any = timesIn(wanted).filter((t) => !taken.has(t));
  return { departTime: rng.pick(any.length > 0 ? any : timesIn(wanted)), slot: wanted };
}

/**
 * A departure time inside the participant's chosen window. Prefers times whose
 * arrival lands at a sensible hour, then times outside any curfew; the window
 * itself is always honoured (the participant asked for it).
 */
function scheduleInWindow(rng: Rng, date: string, window: DepartWindow, ctx: RouteContext, blockMin: number): string {
  const [lo, hi] = WINDOW_RANGES[window];
  const times: string[] = [];
  for (let m = lo; m <= hi; m += 5) times.push(minutesToTime(m));
  const arriveHour = (t: string) => arrivalFor(date, t, ctx.origin.tz, blockMin, ctx.destination.tz).arriveHour;
  const ok = times.filter((t) => arrivalAcceptable(ctx.destination, arriveHour(t)));
  if (ok.length > 0) return rng.pick(ok);
  const curfew = CURFEW[ctx.destination.code];
  const outsideCurfew = curfew ? times.filter((t) => !(arriveHour(t) >= curfew[0] || arriveHour(t) < curfew[1])) : times;
  return rng.pick(outsideCurfew.length > 0 ? outsideCurfew : times);
}

function slotOfHour(hour: number): Slot {
  return hour < 10 ? "morning" : hour < 14 ? "midday" : hour < 18 ? "afternoon" : "evening";
}

/** Timing for a departure at a known local time (no draws). */
function timingAt(ctx: RouteContext, date: string, departTime: string, airborneMin: number, blockMin: number): Timing {
  const [h, mi] = departTime.split(":").map(Number);
  const arr = arrivalFor(date, departTime, ctx.origin.tz, blockMin, ctx.destination.tz);
  return { airborneMin, blockMin, departTime, departHour: h + mi / 60, slot: slotOfHour(h + mi / 60), ...arr };
}

/**
 * `dayAirborneMin`: options fly in the same day's winds as the reference flight, so they
 * take its airborne time (their own draw is still made, keeping the rest of the stream in place).
 */
function buildTiming(rng: Rng, ctx: RouteContext, date: string, window?: DepartWindow, dayAirborneMin?: number): Timing {
  const drawn = airborneFor(rng, ctx);
  const airborneMin = dayAirborneMin ?? drawn;
  const blockMin = airborneMin + rng.int(15, 35);
  if (window) return timingAt(ctx, date, scheduleInWindow(rng, date, window, ctx, blockMin), airborneMin, blockMin);
  const wanted: Slot = overnightRoute(ctx)
    ? "overnight"
    : rng.weighted<Slot>([
        ["morning", 35],
        ["midday", 25],
        ["afternoon", 25],
        ["evening", 15],
      ]);
  const { departTime, slot } = scheduleDeparture(rng, date, wanted, ctx, blockMin);
  return { ...timingAt(ctx, date, departTime, airborneMin, blockMin), slot: slot === "overnight" ? "evening" : slot };
}

// ── Terminals and gates ─────────────────────────────────────────────────────

interface TerminalInfo {
  terminals: string[];
  byAirline?: Record<string, string>;
}

const TERMINALS: Record<string, TerminalInfo> = {
  JFK: { terminals: ["1", "4", "8"], byAirline: { DL: "4", B6: "5", AA: "8", BA: "8", VS: "4", EK: "4", EY: "4", KL: "4", LX: "4", SQ: "4", KE: "1", LH: "1", AF: "1", TK: "1", AZ: "1", JL: "8", CX: "8", QR: "8", IB: "8", AY: "8", NH: "7", EI: "7", SK: "7", TP: "5", AV: "4", LA: "4", CM: "4", AM: "4", QF: "8" } },
  LGA: { terminals: ["B", "C"], byAirline: { DL: "C", AA: "B", UA: "B", WN: "B", B6: "A", AC: "B" } },
  EWR: { terminals: ["A", "B", "C"], byAirline: { UA: "C", DL: "A", AA: "A", B6: "A", AS: "A", LH: "B", BA: "B", SK: "B", TP: "B", EI: "B", LX: "B", LA: "B", AV: "B", EK: "B" } },
  BOS: { terminals: ["A", "B", "C", "E"], byAirline: { DL: "A", B6: "C", AA: "B", UA: "B", AS: "B", WN: "A", AC: "B", BA: "E", VS: "E", AF: "E", KL: "E", LH: "E", LX: "E", EI: "E", TP: "E", AZ: "E", TK: "E", QR: "E", EK: "E", AY: "E", SK: "E", IB: "E", JL: "E", CX: "E", KE: "E", HA: "E" } },
  LAX: { terminals: ["1", "2", "3", "4", "5", "6", "7", "B"], byAirline: { DL: "3", UA: "7", AA: "4", AS: "6", WN: "1", B6: "5", HA: "5", AC: "6", BA: "B", VS: "B", AF: "B", KL: "B", LH: "B", LX: "B", IB: "B", EK: "B", QR: "B", EY: "B", TK: "B", SQ: "B", CX: "B", NH: "B", JL: "B", KE: "B", BR: "B", QF: "B", NZ: "B", LA: "B", AV: "B", AM: "B", CM: "B", ET: "B", PR: "B", VN: "B", CA: "B", AZ: "B", FI: "B", LO: "B", EI: "B", TP: "B", SK: "B", AY: "B", MS: "B", AT: "B", SA: "B", LY: "B" } },
  SFO: { terminals: ["1", "2", "3", "I"], byAirline: { UA: "3", DL: "1", AA: "1", AS: "2", WN: "1", B6: "1", HA: "1", AC: "I", BA: "I", VS: "I", AF: "I", KL: "I", LH: "I", LX: "I", EK: "I", QR: "I", TK: "I", SQ: "I", CX: "I", NH: "I", JL: "I", KE: "I", BR: "I", QF: "I", NZ: "I", CA: "I", PR: "I", VN: "I", EI: "I", TP: "I", SK: "I", AY: "I", AZ: "I", FI: "I", AM: "I", AV: "I", LA: "I", CM: "I", ET: "I" } },
  ORD: { terminals: ["1", "2", "3", "5"], byAirline: { UA: "1", AA: "3", DL: "5", AS: "3", B6: "5", WN: "5", AC: "2", BA: "5", VS: "5", AF: "5", KL: "5", LH: "5", LX: "5", IB: "5", EK: "5", QR: "5", EY: "5", TK: "5", CX: "5", NH: "5", JL: "3", KE: "5", BR: "5", AZ: "5", FI: "5", LO: "5", EI: "5", TP: "5", SK: "5", AY: "5", AM: "5", AV: "5", CM: "5", ET: "5", AT: "5", CA: "5", PR: "5" } },
  ATL: { terminals: ["N", "S", "F"], byAirline: { DL: "S", AA: "N", UA: "N", WN: "N", B6: "N", AS: "N", AC: "F", BA: "F", VS: "F", AF: "F", KL: "F", LH: "F", TK: "F", QR: "F", KE: "F", AM: "F", AV: "F", LA: "F", CM: "F", ET: "F", AT: "F", SA: "F" } },
  MIA: { terminals: ["D", "E", "H", "J"], byAirline: { AA: "D", DL: "H", UA: "E", B6: "E", AS: "E", WN: "H", AC: "J", BA: "J", VS: "J", AF: "J", KL: "J", LH: "J", LX: "J", IB: "J", EK: "J", QR: "J", TK: "J", TP: "J", AZ: "J", AM: "J", AV: "J", LA: "J", CM: "J", AR: "J", EI: "E", SK: "J", AY: "J", LO: "J" } },
  DFW: { terminals: ["A", "B", "C", "D", "E"], byAirline: { AA: "A", DL: "E", UA: "E", WN: "E", B6: "E", AS: "E", AC: "D", BA: "D", AF: "D", KL: "D", LH: "D", IB: "D", EK: "D", QR: "D", TK: "D", JL: "D", KE: "D", CX: "D", QF: "D", AM: "D", AV: "D", LA: "D", CM: "D", FI: "D", AY: "D" } },
  DEN: { terminals: ["A", "B", "C"], byAirline: { UA: "B", WN: "C", DL: "A", AA: "A", AS: "A", B6: "A", AC: "A", BA: "A", LH: "A", LX: "A", AF: "A", KL: "A", TK: "A", AM: "A", EI: "A", FI: "A", LA: "A" } },
  SEA: { terminals: ["A", "B", "C", "D", "N", "S"], byAirline: { AS: "N", DL: "S", UA: "A", AA: "D", WN: "B", B6: "D", HA: "S", AC: "S", BA: "S", VS: "S", AF: "S", KL: "S", LH: "S", EK: "S", QR: "S", TK: "S", SQ: "S", NH: "S", JL: "S", KE: "S", BR: "S", CA: "S", PR: "S", EI: "S", FI: "S", AY: "S", AM: "S", AV: "S" } },
  IAH: { terminals: ["A", "B", "C", "D", "E"], byAirline: { UA: "C", DL: "A", AA: "A", WN: "A", AS: "A", B6: "A", AC: "D", BA: "D", AF: "D", KL: "D", LH: "D", EK: "D", QR: "D", TK: "D", SQ: "D", NH: "D", AM: "D", AV: "D", LA: "D", CM: "D" } },
  LHR: { terminals: ["2", "3", "4", "5"], byAirline: { BA: "5", VS: "3", DL: "3", AA: "3", UA: "2", AC: "2", AF: "4", KL: "4", LH: "2", LX: "2", IB: "5", SK: "2", AY: "3", EI: "2", TP: "2", OS: "2", AZ: "4", TK: "2", EK: "3", QR: "4", EY: "4", SQ: "2", CX: "3", NH: "2", JL: "3", KE: "4", BR: "2", TG: "2", MH: "4", QF: "3", NZ: "2", LA: "2", ET: "4", KQ: "4", MS: "2", AT: "4", SA: "2", B6: "2", FI: "2", LO: "2", A3: "2", LY: "4", CA: "2", VN: "4", PR: "4", GA: "4", AV: "2" } },
  CDG: { terminals: ["1", "2A", "2E", "2F"], byAirline: { AF: "2E", DL: "2E", KL: "2F", VS: "2A", AA: "2A", UA: "1", AC: "2A", BA: "2A", LH: "1", LX: "1", IB: "2A", SK: "1", AY: "2E", EI: "1", TP: "1", OS: "1", AZ: "2F", TK: "1", EK: "2A", QR: "1", EY: "1", SQ: "1", CX: "2A", NH: "1", JL: "2E", KE: "2E", BR: "1", TG: "1", MH: "1", QF: "2A", LA: "1", ET: "2A", KQ: "2E", MS: "1", AT: "2F", SA: "2A", VN: "2E", CA: "1" } },
  FRA: { terminals: ["1", "2"], byAirline: { LH: "1", UA: "1", AC: "1", LX: "1", OS: "1", SK: "1", TP: "1", AZ: "1", NH: "1", SQ: "1", TG: "1", ET: "1", MS: "1", SA: "1", DL: "2", AA: "2", BA: "2", AF: "2", KL: "2", IB: "2", EK: "2", QR: "1", EY: "2", TK: "1", CX: "2", JL: "2", KE: "2", BR: "2", QF: "1", AT: "2", LO: "2", A3: "1" } },
  AMS: { terminals: ["1", "2", "3"], byAirline: { KL: "2", DL: "2", AF: "2", UA: "3", AA: "3", BA: "1", LH: "1", LX: "1", EK: "3", QR: "3", TK: "3", SQ: "3", CX: "3", KE: "3", AC: "3", VS: "1" } },
  MUC: { terminals: ["1", "2"], byAirline: { LH: "2", UA: "2", AC: "2", LX: "2", OS: "2", SK: "2", TP: "2", NH: "2", SQ: "2", ET: "2", MS: "2", DL: "1", AA: "1", BA: "1", AF: "1", KL: "1", EK: "1", QR: "1", TK: "1", CX: "1", KE: "1", AZ: "1" } },
  DXB: { terminals: ["1", "3"], byAirline: { EK: "3", QF: "3" } },
  DOH: { terminals: ["1"] },
  AUH: { terminals: ["A"] },
  IST: { terminals: ["1"] },
  SIN: { terminals: ["1", "2", "3", "4"], byAirline: { SQ: "3", EK: "1", QR: "1", BA: "1", UA: "3", DL: "3", LH: "2", AF: "1", KL: "1", CX: "4", KE: "4", NH: "2", JL: "1", TG: "1", MH: "2", QF: "1", NZ: "2", TK: "1", EY: "3", GA: "3", VN: "4", PR: "1", CA: "1", ET: "3", AC: "1", BR: "3" } },
  HKG: { terminals: ["1"] },
  HND: { terminals: ["1", "2", "3"], byAirline: { JL: "1", NH: "2", DL: "3", AA: "3", UA: "3", BA: "3", AF: "3", LH: "3", EK: "3", QR: "3", TK: "3", SQ: "3", CX: "3", KE: "3", BR: "3", TG: "3", QF: "3", AC: "3", HA: "3", CA: "3", VN: "3", PR: "3", GA: "3", MH: "3" } },
  NRT: { terminals: ["1", "2"], byAirline: { NH: "1", UA: "1", DL: "1", SQ: "1", KE: "1", LH: "1", LX: "1", TK: "1", EY: "1", AY: "2", JL: "2", AA: "2", BA: "2", QR: "2", EK: "2", CX: "2", BR: "2", QF: "2", AC: "1", AF: "1", KL: "1", NZ: "1", TG: "1", MH: "2", VN: "1", PR: "2", GA: "1", HA: "2", CA: "1" } },
  ICN: { terminals: ["1", "2"], byAirline: { KE: "2", DL: "2", AF: "2", KL: "2", AA: "1", UA: "1", BA: "1", LH: "1", EK: "1", QR: "1", TK: "1", SQ: "1", CX: "1", NH: "1", JL: "1", BR: "1", TG: "1", MH: "1", QF: "1", AC: "1", CA: "1", VN: "1", PR: "1", GA: "1", HA: "1" } },
  SYD: { terminals: ["1", "2", "3"], byAirline: { QF: "3", NZ: "1", UA: "1", DL: "1", AA: "1", BA: "1", EK: "1", QR: "1", EY: "1", SQ: "1", CX: "1", NH: "1", JL: "1", KE: "1", TG: "1", MH: "1", LA: "1", AC: "1", HA: "1", CA: "1", VN: "1", PR: "1", GA: "1", TK: "1", BR: "1" } },
  YYZ: { terminals: ["1", "3"], byAirline: { AC: "1", UA: "1", LH: "1", LX: "1", OS: "1", SK: "1", TP: "1", NH: "1", SQ: "1", ET: "1", MS: "1", AV: "1", CM: "1", DL: "3", AA: "3", B6: "3", AS: "3", WN: "3", BA: "3", VS: "3", AF: "3", KL: "3", AZ: "3", IB: "3", AY: "3", EI: "3", EK: "3", QR: "3", EY: "3", TK: "3", CX: "3", JL: "3", KE: "3", BR: "3", AM: "3", LA: "3", FI: "3", LO: "3", AT: "3", HA: "3", PR: "3", CA: "3" } },
  MAD: { terminals: ["1", "2", "4"], byAirline: { IB: "4", BA: "4", AA: "4", LA: "4", AV: "4", QR: "4", EK: "4", AY: "4", EI: "4", DL: "1", UA: "1", AC: "1", AF: "2", KL: "2", LH: "2", LX: "2", SK: "2", TP: "2", OS: "2", AZ: "2", TK: "1", AM: "1", AR: "4", ET: "1", MS: "1", AT: "1", A3: "2", LO: "1" } },
  FCO: { terminals: ["1", "3"], byAirline: { AZ: "1", AF: "1", KL: "1", DL: "3", UA: "3", AA: "3", AC: "3", BA: "3", LH: "1", LX: "1", IB: "1", SK: "1", AY: "1", EI: "3", TP: "1", OS: "1", TK: "3", EK: "3", QR: "3", EY: "3", SQ: "3", CX: "3", NH: "3", JL: "3", KE: "3", QF: "3", LA: "3", ET: "3", MS: "3", AT: "3", A3: "1", LO: "1", LY: "3", CA: "3", VN: "3" } },
};

function buildGate(rng: Rng, airport: Airport, airline: AirlineProfile): { terminal: string; gate: string } {
  const info = TERMINALS[airport.code];
  let terminal: string;
  if (info) terminal = info.byAirline?.[airline.code] ?? rng.pick(info.terminals);
  else if (!airport.known) terminal = rng.pick(["1", "A", "B"]);
  else terminal = rng.pick(["1", "2", "A", "B", "C"]);
  const trailing = /([A-Z])$/.exec(terminal);
  const letter = trailing ? trailing[1] : rng.pick(["A", "B", "C", "D"]);
  return { terminal, gate: `${letter}${rng.int(1, 42)}` };
}

// ── Crew ────────────────────────────────────────────────────────────────────

function roundTo(n: number, step: number): number {
  return Math.round(n / step) * step;
}

const EASA_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH",
]);

const REGULATORS: Record<string, string> = {
  US: "FAA",
  GB: "UK CAA",
  CA: "Transport Canada",
  AU: "CASA",
  NZ: "CAA New Zealand",
  SG: "CAAS",
  JP: "JCAB",
  AE: "GCAA",
  IN: "DGCA",
};

/**
 * Who flies the plane, from the rules alone (no names, hours or ratings — that
 * data is private and the crew isn't fixed weeks ahead): two pilots, or relief
 * pilots on long flights so the crew can rest (US Part 117 / EASA FTL), and the
 * rule set the airline's pilots fly under.
 */
function crewFor(airline: AirlineProfile, blockMin: number): CrewInfo {
  const pilots: CrewInfo["pilots"] = blockMin > 12.5 * 60 ? 4 : blockMin > 8.5 * 60 ? 3 : 2;
  const country = airline.country;
  if (country === "US") return { pilots, regime: "faa", regulator: "FAA" };
  if (country === "GB") return { pilots, regime: "easa", regulator: "UK CAA" };
  if (EASA_COUNTRIES.has(country)) return { pilots, regime: "easa", regulator: "EASA" };
  return { pilots, regime: "icao", regulator: REGULATORS[country] ?? "the national aviation authority" };
}

// ── Weather ─────────────────────────────────────────────────────────────────

const CONDITION_LABEL: Record<WeatherCondition, string> = {
  clear: "Clear",
  mostly_clear: "Mostly clear",
  partly_cloudy: "Partly cloudy",
  cloudy: "Cloudy",
  light_rain: "Light rain",
  showers: "Scattered showers",
  fog: "Fog",
  light_snow: "Light snow",
  breezy: "Breezy",
};

function climateOf(airport: Airport) {
  const known = climateFor(airport.code);
  if (known && airport.known) return known;
  const absLat = Math.abs(airport.lat);
  const annual = 29 - 32 * Math.sin(toRad(absLat)) ** 1.6;
  const amp = Math.min(16, 2 + 0.3 * absLat);
  const north = airport.lat >= 0;
  return {
    janC: north ? annual - amp : annual + amp,
    julC: north ? annual + amp : annual - amp,
    rainJanPct: 25,
    rainJulPct: 25,
  };
}

function monthBlend(month: number): number {
  // 0 in January, 1 in July, smooth in between.
  return (1 - Math.cos((2 * Math.PI * (month - 1)) / 12)) / 2;
}

/** Every value but `localTime` and the notes depends only on the rng, the airport, the date and the clock hour. */
function buildWeather(rng: Rng, airport: Airport, moment: "departure" | "arrival", localTime: string, dateIso: string): WeatherReport {
  const { m: month } = parseISODate(dateIso);
  const climate = climateOf(airport);
  const w = monthBlend(month);
  const tempMean = climate.janC + (climate.julC - climate.janC) * w;
  const rainPct = climate.rainJanPct + (climate.rainJulPct - climate.rainJanPct) * w;
  const hour = Number(localTime.slice(0, 2));
  const diurnal = 3 * Math.sin((2 * Math.PI * (hour - 9)) / 24);
  const tempC = Math.round(tempMean + diurnal + rng.float(-3.5, 3.5));
  const tropical = Math.abs(airport.lat) < 23.5;
  const season = seasonFor(month, airport.lat);
  const afternoon = hour >= 12 && hour < 19;
  const earlyMorning = hour >= 4 && hour < 10;
  const desert = rainPct < 8;

  const wet = rainPct / 100;
  let condition: WeatherCondition;
  const roll = rng.next();
  if (roll < wet * 0.9) {
    if (tempC <= 1) condition = "light_snow";
    else if ((tropical || season === "summer") && afternoon) condition = rng.chance(0.75) ? "showers" : "light_rain";
    else condition = rng.chance(0.3) ? "showers" : "light_rain";
  } else if (earlyMorning && rng.chance(desert ? 0.03 : season === "autumn" || season === "winter" ? 0.18 : 0.1)) {
    condition = "fog";
  } else {
    condition = rng.weighted<WeatherCondition>([
      ["clear", 40 * (1 - wet) + 5],
      ["mostly_clear", 30],
      ["partly_cloudy", 25 + 20 * wet],
      ["cloudy", 8 + 45 * wet],
    ]);
  }

  const windKts = rng.weighted<number>([
    [rng.int(3, 8), 50],
    [rng.int(9, 13), 35],
    [rng.int(14, 18), 15],
  ]);
  const windDir = rng.weighted<string>(
    tropical
      ? [["E", 4], ["NE", 3], ["SE", 3], ["N", 1], ["S", 1], ["SW", 1], ["W", 1], ["NW", 1]]
      : [["W", 4], ["SW", 3], ["NW", 3], ["S", 2], ["N", 2], ["NE", 1], ["E", 1], ["SE", 1]],
  );
  const gustKts = windKts >= 12 && rng.chance(0.5) ? windKts + rng.int(5, 10) : null;
  if (windKts >= 15 && (condition === "clear" || condition === "mostly_clear" || condition === "partly_cloudy")) {
    condition = "breezy";
  }

  const visibilityMi =
    condition === "fog" ? rng.int(1, 3)
    : condition === "light_snow" ? rng.int(2, 5)
    : condition === "light_rain" ? rng.int(5, 8)
    : condition === "showers" ? rng.int(5, 9)
    : 10;

  const precipPct =
    condition === "light_rain" || condition === "light_snow" ? rng.int(55, 80)
    : condition === "showers" ? rng.int(45, 70)
    : condition === "cloudy" ? rng.int(20, 40)
    : condition === "partly_cloudy" ? rng.int(10, 20)
    : condition === "fog" ? rng.int(10, 20)
    : rng.int(0, 8);

  const impact: WeatherReport["impact"] =
    condition === "clear" || condition === "mostly_clear" || condition === "partly_cloudy" || condition === "cloudy"
      ? windKts >= 15 ? "minor" : "none"
      : "minor";

  const departure = moment === "departure";
  // Worded for any reader ("the departure", never "your flight"): version C shows these for flights the reader isn't on.
  const notes: Record<WeatherCondition, string> = {
    clear: departure
      ? windKts < 10 ? "Light winds — ideal for takeoff." : "Clear skies with a steady breeze — a smooth, routine takeoff."
      : "Clear skies for the arrival — a straightforward approach.",
    mostly_clear: departure
      ? windKts < 10 ? "Light winds and mostly clear skies — ideal for takeoff." : "Mostly clear with a steady breeze — a routine takeoff."
      : "Mostly clear skies for the arrival — a straightforward approach.",
    partly_cloudy: departure ? "A few clouds — no effect on the departure." : "A few clouds — no effect on the arrival.",
    cloudy: departure
      ? "An overcast layer — a few light bumps are possible while climbing through it, with clear air above."
      : "An overcast layer — a few light bumps are possible on the way down through it.",
    light_rain: departure
      ? "Light rain — routine for pilots; it can add a few minutes of taxi time."
      : "Light rain — routine for pilots. The runway may be wet, so a firm touchdown is normal.",
    showers: "Scattered showers — pilots routinely steer around the heavier cells, which can add a few minutes.",
    fog: departure
      ? "Morning fog — the airport and crew are equipped for low visibility; it can mean a short wait before takeoff."
      : "Fog near the airport — the crew flies the instrument approach, which is routine.",
    light_snow: departure
      ? "Light snow — the airport keeps runways clear, and de-icing before takeoff is routine (it can add 10–20 minutes)."
      : "Light snow — the airport keeps runways clear, and a firm touchdown is normal.",
    breezy: departure
      ? "A steady breeze down the runway — a few gentle nudges after liftoff are normal."
      : "A breezy approach — a few gentle nudges before touchdown are normal.",
  };

  return {
    airportCode: airport.code,
    city: airport.city,
    moment,
    localTime,
    condition,
    label: condition === "fog" && earlyMorning ? "Morning fog" : CONDITION_LABEL[condition],
    tempC,
    tempF: Math.round((tempC * 9) / 5 + 32),
    windKts,
    windDir,
    gustKts,
    visibilityMi,
    precipPct,
    impact,
    impactNote: notes[condition],
  };
}

type FlightWeather = Flight["weather"];

/** The weather at an airport in one clock hour of one day: the same for every flight then, whatever its prefs. */
function weatherAt(airport: Airport, moment: "departure" | "arrival", localTime: string, dateIso: string): WeatherReport {
  return buildWeather(createRng(`wx|${airport.code}|${dateIso}|${localTime.slice(0, 2)}`), airport, moment, localTime, dateIso);
}

function weatherFor(ctx: RouteContext, timing: Timing, date: string): FlightWeather {
  return {
    origin: weatherAt(ctx.origin, "departure", timing.departTime, date),
    destination: weatherAt(ctx.destination, "arrival", timing.arriveTime, timing.arriveDate),
  };
}

// ── Turbulence ──────────────────────────────────────────────────────────────

interface PhaseBounds {
  phase: FlightPhase;
  startMin: number;
  endMin: number;
}

function phaseBoundsFor(rng: Rng, airborneMin: number): PhaseBounds[] {
  const landingLen = airborneMin < 60 ? 4 : rng.int(4, 5);
  let descentLen = rng.int(25, 35);
  let climbLen = rng.int(16, 23);
  if (airborneMin < 90) {
    descentLen = Math.min(descentLen, Math.round(airborneMin * 0.32));
    climbLen = Math.min(climbLen, Math.round(airborneMin * 0.28));
  }
  const takeoffEnd = 2;
  const climbEnd = takeoffEnd + climbLen;
  const landingStart = airborneMin - landingLen;
  let descentStart = landingStart - descentLen;
  if (descentStart - climbEnd < 5) descentStart = Math.min(climbEnd + 5, landingStart - 2);
  return [
    { phase: "takeoff", startMin: 0, endMin: takeoffEnd },
    { phase: "climb", startMin: takeoffEnd, endMin: climbEnd },
    { phase: "cruise", startMin: climbEnd, endMin: descentStart },
    { phase: "descent", startMin: descentStart, endMin: landingStart },
    { phase: "landing", startMin: landingStart, endMin: airborneMin },
  ];
}

function phaseAt(bounds: PhaseBounds[], minute: number, airborneMin: number): FlightPhase {
  if (minute >= airborneMin) return "landing";
  for (const b of bounds) if (minute >= b.startMin && minute < b.endMin) return b.phase;
  return "landing";
}

/** Multiples of 5 inside [startMin, endMin). */
function gridFor(b: PhaseBounds): { start: number; end: number } {
  const start = Math.ceil(b.startMin / 5) * 5;
  let end = Math.floor((b.endMin - 1) / 5) * 5;
  if (end < start) end = start;
  return { start, end };
}

interface Cause {
  text: string;
  /** Where it fits in a phase note: "while climbing through clouds". */
  tag: string;
  /** Short location for the summary: "over the Rockies". */
  where: string;
  weight: number;
  /** Preferred position along the flight (0–1) for mountain crossings. */
  frac?: number;
  /** Descent causes: how many minutes before landing they plausibly happen [min, max]. */
  beforeLanding?: [number, number];
  /** Heat-driven ("afternoon heating") clouds or rising air: scaled by the time-of-day model. */
  convective?: boolean;
}

/**
 * Time-of-day and body-type knobs for options away from the reference flight.
 * NEUTRAL is the base model (reference flights, and options sharing their air);
 * there only `wide` changes, and only values, never draws.
 *
 * The causality is real: in summer (and on tropical routes) a morning departure
 * gets fewer and shorter bump windows, a lower chance of a moderate one, a calmer
 * baseline and far fewer heat-driven clouds; an evening one the reverse (warmth
 * from the day still building clouds). Outside summer the window the route
 * history calls smoothest gets a mild edge. Wide-bodies feel bumps a little less.
 */
interface TodModel {
  /** Multipliers on the 0/1/2/3-window count weights. */
  countScale: readonly [number, number, number, number];
  moderateChance: number;
  baseShift: number;
  convectiveScale: number;
  /** Summer evenings: clouds built up by the day's warmth. */
  eveningBuild: boolean;
  wide: boolean;
}

const NEUTRAL_TOD: TodModel = { countScale: [1, 1, 1, 1], moderateChance: 0.2, baseShift: 0, convectiveScale: 1, eveningBuild: false, wide: false };

function todModelFor(ctx: RouteContext, window: DepartWindow, bestSlot: Slot, wide: boolean): TodModel {
  const favoured: TodModel = { countScale: [1.5, 1.1, 0.8, 0.6], moderateChance: 0.13, baseShift: -0.05, convectiveScale: 0.4, eveningBuild: false, wide };
  const warm = ctx.season === "summer" || ctx.tropical;
  let m: TodModel;
  if (bestSlot === "overnight") {
    // Long eastbound overnight routes: the evening bank is the smooth one.
    m = window === "evening" ? favoured : { ...NEUTRAL_TOD, countScale: [0.9, 1, 1.05, 1.15], moderateChance: 0.22, baseShift: 0.02, wide };
  } else if (warm) {
    if (window === "morning") m = favoured;
    else if (window === "afternoon") m = { countScale: [0.9, 1, 1.05, 1.15], moderateChance: 0.22, baseShift: 0.02, convectiveScale: 1, eveningBuild: false, wide };
    else m = { countScale: [0.8, 0.95, 1.15, 1.3], moderateChance: 0.25, baseShift: 0.04, convectiveScale: 1.2, eveningBuild: ctx.season === "summer" && !ctx.oceanic, wide };
  } else {
    const best: DepartWindow = bestSlot === "morning" ? "morning" : "evening";
    m = window === best
      ? { countScale: [1.3, 1.05, 0.9, 0.75], moderateChance: 0.16, baseShift: -0.03, convectiveScale: 0.7, eveningBuild: false, wide }
      : { countScale: [0.95, 1, 1.02, 1.08], moderateChance: 0.21, baseShift: 0.01, convectiveScale: 1, eveningBuild: false, wide };
  }
  if (wide) m = { ...m, moderateChance: m.moderateChance * 0.75 };
  return m;
}

interface WindowDraft {
  phase: FlightPhase;
  cause: Cause;
  intensity: "light" | "moderate";
  startMin: number;
  durationMin: number;
}

function causesFor(phase: FlightPhase, ctx: RouteContext, timing: Timing, wx: { origin: WeatherReport; destination: WeatherReport }, tod: TodModel): Cause[] {
  return rawCausesFor(phase, ctx, timing, wx, tod).map((c) => (c.convective && tod.convectiveScale !== 1 ? { ...c, weight: c.weight * tod.convectiveScale } : c));
}

function rawCausesFor(phase: FlightPhase, ctx: RouteContext, timing: Timing, wx: { origin: WeatherReport; destination: WeatherReport }, tod: TodModel): Cause[] {
  const summer = ctx.season === "summer";
  const winter = ctx.season === "winter";
  const departAfternoon = timing.departHour >= 11.5 && timing.departHour < 18;
  const arriveAfternoon = timing.arriveHour >= 12.5 && timing.arriveHour < 19.5;
  const o = wx.origin.condition;
  const d = wx.destination.condition;
  const originCloudy = o === "cloudy" || o === "light_rain" || o === "showers" || o === "light_snow";
  const destCloudy = d === "cloudy" || d === "light_rain" || d === "showers" || d === "light_snow";
  // The weather card for the same airport says "Clear": never blame clouds there.
  const clearOrigin = o === "clear" || o === "mostly_clear" || o === "breezy";
  const clearDest = d === "clear" || d === "mostly_clear" || d === "breezy";

  if (phase === "climb") {
    const list: Cause[] = [
      { text: "Climbing through a layer of fair-weather clouds.", tag: "while climbing through a cloud layer", where: "during the climb", weight: originCloudy ? 6 : clearOrigin ? 0 : 3 },
      { text: "Passing through a thin cloud layer on the way up — the air above it is usually smooth.", tag: "while climbing through a thin cloud layer", where: "during the climb", weight: clearOrigin ? 0 : 2 },
      { text: "Wind shifting with altitude in the first few thousand feet.", tag: "as the wind shifts with altitude", where: "during the climb", weight: clearOrigin ? 3 : 1.5 },
    ];
    if (summer && departAfternoon && !ctx.oceanic)
      list.push({ text: "Warm air rising from the ground on a sunny afternoon.", tag: "in the warm afternoon air", where: "during the climb", weight: 4, convective: true });
    if (tod.eveningBuild)
      list.push({ text: "Warm air still rising from the ground after a hot day.", tag: "in the warm evening air", where: "during the climb", weight: 3, convective: true });
    if (wx.origin.windKts >= 12)
      list.push({ text: `A ${wx.origin.windKts >= 15 ? "brisk" : "steady"} breeze over the ground near ${ctx.origin.city}.`, tag: "in the breeze near the airport", where: "just after takeoff", weight: 3 });
    if (ctx.originRange)
      list.push({ text: `Air flowing over ${ctx.originRange.name} just after takeoff.`, tag: `over ${ctx.originRange.short}`, where: `over ${ctx.originRange.short}`, weight: 3 });
    return list;
  }

  if (phase === "cruise") {
    const jetWeight =
      (winter ? 3 : ctx.season === "summer" ? 0.7 : 1.5) *
      (ctx.ewStrength > 0.5 ? 2 : 1) *
      (Math.abs(ctx.midLat) >= 25 && Math.abs(ctx.midLat) <= 65 ? 1 : 0.3);
    const list: Cause[] = [
      { text: "The jet stream — a fast river of air at cruising altitude.", tag: "near the jet stream", where: "in the jet stream", weight: jetWeight },
      { text: "Two air masses meeting along the route.", tag: "where two air masses meet", where: "mid-flight", weight: 1.2 },
      { text: "A patch of uneven air at cruising altitude — the pilots may change altitude to find smoother air.", tag: "at cruising altitude", where: "mid-flight", weight: 1 },
    ];
    for (const c of ctx.crossings) {
      list.push({ text: `Air flowing over ${c.range.name}.`, tag: `over ${c.range.name}`, where: `over ${c.range.short}`, weight: c.range.short === "the Rockies" ? 3.5 : 2.5, frac: c.frac });
    }
    if (ctx.tropical) list.push({ text: "Warm, moist air building clouds over the sea and coast.", tag: "near tropical clouds", where: "mid-flight", weight: departAfternoon ? 3.5 : 2.5, convective: true });
    if (summer && departAfternoon && !ctx.oceanic) list.push({ text: "Warm air rising over the land on a sunny afternoon.", tag: "over sun-warmed land", where: "mid-flight", weight: 2.5, convective: true });
    if (tod.eveningBuild) list.push({ text: "Clouds built up by the day's warmth, still settling along the route.", tag: "near clouds left from the day's warmth", where: "mid-flight", weight: 2.5, convective: true });
    // Coastal mixing happens near the coastal endpoint, not mid-continent.
    const coastalOrigin = COASTAL.has(ctx.origin.code);
    const coastalDest = COASTAL.has(ctx.destination.code);
    if (coastalOrigin || coastalDest) {
      const frac = coastalOrigin && coastalDest ? (ctx.eastbound ? 0.82 : 0.18) : coastalOrigin ? 0.18 : 0.82;
      list.push({ text: "Air mixing along the coastline, where sea and land breezes meet.", tag: "along the coast", where: "along the coast", weight: 0.8, frac });
    }
    return list;
  }

  // descent
  const list: Cause[] = [
    { text: "Descending through a layer of clouds.", tag: "on the way down through the clouds", where: "during descent", weight: destCloudy ? 5 : clearDest ? 0 : 3, beforeLanding: [8, 24] },
    { text: "A breezy approach — wind near the ground.", tag: "in the wind near the ground", where: "on the approach", weight: wx.destination.windKts >= 12 ? 5 : 2, beforeLanding: [5, 16] },
    { text: "Wind shifting as the plane slows and descends.", tag: "as the wind shifts on the way down", where: "during descent", weight: clearDest ? 3 : 1.5, beforeLanding: [6, 20] },
  ];
  if (summer && arriveAfternoon && !ctx.tropical && !clearDest) list.push({ text: `Afternoon heating clouds near ${ctx.destination.city}.`, tag: "near afternoon clouds", where: "during descent", weight: 3, beforeLanding: [8, 26], convective: true });
  if (COASTAL.has(ctx.destination.code)) list.push({ text: "A sea breeze near the coast.", tag: "in the sea breeze near the coast", where: "during descent", weight: 2, beforeLanding: [5, 16] });
  if (ctx.destRange) list.push({ text: `Air flowing over ${ctx.destRange.name} on the way into ${ctx.destination.city}.`, tag: `over ${ctx.destRange.short}`, where: `over ${ctx.destRange.short}`, weight: 3.5, beforeLanding: [12, 34] });
  if (ctx.tropical && arriveAfternoon && (d === "showers" || d === "light_rain")) list.push({ text: `Afternoon showers building near ${ctx.destination.city}.`, tag: "near afternoon showers", where: "during descent", weight: 3, beforeLanding: [8, 22], convective: true });
  return list;
}

function placeWindow(
  rng: Rng,
  grid: { start: number; end: number },
  durations: ReadonlyArray<readonly [number, number]>,
  preferred?: number,
): { startMin: number; durationMin: number } | null {
  const options: Array<[number, number]> = [];
  for (const [dur, w] of durations) if (grid.start + dur <= grid.end) options.push([dur, w]);
  if (options.length === 0) return null;
  const durationMin = rng.weighted(options);
  const starts: number[] = [];
  for (let s = grid.start; s + durationMin <= grid.end; s += 5) starts.push(s);
  if (preferred !== undefined) {
    const target = round5(preferred - durationMin / 2);
    const best = starts.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    return { startMin: best, durationMin };
  }
  return { startMin: rng.pick(starts), durationMin };
}

const LIGHT_DURATIONS = [[5, 20], [10, 35], [15, 25], [20, 12], [25, 8]] as const;
const MODERATE_DURATIONS = [[5, 25], [10, 50], [15, 25]] as const;
const SHORT_DURATIONS = [[5, 55], [10, 45]] as const;

function windowLabel(w: WindowDraft, airborneMin: number): { label: string; typicalLabel: string } {
  const cap = w.intensity === "moderate" ? "Moderate" : "Light";
  const verb = w.intensity === "moderate" ? "possible" : "likely";
  const dur = formatOffset(w.durationMin);
  let when: string;
  if (w.phase === "descent") when = `about ${formatOffset(airborneMin - w.startMin)} before landing`;
  else if (w.startMin < 60) when = `about ${formatOffset(w.startMin)} after takeoff`;
  else when = `about ${formatOffset(w.startMin)} into the flight`;
  const label = `${cap} bumps ${verb} ${when}, ${w.phase === "descent" || w.startMin < 60 ? "lasting" : "for"} about ${dur}.`;
  const typical = w.intensity === "moderate" ? "moderate bumps sometimes happen" : "light bumps are common";
  const typicalLabel = `On flights like this one, ${typical} ${when}, for about ${dur}.`;
  return { label, typicalLabel };
}

function minutesWord(min: number): string {
  return min < 60 ? `${min} minutes` : formatOffset(min);
}

function intensityFor(level: number): Intensity {
  if (level < 0.5) return "none";
  if (level < 1.5) return "light";
  return "moderate";
}

interface TurbulenceBuild {
  /** Without the route history, which is a fact about the route and month (routeMonthFor). */
  forecast: Omit<TurbulenceForecast, "history">;
  smoothness: Smoothness;
  drafts: WindowDraft[];
}

/**
 * Bumps drawn from another flight's air (shared draw): keep every cause this
 * flight's own weather and time also support (in its own wording), and tell the
 * rest with one that fits, so a cause never argues with the weather card.
 */
function recause(rng: Rng, drafts: WindowDraft[], ctx: RouteContext, timing: Timing, wx: FlightWeather, tod: TodModel): void {
  for (const d of drafts) {
    const own = causesFor(d.phase, ctx, timing, wx, tod).filter((c) => c.weight > 0);
    const same = own.find((c) => c.tag === d.cause.tag);
    if (same) {
      d.cause = same;
      continue;
    }
    const taken = drafts.filter((o) => o !== d && o.phase === d.phase).map((o) => o.cause.text);
    const pool = own.filter((c) => !taken.includes(c.text));
    d.cause = rng.weighted((pool.length > 0 ? pool : own).map((c): [Cause, number] => [c, c.weight]));
  }
}

function phaseNote(
  phase: FlightPhase,
  intensity: Intensity,
  windows: WindowDraft[],
  wx: { origin: WeatherReport; destination: WeatherReport },
  airborneMin: number,
  cruiseAltitudeFt: number,
  rng: Rng,
): string {
  const w = windows[0];
  switch (phase) {
    case "takeoff": {
      if (wx.origin.windKts >= 15) return "A steady breeze down the runway — a firm, normal takeoff roll and a quick climb away from the ground.";
      return rng.pick([
        "A firm push into your seat, then a smooth lift-off.",
        "A steady roll down the runway and a gentle lift-off are expected.",
        "Light winds at the airport — a smooth, routine takeoff.",
      ]);
    }
    case "climb": {
      if (!w) {
        return rng.pick([
          "A steady climb to cruising altitude is expected.",
          "Smooth climb expected, with clear air above the first few thousand feet.",
          "A smooth, steady climb is expected while the plane settles onto its route.",
        ]);
      }
      return `Light bumps likely about ${formatOffset(w.startMin)} after takeoff ${w.cause.tag}, then smoother air above.`;
    }
    case "cruise": {
      if (!w) {
        return rng.pick([
          "Smooth air expected at cruising altitude.",
          "A calm, steady cruise is expected.",
          `Smooth air expected for the cruise at about ${Math.round(cruiseAltitudeFt / 1000)},000 ft.`,
        ]);
      }
      if (intensity === "moderate") {
        const mw = windows.find((x) => x.intensity === "moderate") ?? w;
        return `Moderate bumps possible ${mw.cause.tag} about ${formatOffset(mw.startMin)} into the flight, for about ${formatOffset(mw.durationMin)} — the seatbelt sign will likely come on.`;
      }
      if (windows.length > 1) {
        if (windows[0].cause.tag === windows[1].cause.tag)
          return `Mostly smooth, with light bumps ${w.cause.tag} about ${formatOffset(windows[0].startMin)} into the flight and again about ${formatOffset(windows[1].startMin)} in.`;
        return `Mostly smooth, with light bumps ${windows[0].cause.tag} and later ${windows[1].cause.tag}.`;
      }
      return `Mostly smooth, with light bumps ${w.cause.tag} about ${formatOffset(w.startMin)} into the flight.`;
    }
    case "descent": {
      if (!w) {
        return rng.pick([
          "A gentle, gradual descent is expected.",
          "A smooth descent is expected, with the engines quiet most of the way down.",
        ]);
      }
      const before = formatOffset(airborneMin - w.startMin);
      if (intensity === "moderate") {
        return `Moderate bumps possible about ${before} before landing ${w.cause.tag}, for about ${formatOffset(w.durationMin)} — the crew will have everyone seated early.`;
      }
      return `Light bumps likely about ${before} before landing ${w.cause.tag}, easing as the plane lines up for landing.`;
    }
    case "landing": {
      if (wx.destination.windKts >= 15 || wx.destination.gustKts) return "A breezy approach — a few gentle nudges near the ground are normal before a firm, controlled touchdown.";
      if (wx.destination.condition === "light_rain" || wx.destination.condition === "showers" || wx.destination.condition === "light_snow")
        return "A normal approach is expected. On a wet runway a firm touchdown is deliberate — it helps the brakes grip.";
      return rng.pick([
        "A normal approach and landing are expected.",
        "A steady final approach and a routine landing are expected.",
      ]);
    }
  }
}

function buildTurbulence(
  rng: Rng,
  ctx: RouteContext,
  timing: Timing,
  wx: FlightWeather,
  cruiseAltitudeFt: number,
  tod: TodModel,
  /**
   * Shared draw: the bumps come from this air (the same day's reference flight, same airborne
   * time, with `rng` its turbulence stream); `timing` and `wx` still word the causes and notes.
   */
  shared?: { timing: Timing; wx: FlightWeather },
): TurbulenceBuild {
  const air = shared ?? { timing, wx };
  const airborneMin = timing.airborneMin;
  const bounds = phaseBoundsFor(rng, airborneMin);
  const byPhase = Object.fromEntries(bounds.map((b) => [b.phase, b])) as Record<FlightPhase, PhaseBounds>;
  const cruiseLen = byPhase.cruise.endMin - byPhase.cruise.startMin;

  // How many bump windows.
  const countWeights: ReadonlyArray<readonly [number, number]> =
    airborneMin < 60 ? [[0, 30], [1, 50], [2, 20]]
    : airborneMin > 480 ? [[0, 8], [1, 37], [2, 38], [3, 17]]
    : [[0, 15], [1, 45], [2, 30], [3, 10]];
  const count = rng.weighted(countWeights.map(([n, w]): [number, number] => [n, w * tod.countScale[n]]));
  const wantModerate = count > 0 && rng.chance(tod.moderateChance);

  const drafts: WindowDraft[] = [];
  const used: Record<FlightPhase, number> = { takeoff: 0, climb: 0, cruise: 0, descent: 0, landing: 0 };
  const cruiseCap = cruiseLen >= 120 ? 2 : 1;
  const climbGrid = gridFor(byPhase.climb);
  const descentGrid = gridFor(byPhase.descent);
  const climbPossible = climbGrid.end - climbGrid.start >= 5;
  const descentPossible = descentGrid.end - descentGrid.start >= 5;

  for (let i = 0; i < count; i++) {
    const options: Array<[FlightPhase, number]> = [];
    if (climbPossible && used.climb < 1) options.push(["climb", 30]);
    if (used.cruise < cruiseCap) options.push(["cruise", clamp(15 + cruiseLen / 8, 15, 60)]);
    if (descentPossible && used.descent < 1) options.push(["descent", 35]);
    if (options.length === 0) break;
    const phase = rng.weighted(options);
    const causes = causesFor(phase, ctx, air.timing, air.wx, tod).filter((c) => c.weight > 0);
    // A second cruise window never repeats the first one's story.
    const prevCruise = phase === "cruise" && used.cruise === 1 ? drafts.find((d) => d.phase === "cruise") : undefined;
    const pool = prevCruise ? causes.filter((c) => c.text !== prevCruise.cause.text) : causes;
    const cause = rng.weighted((pool.length > 0 ? pool : causes).map((c): [Cause, number] => [c, c.weight]));

    let grid = phase === "climb" ? climbGrid : phase === "descent" ? descentGrid : gridFor(byPhase.cruise);
    if (phase === "descent" && cause.beforeLanding) {
      const [minBefore, maxBefore] = cause.beforeLanding;
      const narrowed = {
        start: Math.max(grid.start, Math.ceil((airborneMin - maxBefore) / 5) * 5),
        end: Math.min(grid.end, Math.floor((airborneMin - minBefore) / 5) * 5),
      };
      if (narrowed.end - narrowed.start >= 5) grid = narrowed;
    }
    if (prevCruise) {
      const after = { start: prevCruise.startMin + prevCruise.durationMin + 10, end: grid.end };
      const before = { start: grid.start, end: prevCruise.startMin - 10 };
      grid = after.end - after.start >= before.end - before.start ? after : before;
    }
    const durations = phase === "cruise" ? LIGHT_DURATIONS : SHORT_DURATIONS;
    const preferred = cause.frac !== undefined ? cause.frac * airborneMin : undefined;
    const placed = placeWindow(rng, grid, durations, preferred);
    if (!placed) continue;
    used[phase] += 1;
    drafts.push({ phase, cause, intensity: "light", ...placed });
  }

  if (wantModerate) {
    const eligible = drafts.filter((d) => d.phase === "cruise" || d.phase === "descent");
    if (eligible.length > 0) {
      const pick = rng.pick(eligible);
      pick.intensity = "moderate";
      // Moderate windows are short: 5–15 min in cruise, 5–10 on descent.
      const maxDur = pick.phase === "cruise" ? 15 : 10;
      if (pick.durationMin > maxDur) pick.durationMin = rng.weighted(pick.phase === "cruise" ? MODERATE_DURATIONS : SHORT_DURATIONS);
    }
  }
  drafts.sort((a, b) => a.startMin - b.startMin);
  if (shared) recause(rng.fork("causes"), drafts, ctx, timing, wx, tod);

  // Per-window peak levels.
  // Wide-bodies: light peaks ×0.92, moderate peaks squeezed into 1.65–1.80.
  const peaks = drafts.map((d) => {
    const p = d.intensity === "moderate" ? rng.float(1.65, 1.9) : rng.float(0.9, 1.3);
    if (!tod.wide) return p;
    return d.intensity === "moderate" ? 1.65 + (p - 1.65) * 0.6 : p * 0.92;
  });

  // Baseline: low and gentle, slightly livelier near the ground.
  const base = rng.float(0.05, 0.35) + tod.baseShift;
  const p1 = rng.float(40, 90);
  const p2 = rng.float(12, 30);
  const ph1 = rng.float(0, Math.PI * 2);
  const ph2 = rng.float(0, Math.PI * 2);
  const baselineAt = (t: number, phase: FlightPhase) => {
    const lowAltitude = phase === "climb" || phase === "descent" ? 0.06 : phase === "takeoff" || phase === "landing" ? 0.04 : 0;
    const v = base + lowAltitude + 0.05 * Math.sin((2 * Math.PI * t) / p1 + ph1) + 0.03 * Math.sin((2 * Math.PI * t) / p2 + ph2) + rng.float(-0.03, 0.03);
    return tod.wide ? clamp(v, 0.02, 0.45) * 0.88 : clamp(v, 0.02, 0.45);
  };

  const points: TurbulencePoint[] = [];
  const minutes: number[] = [];
  for (let t = 0; t < airborneMin; t += 5) minutes.push(t);
  minutes.push(airborneMin);
  for (const t of minutes) {
    const phase = phaseAt(bounds, t, airborneMin);
    let level = baselineAt(t, phase);
    drafts.forEach((d, i) => {
      if (t >= d.startMin && t <= d.startMin + d.durationMin) {
        const mid = d.startMin + d.durationMin / 2;
        const half = Math.max(2.5, d.durationMin / 2);
        const dome = d.intensity === "moderate" ? 1 - 0.04 * ((t - mid) / half) ** 2 : 1 - 0.15 * ((t - mid) / half) ** 2;
        const jitter = d.intensity === "moderate" ? rng.float(0.96, 1.04) : rng.float(0.94, 1.06);
        level = Math.max(level, peaks[i] * dome * jitter);
      }
    });
    points.push({ minute: t, level: Math.round(clamp(level, 0, 2) * 100) / 100, phase });
  }

  // Notes follow this flight's own weather, so they draw from their own stream (a shared draw stays aligned).
  const noteRng = rng.fork("notes");
  const phases: PhaseForecast[] = bounds.map((b) => {
    const inPhase = points.filter((p) => p.phase === b.phase);
    const peak = inPhase.reduce((m, p) => Math.max(m, p.level), 0);
    const intensity = intensityFor(peak);
    const windows = drafts.filter((d) => d.phase === b.phase);
    return { phase: b.phase, startMin: b.startMin, endMin: b.endMin, intensity, note: phaseNote(b.phase, intensity, windows, wx, airborneMin, cruiseAltitudeFt, noteRng) };
  });

  const windows: BumpWindow[] = drafts.map((d) => {
    // Whether the sign goes on is the crew's call on the day; what can be said ahead is that a
    // moderate stretch almost always has it on. (The draw that once decided light stretches is
    // kept, so the rest of the stream — the score below — stays where it was.)
    if (d.intensity === "light") rng.next();
    return {
      phase: d.phase,
      startMin: d.startMin,
      durationMin: d.durationMin,
      intensity: d.intensity,
      ...windowLabel(d, airborneMin),
      cause: d.cause.text,
      seatbeltSign: d.intensity === "moderate",
    };
  });

  const maxIntensity: Intensity = drafts.some((d) => d.intensity === "moderate") ? "moderate" : drafts.length > 0 ? "light" : "none";
  const smoothMinutesPct = Math.round((100 * points.filter((p) => p.level < 0.5).length) / points.length);

  // Score and summary.
  const meanLevel = points.reduce((s, p) => s + p.level, 0) / points.length;
  let raw = 97 - meanLevel * 22;
  for (const d of drafts) raw -= d.intensity === "moderate" ? 10 + d.durationMin * 0.25 : 3 + d.durationMin * 0.12;
  raw += rng.float(-1.5, 1.5);
  const score = Math.round(clamp(raw, 58, 97));
  const label = score >= 88 ? "Very smooth" : score >= 75 ? "Mostly smooth" : "Some bumps expected";
  const summary = summaryFor(score, label, drafts, rng);

  return {
    forecast: { points, phases, windows, maxIntensity, smoothMinutesPct },
    smoothness: { score, label, summary },
    drafts,
  };
}

/** Where light bumps happen, with the preposition built in. */
const PHASE_WHERE: Record<FlightPhase, string> = {
  takeoff: "at takeoff",
  climb: "during the climb",
  cruise: "mid-flight",
  descent: "during descent",
  landing: "at landing",
};

function joinWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function summaryFor(score: number, label: string, drafts: WindowDraft[], rng: Rng): string {
  const lights = drafts.filter((d) => d.intensity === "light");
  const moderate = drafts.find((d) => d.intensity === "moderate");

  if (drafts.length === 0) {
    return score >= 93
      ? rng.pick(["Expect a smooth flight from takeoff to landing.", "Expect a very smooth flight — calm air along the whole route."])
      : "Expect a smooth flight from takeoff to landing.";
  }

  if (!moderate) {
    const where = joinWords([...new Set(lights.map((d) => PHASE_WHERE[d.phase]))]);
    if (label === "Very smooth") return `Expect a very smooth flight, with a few light bumps ${where}.`;
    if (label === "Mostly smooth") return `Expect a mostly smooth flight with light bumps ${where}.`;
    return `Expect some light bumps ${where}, with smooth air in between.`;
  }

  const modPart = `about ${minutesWord(moderate.durationMin)} of moderate bumps ${moderate.cause.where}`;
  if (lights.length === 0) {
    return label === "Some bumps expected"
      ? `Expect ${modPart}, with smooth air for the rest of the flight.`
      : `Mostly smooth, with ${modPart}.`;
  }
  // Don't say "mid-flight" twice when the moderate window is also in the cruise.
  let phases = [...new Set(lights.map((d) => d.phase))];
  const otherPhases = phases.filter((p) => p !== moderate.phase);
  if (otherPhases.length > 0) phases = otherPhases;
  const where = phases.length === 1 && phases[0] === moderate.phase
    ? `lighter bumps at other points in the ${moderate.phase === "cruise" ? "cruise" : "descent"}`
    : `light bumps ${joinWords(phases.map((p) => PHASE_WHERE[p]))}`;
  return label === "Some bumps expected"
    ? `Expect ${modPart}, plus ${where}.`
    : `Mostly smooth, with ${modPart} and ${where}.`;
}

// ── Airline stats ───────────────────────────────────────────────────────────

const PITCH_BY_AIRLINE: Record<string, number> = {
  B6: 32, WN: 31, HA: 31, DL: 31, UA: 30, AA: 30, AS: 31, AC: 31,
  EK: 32, QR: 31, EY: 31, SQ: 32, CX: 31, NH: 31, JL: 31, KE: 32, BR: 32, TG: 31, QF: 31, NZ: 31,
};

/**
 * `rng` draws the airline's on-time rate on this route: seeded by route and airline
 * (`route-stats|ROUTE|CODE`), so every flight of that airline on the route — in the
 * study and in version C — shows the same "last 12 months" figure.
 */
function buildAirlineStats(rng: Rng, airline: AirlineProfile, model: AircraftModel): AirlineStats {
  // Network-wide numbers are stable per airline across every flight.
  const net = createRng(`airline-stats|${airline.code}`);
  const safetyScore = net.int(92, 99);
  const onTimePct = net.int(74, 90);
  const crewRating = net.int(45, 49) / 10;
  const pitchBase = PITCH_BY_AIRLINE[airline.code] ?? (airline.region === "EU" || airline.region === "SA" ? 30 : 31);
  const seatPitchIn = clamp(pitchBase + (model.bodyType === "wide" ? 1 : 0), 30, 33);
  const seatWidthIn = cabinConfigFor(airline.code, model).seatWidthIn;
  const cabinNoiseDb = model.cabinNoiseDb;
  // Relative to other airliners (cruise levels cluster around 80–85 dB(A)): newer designs are quieter.
  const cabinNoise: AirlineStats["cabinNoise"] = cabinNoiseDb < 80 ? "Very quiet" : cabinNoiseDb < 83 ? "Quiet" : "Average";
  const comfortScore = clamp(
    round1(
      6.4 +
        (seatPitchIn - 30) * 0.45 +
        (seatWidthIn - 17) * 0.5 +
        (cabinNoise === "Very quiet" ? 0.5 : cabinNoise === "Quiet" ? 0.25 : 0) +
        airline.amenities.length * 0.1 +
        net.float(-0.2, 0.2),
    ),
    7.2,
    9.3,
  );
  return {
    safetyScore,
    safetyLabel: safetyScore >= 97 ? "Top-tier safety rating" : safetyScore >= 94 ? "Excellent safety rating" : "Very good safety rating",
    onTimePct,
    onTimeRoutePct: clamp(onTimePct + rng.int(-5, 5), 65, 97),
    comfortScore,
    seatPitchIn,
    seatWidthIn,
    cabinNoise,
    cabinNoiseDb,
    amenities: airline.amenities.slice(),
    crewRating,
  };
}

// ── Seat map ────────────────────────────────────────────────────────────────

type SeatKind = "window" | "aisle" | "middle";

function seatKinds(groups: string[][]): Map<string, SeatKind> {
  const kinds = new Map<string, SeatKind>();
  groups.forEach((group, gi) => {
    group.forEach((letter, li) => {
      const isWindow = (gi === 0 && li === 0) || (gi === groups.length - 1 && li === group.length - 1);
      const isAisle = (gi > 0 && li === 0) || (gi < groups.length - 1 && li === group.length - 1);
      kinds.set(letter, isWindow ? "window" : isAisle ? "aisle" : "middle");
    });
  });
  return kinds;
}

/**
 * The seat map: geometry (layout, rows, exits, wing) is the airline's cabin
 * configuration for the model (cabinConfigFor), the same on every flight; `rng`
 * draws only what changes per flight — which seats are unavailable right now —
 * and the recommendations follow from that and the wing rows.
 */
function buildSeatMap(rng: Rng, cabin: CabinConfig): SeatMap {
  const columnGroups = columnGroupsFor(cabin.seatLayout);
  const letters = columnGroups.flat();
  const kinds = seatKinds(columnGroups);
  const rowNumbers = cabin.rowNumbers;
  const rowCount = rowNumbers.length;
  const i0 = cabin.wingFirstIndex;
  const i1 = cabin.wingLastIndex;
  const exitRows = new Set(cabin.exitRows);
  const rows: SeatRow[] = rowNumbers.map((row, i) => ({
    row,
    zone: i < i0 ? "smooth" : i <= i1 ? "smoothest" : "more_motion",
    exit: exitRows.has(row),
  }));

  const target = rng.float(0.55, 0.75);
  const occupied: string[] = [];
  rows.forEach((r, i) => {
    for (const letter of letters) {
      const kind = kinds.get(letter);
      let p = target;
      if (kind === "window") p += 0.04;
      else if (kind === "aisle") p += 0.03;
      else p -= 0.1;
      if (i < rowCount / 3) p += 0.04;
      else if (i > (2 * rowCount) / 3) p -= 0.05;
      if (rng.chance(clamp(p, 0.1, 0.85))) occupied.push(`${r.row}${letter}`);
    }
  });
  const taken = new Set(occupied);

  const kindRank: Record<SeatKind, number> = { window: 0, aisle: 1, middle: 2 };
  const mid = (i0 + i1) / 2;
  const candidates: Array<{ id: string; rank: number; dist: number; row: number; li: number }> = [];
  rows.forEach((r, i) => {
    if (r.zone !== "smoothest") return;
    letters.forEach((letter, li) => {
      const id = `${r.row}${letter}`;
      if (taken.has(id)) return;
      candidates.push({ id, rank: kindRank[kinds.get(letter) ?? "middle"], dist: Math.abs(i - mid), row: r.row, li });
    });
  });
  candidates.sort((a, b) => a.rank - b.rank || a.dist - b.dist || a.row - b.row || a.li - b.li);
  const recommended = candidates.slice(0, 3).map((c) => c.id);
  if (recommended.length < 3) {
    const extra: Array<{ id: string; rank: number; dist: number }> = [];
    rows.forEach((r, i) => {
      if (r.zone === "smoothest") return;
      letters.forEach((letter) => {
        const id = `${r.row}${letter}`;
        if (taken.has(id) || recommended.includes(id)) return;
        extra.push({ id, rank: kindRank[kinds.get(letter) ?? "middle"], dist: Math.abs(i - mid) });
      });
    });
    extra.sort((a, b) => a.dist - b.dist || a.rank - b.rank);
    for (const e of extra) {
      if (recommended.length >= 3) break;
      recommended.push(e.id);
    }
  }

  const wingStartRow = rowNumbers[i0];
  const wingEndRow = rowNumbers[i1];
  const why = `The wings sit near the plane's center of gravity — like the middle of a seesaw, it moves least. Rows ${wingStartRow}–${wingEndRow} are over the wing, so bumps feel gentler there. A window seat over the wing also gives you a steady view of the horizon.`;

  return { columnGroups, rows, wingStartRow, wingEndRow, occupied, recommended, why };
}

// ── Sounds and sensations ───────────────────────────────────────────────────

/**
 * The normal sounds and sensations, in order. Timings are typical for the route
 * (climb and descent lengths), rounded to 5 minutes — never a precise prediction.
 * Cues that depend on the plane name its type ("On Airbus A320-family jets…"), so
 * they stay true to the reader if the airline swaps the aircraft; nothing here
 * depends on this flight's weather or turbulence forecast, which only exist close
 * to departure. Descent cues never come before the descent starts, however short
 * the hop.
 */
function buildSounds(rng: Rng, model: AircraftModel, bounds: PhaseForecast[], airborneMin: number): SoundCue[] {
  const wide = model.bodyType === "wide";
  const a320Family = model.key === "A320neo" || model.key === "A321neo";
  const a220 = model.key === "A220-300";
  // Typical moments on the 5-minute grid: the cruise chime a couple of minutes after the climb, the descent start.
  const cruiseAt = Math.max(5, round5(bounds[1].endMin + 2));
  const descentBefore = Math.max(5, Math.min(round5(airborneMin - bounds[3].startMin), round5(airborneMin) - 5));
  const beforeLanding = (min: number) => `About ${formatOffset(min)} before landing`;
  /** Minutes before landing for a cue that usually comes `typical` minutes out: at least 5 minutes into the descent. */
  const inDescent = (typical: number) => Math.max(5, Math.min(typical, descentBefore - 5));
  const speedbrakeBefore = inDescent(15);
  const flapsBefore = inDescent(10);

  const takeoffRoar = wide
    ? "On wide-body jets, a deep, powerful roar as the big engines reach takeoff power, and a firm push back into your seat. The runway rumbles underneath."
    : a220
      ? "On the Airbus A220, a rising, slightly higher-pitched hum as the engines reach takeoff power, and a firm push back into your seat. The runway rumbles underneath."
      : "A loud, steady roar as the engines reach takeoff power, and a firm push back into your seat. The runway rumbles underneath.";

  const core: SoundCue[] = [
    {
      id: "boarding-chime",
      moment: "boarding",
      when: "While boarding",
      minute: -35,
      sense: "hear",
      title: "Chimes and a few thumps",
      detail: "Soft chimes in the cabin and a few thumps under the floor.",
      why: "The chimes are the crew calling each other. The thumps are bags being loaded into the hold, right under your feet.",
    },
    {
      id: "taxi-start",
      moment: "taxi",
      when: "At pushback",
      minute: -12,
      sense: "hear",
      title: "A rising hum",
      detail: "A low whine that rises to a steady hum as each engine starts. The cabin lights may flicker for a moment.",
      why: "The engines spin up one at a time. The flicker is power switching from the ground unit to the plane's own generators.",
    },
    {
      id: "takeoff-roll",
      moment: "takeoff",
      when: "On the runway",
      minute: -1,
      sense: "both",
      title: "The roar and the push",
      detail: takeoffRoar,
      why: "The engines run at their highest power of the whole flight for about 30–40 seconds. The rumble is the runway surface; it stops the moment the wheels leave the ground.",
    },
    {
      id: "climb-gear",
      moment: "climb",
      when: "About 10 seconds after liftoff",
      minute: 0,
      sense: "both",
      title: "A thunk under the floor",
      detail: "A clunk and a short whir a few seconds after liftoff, then quieter.",
      why: "The landing gear folds up into the plane. The whir is the hydraulic pump; the clunk is the gear doors closing.",
    },
    {
      id: "climb-thrust",
      moment: "climb",
      when: "A minute or two after takeoff",
      minute: 2,
      sense: "both",
      title: "The engines get quieter",
      detail: "A minute or two after takeoff the engine noise drops, and it can feel as if the plane levels off a little. You are still climbing.",
      why: "Pilots reduce power from the takeoff setting to the climb setting — a planned step on every flight. The plane keeps climbing, just more quietly.",
    },
    {
      id: "climb-flaps",
      moment: "climb",
      when: "A few minutes after takeoff",
      minute: 3,
      sense: "both",
      title: "A whir and a slight settling",
      detail: "A quiet whir from the wings and a brief feeling of settling.",
      why: "The flaps retract as the plane picks up speed. They help at slow speeds and aren't needed once you're going faster.",
    },
    {
      id: "climb-ears",
      moment: "climb",
      when: "During the climb",
      minute: 8,
      sense: "feel",
      title: "Ears popping",
      detail: "Pressure in your ears as the plane climbs.",
      why: "Cabin pressure changes gradually on the way up. Swallowing, yawning or chewing gum helps your ears equalize.",
    },
    {
      id: "cruise-chime",
      moment: "cruise",
      when: `About ${formatOffset(cruiseAt)} after takeoff`,
      minute: cruiseAt,
      sense: "hear",
      title: "A chime, and the hum settles",
      detail: "A chime as the seatbelt sign goes off, then a steady, even hum for the rest of the cruise.",
      why: "The plane has reached cruising altitude. The engines settle at a lower, constant power, which is why the cabin gets noticeably calmer.",
    },
    {
      id: "descent-start",
      moment: "descent",
      when: beforeLanding(descentBefore),
      minute: airborneMin - descentBefore,
      sense: "both",
      title: "The engines go quiet and the nose tips down",
      detail: "Engine noise drops and you may feel a slight downhill tilt.",
      why: "Pilots begin the descent at low power — usually 25–40 minutes before landing on longer flights, sooner on short hops. Gliding down gently is the normal, efficient way to arrive.",
    },
    {
      id: "approach-gear",
      moment: "descent",
      when: "A few minutes before landing",
      minute: airborneMin - 4,
      sense: "both",
      title: "A thud and more wind noise",
      detail: "A thump under the floor, and the wind noise grows a few minutes before landing.",
      why: "The landing gear comes down and locks into place. The extra noise is air flowing around the wheels.",
    },
    {
      id: "landing-touchdown",
      moment: "landing",
      when: "At touchdown",
      minute: airborneMin,
      sense: "feel",
      title: "A firm touchdown",
      detail: "A solid bump as the main wheels touch, then the nose settles.",
      why: "A firm landing is often deliberate: it plants the wheels so the brakes grip, especially on shorter or wet runways. It's the sign of a well-controlled landing.",
    },
    {
      id: "landing-reverse",
      moment: "landing",
      when: "Right after touchdown",
      minute: airborneMin + 1,
      sense: "both",
      title: "A loud roar after touchdown",
      detail: "The engines get loud again for a few seconds and you lean forward in your seat.",
      why: "Reverse thrust redirects engine air forward to help slow the plane. It's loud by design and stops within seconds.",
    },
  ];

  const optional: SoundCue[] = [];
  if (a320Family) {
    optional.push({
      id: "taxi-ptu",
      moment: "taxi",
      when: "During taxi",
      minute: -9,
      sense: "hear",
      title: "A barking dog sound",
      detail: "On Airbus A320-family jets you may hear a rhythmic 'woof-woof' from under the floor during taxi, and again after landing.",
      why: "A pump that balances pressure between the plane's two hydraulic systems. It's a well-known A320-family sound and completely normal.",
    });
  }
  // Light bumps can come on any flight; the cue says what they feel like, not whether this flight will have them.
  optional.push({
    id: "cruise-bumps",
    moment: "cruise",
    when: "If bumps come",
    minute: null,
    sense: "feel",
    title: "Light bumps",
    detail: "A few nudges and gentle sways, like a car on a country road.",
    why: "Light turbulence is the plane riding small ripples in the air. The wings are built to flex with them, and the autopilot keeps the plane steady.",
  });
  const pool: SoundCue[] = [
    {
      id: "boarding-air",
      moment: "boarding",
      when: "While boarding",
      minute: -30,
      sense: "feel",
      title: "Cool air from the vents",
      detail: "A steady rush of air and a slightly cool breeze from overhead.",
      why: "The air conditioning runs from a small engine in the tail (or a ground unit) until the main engines start.",
    },
    {
      id: "climb-turn",
      moment: "climb",
      when: "A few minutes after takeoff",
      minute: 4,
      sense: "feel",
      title: "A gentle turn",
      detail: "The horizon tilts for a few seconds as the plane banks after takeoff.",
      why: "The plane turns toward its route soon after leaving the airport. Banking is as normal as a car turning a corner.",
    },
    {
      id: "descent-speedbrake",
      moment: "descent",
      when: beforeLanding(speedbrakeBefore),
      minute: airborneMin - speedbrakeBefore,
      sense: "both",
      title: "A low rumble and a slight shudder",
      detail: "A rumble from the wings for a few seconds, with a mild vibration.",
      why: "Panels on top of the wings lift to slow the plane down — like gently tapping the brakes. The rumble stops as soon as they fold back.",
    },
    {
      id: "approach-flaps",
      moment: "descent",
      when: beforeLanding(flapsBefore),
      minute: airborneMin - flapsBefore,
      sense: "hear",
      title: "Whirring from the wings",
      detail: "A series of whirs as the plane slows, and the wings look bigger from a window seat.",
      why: "The flaps extend in stages so the plane can fly slowly and smoothly for landing.",
    },
    {
      id: "descent-ears",
      moment: "descent",
      when: "During the descent",
      minute: airborneMin - descentBefore + 1,
      sense: "feel",
      title: "Ears popping again",
      detail: "Pressure in your ears as the cabin adjusts for landing.",
      why: "Cabin pressure rises slowly on the way down. Swallowing or yawning helps.",
    },
    {
      id: "approach-power",
      moment: "descent",
      when: "In the last few minutes",
      minute: airborneMin - 3,
      sense: "hear",
      title: "Small engine power changes",
      detail: "The engines rise and fall slightly, several times.",
      why: "Pilots make small power adjustments to stay on the ideal approach path — like a driver feathering the gas pedal.",
    },
  ];
  const extraCount = clamp(rng.int(0, 2) + (14 - core.length - optional.length - 2), 0, 14 - core.length - optional.length);
  const extras = rng.shuffle(pool).slice(0, extraCount);

  const all = [...core, ...optional, ...extras];
  const order = (c: SoundCue) => (c.minute === null ? cruiseAt + 1 : c.minute);
  all.sort((a, b) => order(a) - order(b) || a.id.localeCompare(b.id));
  return all;
}

/** The sound cues for a built flight: the plane and the typical length of its climb and descent. */
function soundsFor(rng: Rng, model: AircraftModel, turbulence: TurbulenceBuild, airborneMin: number): SoundCue[] {
  return buildSounds(rng, model, turbulence.forecast.phases, airborneMin);
}

/** The airline's fleet, limited to narrow-bodies at LGA / DCA (every carrier serving them has some). */
function fleetFor(airline: AirlineProfile, ctx: RouteContext): readonly string[] {
  if (!ctx.narrowOnly) return airline.fleet;
  const narrow = airline.fleet.filter((k) => getAircraftModel(k)?.bodyType === "narrow");
  return narrow.length > 0 ? narrow : airline.fleet;
}

/** Wide-bodies in the airline's fleet that can fly the route (the longest-legged ones beyond every range). */
function wideModelsFor(airline: AirlineProfile, ctx: RouteContext): AircraftModel[] {
  if (ctx.narrowOnly) return [];
  const wides = airline.fleet.map((k) => getAircraftModel(k)).filter((m): m is AircraftModel => Boolean(m && m.bodyType === "wide"));
  const inRange = wides.filter((m) => m.rangeMi >= ctx.distanceMi);
  if (inRange.length > 0 || wides.length === 0) return inRange;
  const longest = Math.max(...wides.map((m) => m.rangeMi));
  return wides.filter((m) => m.rangeMi === longest);
}

/**
 * About how many nonstop flights a day the route sees — the market sizes version C's timetables
 * draw from (search.ts: busy 8–14 with hub carriers at both ends, ordinary 4–8, long-haul 2–5), by
 * who flies it. 0 when nobody flies it nonstop. A route fact, the same on every date.
 */
function typicalDailyNonstops(ctx: RouteContext): number {
  const carriers = nonstopCarriers(ctx.origin, ctx.destination, ctx.narrowOnly);
  if (carriers.length === 0) return 0;
  const needsWide = !ctx.narrowOnly && (ctx.oceanic || ctx.distanceMi >= 2800);
  const wide = needsWide ? carriers.filter(([a]) => wideModelsFor(a, ctx).length > 0) : [];
  const flying = wide.length > 0 ? wide : carriers;
  const hubAt = (code: string) => flying.some(([a]) => a.hubs.includes(code));
  const hubs = flying.filter(([a]) => a.hubs.includes(ctx.origin.code) || a.hubs.includes(ctx.destination.code)).length;
  if (ctx.oceanic || ctx.distanceMi > 3000 || (!ctx.domestic && ctx.distanceMi > 2600)) return clamp(hubs + 0.5, 2, 5);
  return hubAt(ctx.origin.code) && hubAt(ctx.destination.code) ? clamp(7 + 2 * hubs, 8, 14) : clamp(4 + hubs, 4, 8);
}

/** Years of turbulence records a route history covers (2022–2025). */
const HISTORY_YEARS = 4;

// ── Assemble ────────────────────────────────────────────────────────────────

interface Core {
  flight: Omit<Flight, "alternatives" | "prefs">;
  ctx: RouteContext;
  airline: AirlineProfile;
  bestSlot: Slot;
  /** Bumps drawn from the same day's reference air: the reference itself, or an option within an hour of it. */
  sharedAir: boolean;
}

/** Options leaving within this many minutes of the same day's reference flight fly in its air. */
const SHARED_AIR_MIN = 60;

/** Carrier, flight number and aircraft model (with the aircraft stream, which goes on to build the airframe). */
function chooseCarrier(root: Rng, ctx: RouteContext, prefs: FlightPrefs) {
  const airlineRng = root.fork("airline");
  const candidates = candidateAirlines(ctx.origin, ctx.destination, ctx.distanceMi, ctx.oceanic);
  let airline = airlineRng.weighted(candidates);
  if (prefs.airline) {
    // The participant asked for this carrier: use it even if it doesn't usually fly the market.
    airline = getAirline(prefs.airline) ?? airline;
  } else if (prefs.bodyType === "wide" && wideModelsFor(airline, ctx).length === 0) {
    const withWide = candidates.filter(([a]) => wideModelsFor(a, ctx).length > 0);
    if (withWide.length > 0) airline = airlineRng.weighted(withWide);
  }
  const flightNumber = makeFlightNumber(airlineRng, airline, ctx.longHaul);

  const aircraftRng = root.fork("aircraft");
  let model = chooseAircraftModel(aircraftRng, fleetFor(airline, ctx), ctx.distanceMi, ctx.oceanic);
  if (prefs.bodyType === "wide" && model.bodyType !== "wide") {
    const wides = wideModelsFor(airline, ctx);
    if (wides.length > 0) model = aircraftRng.pick(wides);
  }
  return { airline, flightNumber, model, aircraftRng };
}

/** The bumps buildCore(norm, {}) draws for a reference flight, without the rest of the flight. */
function referenceBumps(norm: FlightInput): TurbulenceBuild {
  const root = createRng(flightSeed(norm));
  const ctx = buildRoute(norm);
  const timing = buildTiming(root.fork("timing"), ctx, norm.date);
  const { model } = chooseCarrier(root, ctx, {});
  const tod = { ...NEUTRAL_TOD, wide: model.bodyType === "wide" };
  return buildTurbulence(root.fork("turbulence"), ctx, timing, weatherFor(ctx, timing, norm.date), model.cruiseAltitudeFt, tod);
}

interface RouteMonth {
  bestSlot: Slot;
  history: RouteHistory;
}

/** Route history by route and month: every flight it covers (any year, day or prefs) shows the same facts. */
const ROUTE_MONTHS = new Map<string, RouteMonth>();

/** The route as flown, for facts kept by route: known airports by code (a long LaGuardia trip is the JFK route), free text as typed. */
function flownRoute(norm: FlightInput, ctx: RouteContext): { origin: string; destination: string } {
  return {
    origin: ctx.origin.known ? ctx.origin.code : norm.origin,
    destination: ctx.destination.known ? ctx.destination.code : norm.destination,
  };
}

/**
 * The numbers are read off one anchor flight on the route (the reference flight on the
 * 15th of that month in 2025), so they sit where the generator's flights do. The smoothest
 * window is the one todModelFor favours; long eastbound routes are flown overnight.
 */
function routeMonthFor(norm: FlightInput, ctx: RouteContext): RouteMonth {
  const { origin, destination } = flownRoute(norm, ctx);
  const key = `${origin}|${destination}|${ctx.month}`;
  const hit = ROUTE_MONTHS.get(key);
  if (hit) return hit;

  const rng = createRng(`history|${key}`);
  const anchor = referenceBumps({ origin, destination, date: `2025-${pad2(ctx.month)}-15` });
  const bestSlot: Slot =
    overnightRoute(ctx) ? "overnight"
    : ctx.tropical || ctx.season === "summer" ? "morning"
    : rng.chance(0.7) ? "morning" : "evening";
  const month = monthName(norm.date);
  const bestWindowText: Record<Slot, string> = {
    morning: `Morning departures (6–10 AM) are usually the smoothest on this route in ${month}.`,
    midday: `Midday departures (10 AM–2 PM) are usually the smoothest on this route in ${month}.`,
    afternoon: `Afternoon departures are usually the smoothest on this route in ${month}.`,
    evening: `Early-evening departures (5–8 PM) are usually the smoothest on this route in ${month}, after the afternoon warmth fades.`,
    overnight: `Overnight departures are usually the smoothest on this route in ${month} — the air settles after sunset.`,
  };
  const rank = (d: WindowDraft) => (d.intensity === "moderate" ? 100 : 0) + d.durationMin;
  const strongest = anchor.drafts.reduce<WindowDraft | null>((m, d) => (!m || rank(d) > rank(m) ? d : m), null);
  const typicalBumpyPhase: FlightPhase = strongest
    ? strongest.phase
    : rng.weighted<FlightPhase>(typicalAirborne(ctx) > 180 ? [["cruise", 5], ["descent", 3], ["climb", 2]] : [["descent", 5], ["climb", 4], ["cruise", 1]]);
  // The flights the history covers: the route's daily nonstops over this month of each year of records
  // (a route nobody flies nonstop — the study's example flight — counts flights like it, about two a day).
  const daysInMonth = new Date(Date.UTC(2025, ctx.month, 0)).getUTCDate();
  const covered = Math.max(2, typicalDailyNonstops(ctx)) * daysInMonth * HISTORY_YEARS;
  const value: RouteMonth = {
    bestSlot,
    history: {
      month,
      smoothPct: clamp(Math.round(72 + ((anchor.smoothness.score - 58) * 24) / 39 + rng.int(-3, 3)), 72, 96),
      flightsAnalyzed: roundTo(covered * rng.float(0.85, 1), 10),
      typicalBumpyPhase,
      bestDepartureWindow: bestWindowText[bestSlot],
    },
  };
  if (ROUTE_MONTHS.size >= 256) ROUTE_MONTHS.delete(ROUTE_MONTHS.keys().next().value as string);
  ROUTE_MONTHS.set(key, value);
  return value;
}

/** The same day's reference flight (empty prefs): its timing and weather, the air options near it share. */
const REFERENCE_DAY = new Map<string, { timing: Timing; wx: FlightWeather }>();

function referenceDay(norm: FlightInput, ctx: RouteContext): { timing: Timing; wx: FlightWeather } {
  const seed = flightSeed(norm);
  const hit = REFERENCE_DAY.get(seed);
  if (hit) return hit;
  const timing = buildTiming(createRng(seed).fork("timing"), ctx, norm.date);
  const value = { timing, wx: weatherFor(ctx, timing, norm.date) };
  if (REFERENCE_DAY.size >= 256) REFERENCE_DAY.delete(REFERENCE_DAY.keys().next().value as string);
  REFERENCE_DAY.set(seed, value);
  return value;
}

/** Everything but the alternatives. Never recurses (the shared facts are built without a history). */
function buildCore(norm: FlightInput, prefs: FlightPrefs): Core {
  const seed = flightSeed(norm, prefs);
  const root = createRng(seed);

  const ctx = buildRoute(norm);
  const routeMonth = routeMonthFor(norm, ctx);
  const reference = hasPrefs(prefs) ? referenceDay(norm, ctx) : undefined;
  const timing = buildTiming(root.fork("timing"), ctx, norm.date, prefs.departWindow, reference?.timing.airborneMin);

  const { airline, flightNumber, model, aircraftRng } = chooseCarrier(root, ctx, prefs);
  const aircraft: Aircraft = buildAircraft(aircraftRng, model, airline.code, airline.tailPatterns, ctx.year);

  const gate = buildGate(root.fork("gate"), ctx.origin, airline);
  const crew = crewFor(airline, timing.blockMin);
  const weather = weatherFor(ctx, timing, norm.date);

  // Within an hour of the same day's reference flight the air is the same: the bumps come from
  // its draw, and a wide-body feels them a little less. Further away, the time-of-day model applies.
  const wide = model.bodyType === "wide";
  const sharedAir = !reference || Math.abs(timeToMinutes(timing.departTime) - timeToMinutes(reference.timing.departTime)) <= SHARED_AIR_MIN;
  const turbulence = sharedAir
    ? buildTurbulence((reference ? createRng(flightSeed(norm)) : root).fork("turbulence"), ctx, timing, weather, model.cruiseAltitudeFt, { ...NEUTRAL_TOD, wide }, reference)
    : buildTurbulence(root.fork("turbulence"), ctx, timing, weather, model.cruiseAltitudeFt, todModelFor(ctx, departWindowOf(timing.departTime), routeMonth.bestSlot, wide));
  // The on-time rate on this route is one per airline (the same one version C shows).
  const flown = flownRoute(norm, ctx);
  const airlineStats = buildAirlineStats(createRng(`route-stats|${flown.origin}|${flown.destination}|${airline.code}`), airline, model);
  const seatMap = buildSeatMap(root.fork("seats"), cabinConfigFor(airline.code, model));
  const sounds = soundsFor(root.fork("sounds"), model, turbulence, timing.airborneMin);

  return {
    flight: assembleFlight(hashId(seed), norm, {
      ctx,
      timing,
      airline,
      flightNumber,
      gate,
      aircraft,
      crew,
      turbulence,
      history: routeMonth.history,
      weather,
      airlineStats,
      seatMap,
      sounds,
    }),
    ctx,
    airline,
    bestSlot: routeMonth.bestSlot,
    sharedAir,
  };
}

/** Everything a flight is made of, built facet by facet. */
interface FlightParts {
  ctx: RouteContext;
  timing: Timing;
  airline: AirlineProfile;
  flightNumber: string;
  gate: { terminal: string; gate: string };
  aircraft: Aircraft;
  crew: CrewInfo;
  turbulence: TurbulenceBuild;
  /** The route history (routeMonthFor): a fact about the route and month. */
  history: RouteHistory;
  weather: FlightWeather;
  airlineStats: AirlineStats;
  seatMap: SeatMap;
  sounds: SoundCue[];
}

/** The dashboard's Flight (without alternatives and prefs), in the one field order every flight uses. */
function assembleFlight(id: string, input: FlightInput, p: FlightParts): Omit<Flight, "alternatives" | "prefs"> {
  return {
    id,
    input,
    origin: p.ctx.origin,
    destination: p.ctx.destination,
    airline: toAirline(p.airline),
    flightNumber: p.flightNumber,
    distanceMi: p.ctx.distanceMi,
    airborneMin: p.timing.airborneMin,
    blockMin: p.timing.blockMin,
    departTime: p.timing.departTime,
    arriveTime: p.timing.arriveTime,
    arriveDayOffset: p.timing.arriveDayOffset,
    terminal: p.gate.terminal,
    gate: p.gate.gate,
    aircraft: p.aircraft,
    crew: p.crew,
    turbulence: { ...p.turbulence.forecast, history: { ...p.history } },
    smoothness: p.turbulence.smoothness,
    weather: p.weather,
    airlineStats: p.airlineStats,
    seatMap: p.seatMap,
    sounds: p.sounds,
  };
}

// ── Alternatives ────────────────────────────────────────────────────────────

type AltKind = "window" | "day-before" | "day-after" | "wide" | "airline";

interface AltCandidate {
  kind: AltKind;
  input: FlightInput;
  prefs: FlightPrefs;
}

/**
 * Real options: 4–5 candidate flights, each changing one knob of the parent
 * (another window the same day, the day before, the day after, a wide-body,
 * another carrier), generated in full without alternatives of their own; the
 * 2–3 highest scores are kept. Every summary field comes from that full
 * flight, so generateFlight(alt.input, alt.prefs) shows exactly what the row says.
 */
function buildAlternatives(rng: Rng, norm: FlightInput, prefs: FlightPrefs, parent: Core): AlternativeFlight[] {
  const { ctx, flight } = parent;
  const refWindow = departWindowOf(flight.departTime);
  const bestWindow: DepartWindow = parent.bestSlot === "morning" ? "morning" : "evening";
  const keep = flight.airline.code;
  const parentSeed = flightSeed(norm, prefs);

  const cands: AltCandidate[] = [];
  const add = (kind: AltKind, input: FlightInput, p: FlightPrefs) => cands.push({ kind, input, prefs: normalizePrefs(p) });
  const same = { ...prefs, departWindow: refWindow, airline: keep };

  const otherWindows = DEPART_WINDOWS.filter((w) => w !== refWindow);
  const target = bestWindow !== refWindow ? bestWindow : rng.pick(otherWindows);
  add("window", norm, { ...same, departWindow: target });
  add("day-before", { ...norm, date: addDays(norm.date, -1) }, same);
  add("day-after", { ...norm, date: addDays(norm.date, 1) }, same);
  if (!ctx.narrowOnly && flight.aircraft.bodyType === "narrow" && !prefs.bodyType) {
    const ownWide = wideModelsFor(parent.airline, ctx).length > 0;
    if (ownWide) add("wide", norm, { ...same, bodyType: "wide" });
    else if (!prefs.airline) add("wide", norm, { ...prefs, departWindow: refWindow, bodyType: "wide" });
  }
  const others = candidateAirlines(ctx.origin, ctx.destination, ctx.distanceMi, ctx.oceanic).filter(([a]) => a.code !== keep);
  if (others.length > 0) add("airline", norm, { ...same, airline: rng.weighted(others).code });

  const score = flight.smoothness.score;
  const windsNotHeat = ctx.season === "winter" || ctx.oceanic;
  const jet = Math.abs(ctx.midLat) >= 25;
  const built = cands
    .filter((c) => flightSeed(c.input, c.prefs) !== parentSeed)
    .map((c) => {
      // Fares are drawn for every candidate in a fixed order, so they never depend on which ones are kept.
      let fare = rng.int(-8, 32) * 5;
      if (c.kind === "wide" || c.kind === "airline") fare += rng.int(0, 4) * 5;
      return { c, core: buildCore(c.input, c.prefs), fare: clamp(fare, -40, 160) };
    })
    .filter(({ c, core }) => core.flight.flightNumber !== flight.flightNumber && (c.kind !== "wide" || core.flight.aircraft.bodyType === "wide"));

  const order: Record<AltKind, number> = { window: 0, "day-before": 1, "day-after": 2, wide: 3, airline: 4 };
  built.sort((a, b) => b.core.flight.smoothness.score - a.core.flight.smoothness.score || order[a.c.kind] - order[b.c.kind]);

  const count = Math.min(rng.int(2, 3), built.length);
  const kept: typeof built = [];
  for (const b of built) {
    if (kept.length >= count) break;
    if (kept.some((k) => k.core.flight.flightNumber === b.core.flight.flightNumber)) continue;
    kept.push(b);
  }

  const parentMin = timeToMinutes(flight.departTime);
  return kept.map(({ c, core, fare }): AlternativeFlight => {
    const f = core.flight;
    const delta = f.smoothness.score - score;
    const sameDay = f.input.date === flight.input.date;
    const near: Nearness = {
      gapMin: sameDay ? Math.abs(timeToMinutes(f.departTime) - parentMin) : Infinity,
      sameAir: sameDay && parent.sharedAir && core.sharedAir,
    };
    return {
      // The id of the flight it opens, so it means the same thing in every list and event.
      id: f.id,
      airline: f.airline,
      flightNumber: f.flightNumber,
      date: f.input.date,
      departTime: f.departTime,
      arriveTime: f.arriveTime,
      arriveDayOffset: f.arriveDayOffset,
      blockMin: f.blockMin,
      aircraft: f.aircraft.fullName,
      bodyType: f.aircraft.bodyType,
      smoothnessScore: f.smoothness.score,
      scoreDelta: delta,
      reason: reasonFor(c, delta, refWindow, bestWindow, windsNotHeat, ctx.season === "summer", jet, near),
      fareDiffUsd: fare,
      input: f.input,
      prefs: c.prefs,
    };
  });
}

/** An option's time relation to the flight it is an option for. */
interface Nearness {
  /** Minutes between the two departures (Infinity on another day). */
  gapMin: number;
  /** Both fly in the same day's reference air, so a score difference can only come from the plane. */
  sameAir: boolean;
}

/**
 * Plain reason derived from what the option changes. Never argues with the
 * route-history tile: only the window history calls smoothest is named as
 * smoother by time of day, and that window is never blamed for bumps. The
 * time of day is credited only more than an hour apart; within the hour the
 * option is "at a similar time", and in the same air only the plane differs.
 */
function reasonFor(
  c: AltCandidate,
  delta: number,
  refWindow: DepartWindow,
  bestWindow: DepartWindow,
  windsNotHeat: boolean,
  summer: boolean,
  jet: boolean,
  near: Nearness,
): string {
  const sign = delta > 0 ? 1 : delta < 0 ? -1 : 0;
  const close = near.gapMin <= SHARED_AIR_MIN;
  const plane = sign > 0 ? "on a larger plane, which feels bumps less" : "on a smaller plane, which feels bumps a little more";
  const path = sign > 0 ? "calmer air is forecast along its flight path" : "a little more wind aloft is forecast along its flight path";
  switch (c.kind) {
    case "day-before":
      return sign > 0 ? "Leaves the day before — a calmer pattern is expected."
        : sign < 0 ? "Leaves the day before — a little more wind aloft is forecast."
        : "Leaves the day before — similar conditions are forecast.";
    case "day-after":
      return sign > 0 ? "Leaves the day after — calmer air is forecast along the route."
        : sign < 0 ? "Leaves the day after — a few more clouds are forecast along the route."
        : "Leaves the day after — similar conditions are forecast.";
    case "wide":
      // Never bumpier in the same air (the parent is a narrow-body), so a lower score is the other time's air.
      return sign > 0 ? "Wide-body jet — larger planes feel bumps less."
        : sign < 0 ? `Wide-body jet — feels bumps less, though ${close ? path : "more wind aloft is forecast at its time"}.`
        : "Wide-body jet — similar conditions, in a larger cabin.";
    case "airline":
      if (sign === 0) return `Another airline — similar conditions ${close ? "at a similar time" : "on the same day"}.`;
      if (near.sameAir) return `Another airline${close ? " at a similar time" : ""} — ${plane}.`;
      if (close) return `Another airline at a similar time — ${path}.`;
      return sign > 0 ? "Another airline — calmer air is forecast at its departure time."
        : "Another airline — a little more wind aloft is forecast at its departure time.";
    case "window": {
      const w = c.prefs.departWindow ?? refWindow;
      const later = DEPART_WINDOWS.indexOf(w) > DEPART_WINDOWS.indexOf(refWindow);
      const shift = later ? "A later" : "An earlier";
      if (close) {
        // Just across a window edge: not a different time of day.
        const slightly = later ? "A slightly later departure" : "A slightly earlier departure";
        return sign === 0 ? `${slightly} — similar conditions are forecast.` : `${slightly} — ${near.sameAir ? plane : path}.`;
      }
      if (sign === 0) return "Similar conditions — a different time on the same route.";
      if (near.sameAir) return `${shift} departure — ${plane}.`;
      if (w === bestWindow) {
        if (sign < 0) return `${shift} departure — a little more wind aloft is forecast at that time.`;
        if (w === "morning") return windsNotHeat ? "Morning departure — winds aloft are usually calmest early in the day." : "Morning departure — before afternoon heating builds clouds.";
        return "Evening departure — the air usually settles after sunset.";
      }
      if (sign > 0) return `${shift} departure — calmer air is forecast at that time.`;
      if (w === "afternoon") {
        if (!windsNotHeat) return "Afternoon departure — more heat-driven clouds along the route.";
        return jet ? "Afternoon departure — crosses the jet stream at a breezier time of day." : "Afternoon departure — a little more wind aloft at that time of day.";
      }
      if (w === "evening") {
        if (summer && !windsNotHeat) return "Evening departure — clouds from the day's warmth are still settling.";
        return jet ? "Evening departure — crosses the jet stream at a breezier time." : "Evening departure — a little more wind aloft is forecast at that time.";
      }
      return "Morning departure — a little more wind aloft is forecast early in the day.";
    }
  }
}

/**
 * Deterministic: the same (normalized) input and prefs always return identical
 * data. Empty prefs (undefined or {}) give the day's reference flight.
 * Alternatives are generated one level deep only.
 */
export function generateFlight(input: FlightInput, prefs?: FlightPrefs): Flight {
  const norm = normalizeInput(input);
  const p = normalizePrefs(prefs);
  const core = buildCore(norm, p);
  const alternatives = buildAlternatives(createRng(flightSeed(norm, p)).fork("alternatives"), norm, p, core);
  return { ...core.flight, alternatives, prefs: p };
}

// ── Scheduled flights (version C) ───────────────────────────────────────────
//
// Version C (docs/VERSION_C.md) lists every nonstop flight on a route and day —
// none where no airline would plausibly fly nonstop (RouteDay.carriers is empty).
// The timetable is search.ts's; these two entry points give it the route's
// facts and build each scheduled flight from the same parts as generateFlight,
// so flights shown side by side never contradict each other: one airborne time
// for the day, the route history by route and month, the weather by airport,
// date and hour, and one bump draw per air block, which a wide-body feels a
// little less (never more). Nothing here changes what generateFlight returns.

/** A carrier that would plausibly fly the route nonstop (nonstopCarriers), with what it can fly there. */
export interface RouteCarrier {
  airline: AirlineProfile;
  /** Selection weight (candidateAirlines' first tier: hubs weighted up). */
  weight: number;
  /** A hub at either end of the route. */
  hub: boolean;
  /** Fleet keys usable on the route (narrow-bodies only at LGA / DCA), for chooseAircraftModel. */
  fleet: readonly string[];
  /** Has a wide-body that can fly the route. */
  wide: boolean;
}

/** One route on one day: the facts every flight on it shares. */
export interface RouteDay {
  /** Normalized input. */
  input: FlightInput;
  /** The route as flown, for seeds: "JFK|LAX" (a long LaGuardia trip is the JFK route; free text as typed). */
  route: string;
  /** Endpoints as flown. */
  origin: Airport;
  destination: Airport;
  distanceMi: number;
  domestic: boolean;
  oceanic: boolean;
  /** Oceanic or longer than 2,600 mi. */
  longHaul: boolean;
  /** LGA / DCA: narrow-body gates only. */
  narrowOnly: boolean;
  eastbound: boolean;
  /** Long eastbound routes are flown overnight: departures in the evening bank. */
  overnight: boolean;
  /** Airborne minutes in the route's typical winds (each day's own time is within ±2%). */
  typicalAirborneMin: number;
  /**
   * The longest airborne time the day's winds give on the route (the top of that ±2%), the same on
   * every date: published block times are planned on it, so no flight is scheduled to land before it can.
   */
  longestAirborneMin: number;
  /** The day's airborne time: the same for every flight that day, and for generateFlight's reference flight on the route as flown. */
  airborneMin: number;
  /**
   * The carriers that would plausibly fly the route nonstop (nonstopCarriers): empty when nobody
   * would — a typed (made-up) airport, a hop within one metro area, a market too small for the
   * distance or outside every carrier's network, or an ultra-long pair no airline flies — and
   * version C then shows no flights.
   */
  carriers: readonly RouteCarrier[];
  /**
   * Arrival of a departure that day at local `departTime`, `blockMin` gate to gate, and whether it
   * lands at a sensible hour: never inside a curfew, nor in the dead of night except at round-the-clock hubs.
   */
  arrival(departTime: string, blockMin: number): { arriveTime: string; arriveDayOffset: number; acceptable: boolean };
}

/** Any valid date: the airports as flown and who flies between them don't depend on it. */
const ROUTE_FACTS_DATE = "2026-01-15";

/**
 * Who would plausibly fly the route nonstop (nonstopCarriers), between the airports as flown: a long
 * LaGuardia trip is the JFK route, and typed text that matches no catalogue airport has nobody. A fact
 * about the route, the same on every date — RouteDay.carriers is this list with what each can fly
 * there. The endpoints are taken as normalizeInput takes them (codes, "City (ABC)", city names).
 */
export function routeNonstopCarriers(origin: string, destination: string): Array<[AirlineProfile, number]> {
  const ctx = buildRoute(normalizeInput({ origin, destination, date: ROUTE_FACTS_DATE }));
  return nonstopCarriers(ctx.origin, ctx.destination, ctx.narrowOnly);
}

const ROUTE_DAYS = new Map<string, RouteDay>();
const ROUTE_DAY_CONTEXT = new WeakMap<RouteDay, RouteContext>();

/** The route's facts on the input's date (cached). Throws only on an invalid date, like normalizeInput. */
export function routeDay(input: FlightInput): RouteDay {
  const norm = normalizeInput(input);
  const key = `${norm.origin}|${norm.destination}|${norm.date}`;
  const hit = ROUTE_DAYS.get(key);
  if (hit) return hit;

  const ctx = buildRoute(norm);
  const flown = flownRoute(norm, ctx);
  const route = `${flown.origin}|${flown.destination}`;
  const day: RouteDay = {
    input: norm,
    route,
    origin: ctx.origin,
    destination: ctx.destination,
    distanceMi: ctx.distanceMi,
    domestic: ctx.domestic,
    oceanic: ctx.oceanic,
    longHaul: ctx.longHaul,
    narrowOnly: ctx.narrowOnly,
    eastbound: ctx.eastbound,
    overnight: overnightRoute(ctx),
    typicalAirborneMin: Math.round(typicalAirborne(ctx)),
    longestAirborneMin: Math.max(30, Math.round(typicalAirborne(ctx) * DAY_WINDS[1])),
    // The day's winds: the first draw of the route's reference timing stream (see buildTiming).
    airborneMin: airborneFor(createRng(`${route}|${norm.date}`).fork("timing"), ctx),
    carriers: nonstopCarriers(ctx.origin, ctx.destination, ctx.narrowOnly).map(([airline, weight]) => ({
      airline,
      weight,
      hub: airline.hubs.includes(ctx.origin.code) || airline.hubs.includes(ctx.destination.code),
      fleet: fleetFor(airline, ctx),
      wide: wideModelsFor(airline, ctx).length > 0,
    })),
    arrival: (departTime, blockMin) => {
      const a = arrivalFor(norm.date, departTime, ctx.origin.tz, blockMin, ctx.destination.tz);
      return { arriveTime: a.arriveTime, arriveDayOffset: a.arriveDayOffset, acceptable: arrivalAcceptable(ctx.destination, a.arriveHour) };
    },
  };
  ROUTE_DAY_CONTEXT.set(day, ctx);
  if (ROUTE_DAYS.size >= 256) ROUTE_DAYS.delete(ROUTE_DAYS.keys().next().value as string);
  ROUTE_DAYS.set(key, day);
  return day;
}

/** What the schedule decides for one flight; everything else is built as for A/B. */
export interface ScheduledFlightSpec {
  /** Flight.id. */
  id: string;
  /** Seed for what is this flight's own: airframe, gate, crew, seats, sounds. */
  seed: string;
  /** IATA code of one of the day's carriers. */
  airline: string;
  /** "DL 1423" */
  flightNumber: string;
  /** Local "HH:MM" on the 5-minute grid. */
  departTime: string;
  /** Model key from the carrier's fleet (RouteCarrier.fleet). */
  aircraft: string;
  /** Gate to gate as published (arrival, crew): at least the day's airborne time plus 15 min of taxi. */
  blockMin: number;
  /**
   * The air block. Flights with the same `airKey` share one bump draw, made for a departure at
   * `airTime` (its time of day and weather): the same body type gets the identical series, and a
   * wide-body the same bumps, felt a little less. Always pass the same `airTime` with an `airKey`.
   */
  airKey: string;
  airTime: string;
}

/** Taxi minutes of an air block's reference departure (it only sets the hour of its arrival weather). */
const AIR_TAXI_MIN = 25;

/**
 * A full flight on a route's day schedule (alternatives [], prefs {}): its own crew, airframe,
 * gate, seats and sounds; the day's airborne time; the weather at its own hours; the bumps of its
 * air block, worded for its own weather and time; the A/B route history.
 */
export function buildScheduledFlight(day: RouteDay, spec: ScheduledFlightSpec): Flight {
  const norm = day.input;
  const ctx = ROUTE_DAY_CONTEXT.get(day) ?? buildRoute(norm);
  const airline = getAirline(spec.airline);
  const model = getAircraftModel(spec.aircraft);
  if (!airline || !model) throw new Error(`Unknown airline or aircraft: ${spec.airline} / ${spec.aircraft}`);
  const routeMonth = routeMonthFor(norm, ctx);
  const root = createRng(spec.seed);

  const timing = timingAt(ctx, norm.date, spec.departTime, day.airborneMin, spec.blockMin);
  const aircraft = buildAircraft(root.fork("aircraft"), model, airline.code, airline.tailPatterns, ctx.year);
  const gate = buildGate(root.fork("gate"), ctx.origin, airline);
  const crew = crewFor(airline, timing.blockMin);
  const weather = weatherFor(ctx, timing, norm.date);

  // The block's air: one draw for a departure at airTime in the day's winds, with the time-of-day
  // model of its window. The draw never depends on the plane; a wide-body only feels it less.
  const airTiming = timingAt(ctx, norm.date, spec.airTime, day.airborneMin, day.airborneMin + AIR_TAXI_MIN);
  const air = { timing: airTiming, wx: weatherFor(ctx, airTiming, norm.date) };
  const tod: TodModel = { ...todModelFor(ctx, departWindowOf(spec.airTime), routeMonth.bestSlot, false), wide: model.bodyType === "wide" };
  const turbulence = buildTurbulence(createRng(spec.airKey), ctx, timing, weather, model.cruiseAltitudeFt, tod, air);

  // The on-time rate on this route is one per airline, whichever of its flights and days.
  const airlineStats = buildAirlineStats(createRng(`route-stats|${day.route}|${airline.code}`), airline, model);
  const seatMap = buildSeatMap(root.fork("seats"), cabinConfigFor(airline.code, model));
  const sounds = soundsFor(root.fork("sounds"), model, turbulence, timing.airborneMin);

  const flight = assembleFlight(spec.id, norm, {
    ctx,
    timing,
    airline,
    flightNumber: spec.flightNumber,
    gate,
    aircraft,
    crew,
    turbulence,
    history: routeMonth.history,
    weather,
    airlineStats,
    seatMap,
    sounds,
  });
  return { ...flight, alternatives: [], prefs: {} };
}
