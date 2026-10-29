/*
 * Version D — plain-language category ratings for the "smooth-flight finder" at booking
 * time. rateFlight(option, today) turns one version C flight into four ratings a nervous
 * flyer can sort and filter by: Smooth cruise, Smooth takeoff & landing, Aircraft size and
 * Space & quiet. Pure and deterministic: no clock (today is passed in), no randomness; the
 * same flight and date give the same ratings. Calm copy only: each rating has a one-line
 * "what it means for you" that says what to expect and why it is normal, and the ratings
 * are about smoothness, size and comfort — never about safety.
 *
 * Time-aware (docs/FEASIBILITY.md, shared/src/forecast.ts): weeks or months out, a rating
 * may only use what is knowable then — the route's history for the month, the scheduled
 * aircraft type, airline cabin data, the departure time, the date and the airports. Within
 * TURBULENCE_FORECAST_DAYS (2) the cruise and takeoff & landing ratings switch to the
 * flight's own turbulence forecast and the wind at both ends (basis "forecast").
 *
 * Real-world data each category stands for (every input is something a real product can obtain):
 *  - cruise, booking time: PIREP / EDR turbulence climatology by route and month (the route
 *    history: share of smooth past flights, when bumps usually come, the calmest time of day),
 *    published schedules (departure time, aircraft type), route geometry (jet-stream latitude
 *    band and east–west alignment, mountain crossings, tropical latitudes) and the season.
 *  - cruise, within 2 days: WAFS / GTG-style turbulence forecasts along the flight's path
 *    (flight.turbulence) and the resulting smoothness score.
 *  - takeoff & landing, booking time: METAR climatology by airport, month and hour, climate
 *    normals by airport (the month's mean temperature and rain share, shared/src/airports.ts),
 *    terrain data and local approach patterns (shared/src/airportTraits.ts), the scheduled times.
 *  - takeoff & landing, within 2 days: the forecast climb and descent (flight.turbulence
 *    phases and windows) and the wind and gust forecast at both airports (flight.weather).
 *  - aircraft: the scheduled type from the published schedule, the airline's published seat
 *    map (seat count and layout) and the type's public facts (in service since, number flying);
 *    the exact airframe only once it is assigned (AIRFRAME_DAYS).
 *  - space & quiet: the airline's published seat pitch and width against typical economy
 *    (shared/src/benchmarks.ts), published cabin-noise measurements for the type, and a
 *    typical load for the route and day — monthly route load factors (DOT T-100) shaped by
 *    weekday, hour and holiday demand curves (airline booking / industry demand data) — shown
 *    as a plain band, labelled typical, never a seat count or a forecast.
 *
 * How each category is worked out:
 *  - cruise (history): start from the route's smooth share for the month (72–96), then adjust
 *    for the departure window the way the generator's own time-of-day model does (the window
 *    the history calls calmest +2.5, or +4 in the warm season / on overnight routes; warm-season
 *    afternoons −1.5 and evenings −2, −2.5 in summer over land), for a wide-body (+2.5, never
 *    worse) and for the route: the jet stream in its band (|mid-latitude| 25–65°, east–west)
 *    −2.5 in winter and −1 in spring and autumn, mountain crossings −1 each (the Rockies −1.5,
 *    −2.5 at most), tropical routes −1 (−2 for afternoon departures). Every route adjustment
 *    counts, and all of them are named in the one Route factor. Tiers: ≥ 92 Very smooth, ≥ 85
 *    Smooth, ≥ 78 Moderate, ≥ 71 Slightly bumpy, below that Bumpy.
 *  - cruise (forecast): the smoothness score's own formula applied to the cruise phase only
 *    (mean level, cruise bump windows), averaged with the flight's score, on the bands ≥ 90 /
 *    84 / 76 / 68; then kept in step with the score (≥ 88 never below Smooth, < 70 never above
 *    Moderate) so a card never contradicts the score ring.
 *  - takeoff & landing (history): each airport's traits in the month and at the local hour of
 *    the departure or arrival, in points. The afternoon is the generator's convective window,
 *    12:00–18:59, tapered: a full share inside it, half on its shoulders (11:00–11:59 and
 *    19:00–20:59), none otherwise. Hot afternoons follow the month's mean temperature from the
 *    climate normals (heatAt: full heat at ≥ 27 °C, half from 23 °C, none below; full all year in
 *    the tropics): heat × (0.25 + 2 × afternoon share), or 1.75 × share in the tropics. Terrain
 *    1.25, +1 in winter and spring, +0.75 × share in summer; coastal 0.75, +0.75 × share in the
 *    warm season (all year in the tropics); exposed 1, +1 in autumn and winter; any airport north
 *    of 40° +0.5 in winter; a summer afternoon +0.5 × share unless a trait already counted the
 *    heat; mornings (before 10) −0.5; each end capped at 3.5. Tiers on the sum: ≤ 0.75 Very
 *    smooth, ≤ 2 Smooth, ≤ 3.75 Moderate, ≤ 6 Slightly bumpy, above that Bumpy — climatology
 *    alone reaches Bumpy only when both ends score about 3.5 (a coastal hot afternoon, a hot
 *    afternoon near high ground, high ground by the coast on a spring afternoon).
 *  - takeoff & landing (forecast): the climb and descent phases (light 1.5, moderate 3.5, plus
 *    0.05 a minute of bump windows) and the wind at both ends (12 kt 0.75, 15 kt 1.25, gusts
 *    +0.5), on the same tiers.
 *  - aircraft: Large jet = wide-body; otherwise the tier follows the seat count the card shows
 *    (the airline's configuration): Mid-size jet from 185 seats, Smaller jet below. Fleet age is
 *    no part of it — it is neither size nor comfort.
 *  - space & quiet: seat pitch and width against the benchmarks (better +1, worse −1), the
 *    cabin-noise band (a little quieter +0.5) and the typical fullness band (plenty of open
 *    seats +1, a few +0.25, fairly full −0.5, very full −1.5). Tiers: ≥ 1.5 Roomy and quiet,
 *    ≤ −1.5 Fuller and livelier, between them Typical cabin; the one-line meaning is built from
 *    the parts that actually scored.
 *
 * One vocabulary for the time of day on every card and figure (todWord): morning before 11,
 * late-morning until 12, afternoon until 17, late-afternoon until 18, then evening. The cruise
 * arithmetic keeps the generator's departure windows (departWindowOf) and the takeoff & landing
 * arithmetic the convective window above; only the words are shared.
 */
import { AIRPORT_TRAIT_WORDS, airportTraits, type AirportTrait } from "./airportTraits";
import { climateFor } from "./airports";
import { compareToBenchmark } from "./benchmarks";
import { addDays, daysBetween, formatOffset, formatTime12, isISODate, monthName, parseISODate, weekdayIndex } from "./dates";
import { MOUNTAIN_RANGES, departWindowOf, routeBestSlot, routeDay, type DepartureSlot, type MountainRange } from "./fakeFlight";
import { availabilityFor, type Availability } from "./forecast";
import type { FlightOption } from "./search";
import type { Airport, BumpWindow, DepartWindow, Flight, FlightPhase, Intensity, WeatherReport } from "./types";

// ── API ─────────────────────────────────────────────────────────────────────

export type RatingCategory = "cruise" | "takeoff_landing" | "aircraft" | "space";

/** The default priority order. */
export const RATING_CATEGORIES: readonly RatingCategory[] = ["cruise", "takeoff_landing", "aircraft", "space"];

export const CATEGORY_LABELS: Record<RatingCategory, string> = {
  cruise: "Smooth cruise",
  takeoff_landing: "Smooth takeoff & landing",
  aircraft: "Aircraft size",
  space: "Space & quiet",
};

/** One line each for the priorities setup — a preference, never a fear. */
export const CATEGORY_PROMPTS: Record<RatingCategory, string> = {
  cruise: "A steady ride once we are up",
  takeoff_landing: "Gentle first and last few minutes",
  aircraft: "A bigger plane",
  space: "Room to settle in and a quieter cabin",
};

export type SmoothTier = "very_smooth" | "smooth" | "moderate" | "slightly_bumpy" | "bumpy";
export type SizeTier = "large" | "mid" | "smaller";
export type SpaceTier = "roomy_quiet" | "typical" | "fuller";
export type RatingTier = SmoothTier | SizeTier | SpaceTier;

export type RatingBasis = "history" | "forecast" | "aircraft" | "cabin";

export interface RatingFactor {
  title: string;
  detail: string;
  effect: "up" | "down" | "neutral";
}

export interface Rating {
  category: RatingCategory;
  tier: RatingTier;
  /** The tier's label: "Very smooth", "Mid-size jet", "Typical cabin"… */
  label: string;
  /** 0..4 on the category scale (5-tier: bumpy 0 … very_smooth 4; 3-tier: 0 / 2 / 4), for sorting. */
  value: number;
  /** One line for the traveller: what to expect and why it is normal. */
  meaning: string;
  basis: RatingBasis;
  /** "Based on past flights on this route in November", "Based on this week's forecast"… */
  basisText: string;
  /** 2–4 plain reasons ("how this is worked out"). */
  factors: RatingFactor[];
  /** The figures behind it, for the detail sheet only. */
  numbers: Array<{ label: string; value: string }>;
}

export interface RatingInput {
  option: FlightOption;
  /** Today's date, "YYYY-MM-DD" (from the client's clock, never read here). */
  today: string;
}

const SMOOTH_TIERS: readonly SmoothTier[] = ["bumpy", "slightly_bumpy", "moderate", "smooth", "very_smooth"];
const SMOOTH_LABELS: Record<SmoothTier, string> = {
  very_smooth: "Very smooth",
  smooth: "Smooth",
  moderate: "Moderate",
  slightly_bumpy: "Slightly bumpy",
  bumpy: "Bumpy",
};
const SIZE_LABELS: Record<SizeTier, string> = { large: "Large jet", mid: "Mid-size jet", smaller: "Smaller jet" };
const SPACE_LABELS: Record<SpaceTier, string> = { roomy_quiet: "Roomy and quiet", typical: "Typical cabin", fuller: "Fuller and livelier" };
const SIZE_VALUE: Record<SizeTier, number> = { smaller: 0, mid: 2, large: 4 };
const SPACE_VALUE: Record<SpaceTier, number> = { fuller: 0, typical: 2, roomy_quiet: 4 };

/** The tier's label on its category's scale ("" for a tier that isn't on it). */
export function tierLabel(category: RatingCategory, tier: RatingTier): string {
  const table: Record<string, string> =
    category === "aircraft" ? SIZE_LABELS : category === "space" ? SPACE_LABELS : SMOOTH_LABELS;
  return table[tier] ?? "";
}

/** The four ratings for a flight, in RATING_CATEGORIES order. Deterministic and cheap. */
export function rateFlight(input: RatingInput): Rating[] {
  const f = input.option.flight;
  const daysUntil = isISODate(input.today) ? daysBetween(input.today, f.input.date) : Infinity;
  const availability = availabilityFor(daysUntil);
  const geo = geometryFor(f);
  return [
    availability.turbulence ? rateCruiseForecast(f) : rateCruiseHistory(f, geo),
    availability.turbulence ? rateApproachForecast(f, availability) : rateApproachHistory(f, geo),
    rateAircraft(f, availability),
    rateSpace(f, geo),
  ];
}

/** The ratings in the traveller's priority order; categories missing from `order` follow in the default order. */
export function orderByPriorities(ratings: readonly Rating[], order: readonly RatingCategory[]): Rating[] {
  const { ranks } = rankOf(order);
  return [...ratings].sort((a, b) => ranks[a.category] - ranks[b.category]);
}

/** Σ weight × value with weights 4, 3, 2, 1 by rank; categories missing from `order` weigh 1. Higher is better. */
export function forYouScore(ratings: readonly Rating[], order: readonly RatingCategory[]): number {
  const { ranks, listed } = rankOf(order);
  let score = 0;
  for (const r of ratings) {
    const rank = ranks[r.category];
    score += (rank < listed ? 4 - rank : 1) * r.value;
  }
  return score;
}

/** A stored or URL order: 4 distinct known categories (an array, or a comma-separated string), else null. */
export function parsePriorityOrder(value: unknown): RatingCategory[] | null {
  const items = typeof value === "string" ? value.split(",").map((s) => s.trim()) : Array.isArray(value) ? value : null;
  if (!items || items.length !== RATING_CATEGORIES.length) return null;
  const out: RatingCategory[] = [];
  for (const item of items) {
    if (typeof item !== "string" || !(RATING_CATEGORIES as readonly string[]).includes(item) || out.includes(item as RatingCategory)) return null;
    out.push(item as RatingCategory);
  }
  return out;
}

/** 1 = cheapest; ties share the lowest rank. */
export function priceRank(prices: readonly number[], price: number): number {
  let below = 0;
  for (const p of prices) if (p < price) below++;
  return below + 1;
}

/**
 * Rank per category from an order: 0… for the listed ones (first occurrence counts, unknown
 * entries ignored), then the rest in the default order; `listed` is how many the order named.
 */
function rankOf(order: readonly RatingCategory[]): { ranks: Record<RatingCategory, number>; listed: number } {
  const ranks = {} as Record<RatingCategory, number>;
  let next = 0;
  for (const c of order) if (RATING_CATEGORIES.includes(c) && ranks[c] === undefined) ranks[c] = next++;
  const listed = next;
  for (const c of RATING_CATEGORIES) if (ranks[c] === undefined) ranks[c] = next++;
  return { ranks, listed };
}

// ── Shared helpers ──────────────────────────────────────────────────────────

type Season = "winter" | "spring" | "summer" | "autumn";
type Effect = RatingFactor["effect"];
type SmoothBasis = "history" | "forecast";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const uncap = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const withCommas = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const hourOf = (hhmm: string) => Number(hhmm.slice(0, 2)) + Number(hhmm.slice(3, 5)) / 60;
/** "Delta Air Lines" → "Delta Air Lines’", "Lufthansa" → "Lufthansa’s". */
const possessive = (name: string) => (/s$/i.test(name) ? `${name}’` : `${name}’s`);
/** The generator's phase notes end with a period; factor details don't. */
const unperiod = (s: string) => s.replace(/\.$/, "");
const isTropical = (lat: number) => Math.abs(lat) < 23.5;
/** "a", "a and b", "a, b and c". */
const joinAnd = (parts: readonly string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`);

/** The one time-of-day word every card and figure uses, from the local hour. */
const todWord = (hour: number) => (hour < 11 ? "morning" : hour < 12 ? "late-morning" : hour < 17 ? "afternoon" : hour < 18 ? "late-afternoon" : "evening");

/** The same bands as todWord, as a phrase: "on a Friday afternoon", "late on a Friday morning". */
function todPhrase(weekday: string, hour: number): string {
  const late = (hour >= 11 && hour < 12) || (hour >= 17 && hour < 18);
  const word = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  return `${late ? "late " : ""}on a ${weekday} ${word}`;
}

/**
 * How far a local hour sits inside the generator's convective window (buildWeather: 12:00–18:59):
 * 1 inside it, 0.5 on its shoulders (11:00–11:59 and 19:00–20:59), 0 otherwise — a taper, so a
 * 6:40 PM arrival is not "settled" while a 12:05 PM one carries the full afternoon heat.
 */
const afternoonShare = (hour: number) => (hour >= 12 && hour < 19 ? 1 : (hour >= 11 && hour < 12) || (hour >= 19 && hour < 21) ? 0.5 : 0);

/** Seasons by month, shifted by six months south of the equator (the generator's rule). */
function seasonAt(month: number, lat: number): Season {
  const m = lat < 0 ? ((month + 5) % 12) + 1 : month;
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

/** "winter" at Boston, "tropical" at Singapore — the season word a traveller would recognise. */
const seasonWordAt = (lat: number, month: number) => (isTropical(lat) ? "tropical" : seasonAt(month, lat));

/** The month's mean temperature and rain share at a catalogue airport, from its climate normals blended the generator's way (monthBlend); undefined for an unknown code. */
function monthClimate(code: string, month: number): { meanC: number; rainPct: number } | undefined {
  const c = climateFor(code);
  if (!c) return undefined;
  const w = (1 - Math.cos((2 * Math.PI * (month - 1)) / 12)) / 2;
  return { meanC: c.janC + (c.julC - c.janC) * w, rainPct: c.rainJanPct + (c.rainJulPct - c.rainJanPct) * w };
}

/**
 * How hot a month is near an airport, 0–1: 1 in the tropics or when the month's mean is ≥ 27 °C,
 * 0.5 from 23 °C, else 0 (at an airport without climate normals, 1 in summer). The table holds
 * January and July normals blended on a cosine, so 27 keeps every listed hot airport at full heat
 * in its peak month (Atlanta's July is 27 °C) while May and September count where they are hot
 * (Phoenix 29.5 °C) and not where they are mild (Atlanta 22 °C).
 */
function heatAt(airport: Airport, month: number): number {
  if (isTropical(airport.lat)) return 1;
  const climate = monthClimate(airport.code, month);
  if (!climate) return seasonAt(month, airport.lat) === "summer" ? 1 : 0;
  return climate.meanC >= 27 ? 1 : climate.meanC >= 23 ? 0.5 : 0;
}

function smoothRating(category: "cruise" | "takeoff_landing", value: number, basis: SmoothBasis, basisText: string, factors: RatingFactor[], numbers: Rating["numbers"]): Rating {
  const tier = SMOOTH_TIERS[Math.max(0, Math.min(4, Math.round(value)))];
  const meaning = category === "cruise" ? CRUISE_MEANING[tier] : APPROACH_MEANING[basis][tier];
  return { category, tier, label: SMOOTH_LABELS[tier], value: SMOOTH_TIERS.indexOf(tier), meaning, basis, basisText, factors, numbers };
}

const CRUISE_MEANING: Record<SmoothTier, string> = {
  very_smooth: "Expect a steady cruise with little more than the odd ripple — the kind of flight where the seatbelt sign stays off for most of the way.",
  smooth: "Expect a mostly steady cruise; a few light bumps are common on any flight and pass in a minute or two.",
  moderate: "Expect smooth stretches with a few patches of light bumps mid-flight — routine for the plane and crew, who ride through air like this every day.",
  slightly_bumpy: "Expect a few bumpy patches at cruise, the kind the seatbelt sign comes on for; they feel bigger than they are, and the pilots often change altitude to find smoother air.",
  bumpy: "Expect a livelier cruise than most flights, with stretches where the seatbelt sign stays on; the bumps feel bigger than they are, and the pilots usually change altitude to find smoother air.",
};

/**
 * Keyed by basis: the history lines may say "usually" and "often" (climatology, at this time of
 * day and year); the forecast lines describe this week's air. Both leave the cause to the factors.
 */
const APPROACH_MEANING: Record<SmoothBasis, Record<SmoothTier, string>> = {
  history: {
    very_smooth: "Expect a gentle climb-out and a steady approach — the air near the ground at both airports is usually calm at these times of day and year.",
    smooth: "Expect a routine takeoff and landing, with perhaps a nudge or two in the first and last few minutes as the plane passes through the wind near the ground.",
    moderate: "Expect a few light bumps in the first or last few minutes — common near these airports at this time of year, and part of every pilot's working day.",
    slightly_bumpy: "Expect a lively few minutes after takeoff or before landing — the air near the ground here is often unsettled at this time of day and year, like a car on a rough stretch of road, and the pilots are well used to it.",
    bumpy: "Expect a bumpy few minutes after takeoff or before landing — the air near the ground is often lively at one or both ends at this time of day and year; it is routine for the crews who fly here daily, and it settles once the plane is above it or on the ground.",
  },
  forecast: {
    very_smooth: "Expect a gentle climb-out and a steady approach, with calm air near the ground at both ends.",
    smooth: "Expect a routine takeoff and landing, with perhaps a nudge or two in the first and last few minutes as the plane passes through the wind near the ground.",
    moderate: "Expect a few light bumps in the first or last few minutes — common on any approach, and part of every pilot's working day.",
    slightly_bumpy: "Expect a lively few minutes after takeoff or before landing — the air near the ground is unsettled at one or both ends this week, like a car on a rough stretch of road, and the pilots are well used to it.",
    bumpy: "Expect a bumpy few minutes after takeoff or before landing — the air near the ground is lively at one or both ends; it is routine for the crews who fly here daily, and it settles once the plane is above it or on the ground.",
  },
};

// ── Route geometry and traits (recomputed from the airports) ────────────────

interface RouteGeometry {
  midLat: number;
  /** 0–1: how east–west the route runs (1 from 40° of longitude). */
  ewStrength: number;
  tropical: boolean;
  /** Ranges the great circle crosses between the two airports (not the ones an airport sits in). */
  crossings: readonly MountainRange[];
  oceanic: boolean;
  longHaul: boolean;
  /** Busy = a carrier with a hub at both ends; long = long-haul; else ordinary (search.ts marketOf). */
  market: "busy" | "ordinary" | "long";
  season: Season;
  month: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

function inRange(lat: number, lon: number, r: MountainRange): boolean {
  return lon >= r.lonMin && lon <= r.lonMax && lat >= r.latMin && lat <= r.latMax;
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
  const omega = Math.acos(Math.max(-1, Math.min(1, p[0] * q[0] + p[1] * q[1] + p[2] * q[2])));
  if (omega < 1e-9) return { lat: a.lat, lon: a.lon };
  const s1 = Math.sin((1 - f) * omega) / Math.sin(omega);
  const s2 = Math.sin(f * omega) / Math.sin(omega);
  const v = [s1 * p[0] + s2 * q[0], s1 * p[1] + s2 * q[1], s1 * p[2] + s2 * q[2]];
  return { lat: (Math.asin(v[2]) * 180) / Math.PI, lon: (Math.atan2(v[1], v[0]) * 180) / Math.PI };
}

interface RouteShape {
  midLat: number;
  ewStrength: number;
  tropical: boolean;
  crossings: readonly MountainRange[];
}

const SHAPES = new Map<string, RouteShape>();
const SHAPES_MAX = 512;

/** Latitude band, east–west alignment, tropics and mountain crossings of a route (cached by endpoints), on the generator's own ranges. */
function shapeOf(origin: Airport, destination: Airport): RouteShape {
  const key = `${origin.code}|${destination.code}`;
  const hit = SHAPES.get(key);
  if (hit) return hit;
  let dLon = destination.lon - origin.lon;
  while (dLon > 180) dLon -= 360;
  while (dLon <= -180) dLon += 360;
  const midLat = (origin.lat + destination.lat) / 2;
  const crossings: MountainRange[] = [];
  if (origin.code !== destination.code) {
    for (const range of MOUNTAIN_RANGES) {
      if (inRange(origin.lat, origin.lon, range) || inRange(destination.lat, destination.lon, range)) continue;
      for (let i = 2; i <= 38; i++) {
        const { lat, lon } = alongRoute(origin, destination, i / 40);
        if (inRange(lat, lon, range)) {
          crossings.push(range);
          break;
        }
      }
    }
  }
  const shape: RouteShape = { midLat, ewStrength: Math.min(1, Math.abs(dLon) / 40), tropical: isTropical(midLat), crossings };
  if (SHAPES.size >= SHAPES_MAX) SHAPES.delete(SHAPES.keys().next().value as string);
  SHAPES.set(key, shape);
  return shape;
}

function geometryFor(f: Flight): RouteGeometry {
  const shape = shapeOf(f.origin, f.destination);
  const day = routeDay(f.input);
  const hubAt = (code: string) => day.carriers.some((c) => c.airline.hubs.includes(code));
  const long = day.oceanic || day.distanceMi > 3000 || (!day.domestic && day.distanceMi > 2600);
  const { m: month } = parseISODate(f.input.date);
  return {
    ...shape,
    oceanic: day.oceanic,
    longHaul: day.longHaul,
    market: long ? "long" : hubAt(f.origin.code) && hubAt(f.destination.code) ? "busy" : "ordinary",
    season: seasonAt(month, shape.midLat),
    month,
  };
}

// ── Smooth cruise ───────────────────────────────────────────────────────────

/** The slots' names, used only if the history sentence ever stopped matching (check-ratings asserts it never does). */
const SLOT_LABELS: Record<DepartureSlot, string> = {
  morning: "Morning (6–10 AM)",
  midday: "Midday (10 AM–2 PM)",
  afternoon: "Afternoon",
  evening: "Early evening (5–8 PM)",
  overnight: "Overnight",
};

/**
 * The calmest time of day on the route: the generator's own slot (routeBestSlot), labelled the
 * way the history sentence words it. The sentence is read for its wording only.
 */
function bestSlotFor(f: Flight): { slot: DepartureSlot; window: DepartWindow; label: string } {
  const slot = routeBestSlot(f.input);
  const m = /^(Morning|Midday|Afternoon|Early-evening|Evening|Overnight) departures(?: \(([^)]+)\))?/.exec(f.turbulence.history.bestDepartureWindow);
  const word = m?.[1];
  const hours = m?.[2];
  const name = word === "Early-evening" ? "Early evening" : word;
  const label = name === undefined ? SLOT_LABELS[slot] : hours ? `${name} (${hours})` : name;
  const window: DepartWindow = slot === "morning" ? "morning" : slot === "midday" || slot === "afternoon" ? "afternoon" : "evening";
  return { slot, window, label };
}

const PHASE_WHERE: Record<FlightPhase, string> = {
  takeoff: "at takeoff",
  climb: "during the climb",
  cruise: "mid-flight",
  descent: "during descent",
  landing: "at landing",
};

/** After "during": "the climb and descent". */
const PHASE_NAME: Record<FlightPhase, string> = {
  takeoff: "takeoff",
  climb: "the climb",
  cruise: "the cruise",
  descent: "descent",
  landing: "landing",
};

const BODY_FACTOR: Record<"wide" | "narrow", RatingFactor> = {
  wide: { title: "Aircraft", detail: "Wide-body jet — its size and weight mean it feels the same bumps a little less", effect: "up" },
  narrow: { title: "Aircraft", detail: "Single-aisle jet — the standard airliner; light bumps feel much as they do on most flights", effect: "neutral" },
};

interface RouteReason {
  penalty: number;
  /** "runs along the jet stream in winter, when it blows strongest" */
  head: string;
  /** "the usual source of bumps at cruise here" */
  why: string;
  /** For the detail sheet: "jet stream (winter)". */
  name: string;
}

/** Weeks or months out: the route's history for the month, the departure window, the plane and the route. */
function rateCruiseHistory(f: Flight, geo: RouteGeometry): Rating {
  const h = f.turbulence.history;
  const hour = hourOf(f.departTime);
  const window = departWindowOf(f.departTime);
  const tod = cap(todWord(hour));
  const best = bestSlotFor(f);
  const warm = geo.season === "summer" || geo.tropical;
  const wide = f.aircraft.bodyType === "wide";
  const factors: RatingFactor[] = [];
  let s = h.smoothPct;

  factors.push({
    title: "Past flights on this route",
    detail: `${h.smoothPct >= 90 ? "Nearly all" : "Most"} ${h.month} flights on this route were smooth (about ${h.smoothPct}%)`,
    effect: h.smoothPct >= 88 ? "up" : h.smoothPct >= 80 ? "neutral" : "down",
  });

  // The departure window, following the generator's own time-of-day model (todModelFor); the words follow todWord.
  let shift: number;
  let todDetail: string;
  if (best.slot === "overnight") {
    shift = window === "evening" ? 4 : -1;
    todDetail = window === "evening"
      ? `${tod} departure — on this route the overnight flights are usually the smoothest, as the air settles after sunset`
      : `${tod} departure — daytime flights on this route see a little more wind aloft than the overnight ones`;
  } else if (warm) {
    // Summer evenings over land still carry the clouds the day built (the generator's eveningBuild); over the sea and in the tropics the evening only fades.
    const eveningBuild = geo.season === "summer" && !geo.oceanic;
    shift = window === "morning" ? 4 : window === "afternoon" ? -1.5 : eveningBuild ? -2.5 : -2;
    todDetail = window === "morning"
      ? `${tod} departure — before the day's warmth builds clouds along the route`
      : window === "afternoon"
        ? geo.tropical
          ? `${tod} departure — the afternoon is when the warm, moist air over the sea and coast builds the most cloud`
          : geo.oceanic
            ? `${tod} departure — the day's warmth stirs the air a little along the route`
            : `${tod} departure — warm air rising over the land adds a few more light bumps`
        : eveningBuild
          ? `${tod} departure — clouds built by the day's warmth are still settling along the route`
          : `${tod} departure — the day's warmth is fading, though a few clouds over the sea and coast linger`;
  } else {
    const favoured = window === best.window;
    shift = favoured ? 2.5 : -0.5;
    todDetail = favoured
      ? `${tod} departure — usually the smoothest part of the day on this route in ${h.month}`
      : `${tod} departure — much like the rest of the day on this route in ${h.month}`;
  }
  s += shift;
  factors.push({ title: "Time of day", detail: todDetail, effect: shift > 0 ? "up" : shift < -1 ? "down" : "neutral" });

  if (wide) s += 2.5;
  factors.push(BODY_FACTOR[wide ? "wide" : "narrow"]);

  // The route: the jet stream, the mountains and the tropics (the generator's cruise causes). Every one counts, and all are named.
  const reasons: RouteReason[] = [];
  const inJetBand = Math.abs(geo.midLat) >= 25 && Math.abs(geo.midLat) <= 65 && geo.ewStrength > 0.5;
  if (inJetBand) {
    const penalty = geo.season === "winter" ? -2.5 : geo.season === "summer" ? 0 : -1;
    reasons.push({
      penalty,
      head: geo.season === "winter"
        ? "runs along the jet stream in winter, when it blows strongest"
        : geo.season === "summer"
          ? "runs along the jet stream, which is at its weakest in summer"
          : `runs along the jet stream, which is milder in ${geo.season}`,
      why: geo.season === "winter" ? "the usual source of bumps at cruise here" : geo.season === "summer" ? "little effect at this time of year" : "it adds the odd bump at cruise",
      name: `jet stream (${geo.season})`,
    });
  }
  if (geo.crossings.length > 0) {
    const penalty = Math.max(-2.5, geo.crossings.reduce((sum, r) => sum + (r.short === "the Rockies" ? -1.5 : -1), 0));
    const names = joinAnd(geo.crossings.map((r) => r.short));
    reasons.push({ penalty, head: `crosses ${names}`, why: "air flowing over the mountains can add a few bumps", name: `crosses ${names}` });
  }
  if (geo.tropical) {
    const penalty = window === "afternoon" ? -2 : -1;
    reasons.push({ penalty, head: "a tropical route", why: "warm, moist air builds clouds over the sea and coast, most of all in the afternoon", name: "tropical latitudes" });
  }
  const routePenalty = reasons.reduce((n, r) => n + r.penalty, 0);
  s += routePenalty;
  if (reasons.length > 0) {
    const tropical = reasons.find((r) => r.name === "tropical latitudes");
    const others = reasons.filter((r) => r !== tropical);
    const head = tropical
      ? `${tropical.head}${others.length > 0 ? ` that ${others.map((r) => r.head).join(" and ")}` : ""}`
      : others.length === 1
        ? others[0].head
        : `${others[0].head}, and ${others.slice(1).map((r) => r.head).join(" and ")}`;
    const why = (tropical ? [...others, tropical] : others).map((r) => r.why).join("; ");
    factors.push({ title: "Route", detail: `${cap(head)} — ${why}`, effect: routePenalty <= -1.5 ? "down" : routePenalty < 0 ? "neutral" : "up" });
  }

  const value = s >= 92 ? 4 : s >= 85 ? 3 : s >= 78 ? 2 : s >= 71 ? 1 : 0;
  const numbers: Rating["numbers"] = [
    { label: "Past flights smooth", value: `${h.smoothPct}%` },
    { label: "Flights counted", value: `About ${withCommas(h.flightsAnalyzed)} in ${h.month}` },
    { label: "Calmest time of day", value: best.label },
    { label: "Bumps most often", value: cap(PHASE_WHERE[h.typicalBumpyPhase]) },
    { label: "This departure", value: `${formatTime12(f.departTime)} · ${todWord(hour)}` },
    { label: "Aircraft", value: wide ? "Wide-body" : "Single-aisle" },
    { label: "Route", value: reasons.length > 0 ? cap(reasons.map((r) => r.name).join(" · ")) : "No particular feature" },
  ];
  return smoothRating("cruise", value, "history", `Based on past flights on this route in ${h.month}`, factors, numbers);
}

/** The forecast's cruise line: the moderate window at its own time (the generator's phaseNote does the same), else the first light one. */
function cruiseForecastDetail(cruiseWindows: readonly BumpWindow[]): string {
  const first = cruiseWindows[0];
  if (!first) return "Smooth air expected at cruise";
  const moderate = cruiseWindows.find((w) => w.intensity === "moderate");
  if (moderate) return `Moderate bumps possible about ${formatOffset(moderate.startMin)} into the flight, for about ${formatOffset(moderate.durationMin)} — the seatbelt sign will likely come on`;
  const total = cruiseWindows.reduce((n, w) => n + w.durationMin, 0);
  return `Light bumps likely about ${formatOffset(first.startMin)} into the flight, for about ${formatOffset(total)}`;
}

/** Within 2 days: the cruise phase of the flight's own forecast, kept in step with its smoothness score. */
function rateCruiseForecast(f: Flight): Rating {
  const t = f.turbulence;
  const score = f.smoothness.score;
  const wide = f.aircraft.bodyType === "wide";
  let levels = 0;
  let count = 0;
  for (const p of t.points) {
    if (p.phase !== "cruise") continue;
    levels += p.level;
    count++;
  }
  const mean = count > 0 ? levels / count : 0;
  const cruiseWindows = t.windows.filter((w) => w.phase === "cruise");
  let c = 97 - mean * 22;
  for (const w of cruiseWindows) c -= w.intensity === "moderate" ? 10 + w.durationMin * 0.25 : 3 + w.durationMin * 0.12;
  const idx = (c + score) / 2;
  let value = idx >= 90 ? 4 : idx >= 84 ? 3 : idx >= 76 ? 2 : idx >= 68 ? 1 : 0;
  if (score >= 88) value = Math.max(value, 3);
  if (score < 70) value = Math.min(value, 2);

  const cruisePeak = cruiseWindows.some((w) => w.intensity === "moderate") ? "moderate" : cruiseWindows.length > 0 ? "light" : "none";
  const factors: RatingFactor[] = [
    {
      title: "Forecast at cruise",
      detail: cruiseForecastDetail(cruiseWindows),
      effect: cruisePeak === "none" ? "up" : cruisePeak === "light" ? "neutral" : "down",
    },
    {
      title: "Whole flight",
      detail: `${cap(f.smoothness.label)} overall (score ${score} of 100)${wholeFlightWhere(t.windows, cruiseWindows)}`,
      effect: score >= 88 ? "up" : score >= 75 ? "neutral" : "down",
    },
    BODY_FACTOR[wide ? "wide" : "narrow"],
    {
      title: "Smooth share",
      detail: `About ${t.smoothMinutesPct}% of the time in the air is expected to be smooth`,
      effect: t.smoothMinutesPct >= 85 ? "up" : t.smoothMinutesPct >= 70 ? "neutral" : "down",
    },
  ];
  const cruiseMinutes = cruiseWindows.reduce((n, w) => n + w.durationMin, 0);
  const numbers: Rating["numbers"] = [
    { label: "Smoothness score", value: `${score} of 100` },
    { label: "Smooth share of the flight", value: `${t.smoothMinutesPct}%` },
    { label: "Bumps at cruise", value: cruiseMinutes > 0 ? `About ${formatOffset(cruiseMinutes)} · ${cruisePeak}` : "None expected" },
    { label: "Strongest expected", value: t.maxIntensity === "none" ? "No bumps expected" : `${cap(t.maxIntensity)} bumps` },
    { label: "Route in " + monthName(f.input.date), value: `${f.turbulence.history.smoothPct}% of past flights smooth` },
    { label: "Aircraft", value: wide ? "Wide-body" : "Single-aisle" },
  ];
  return smoothRating("cruise", value, "forecast", "Based on this week's forecast", factors, numbers);
}

/** " — the bumps come during descent rather than at cruise" when the flight's bumps are outside the cruise. */
function wholeFlightWhere(windows: readonly BumpWindow[], cruiseWindows: readonly BumpWindow[]): string {
  const elsewhere = [...new Set(windows.filter((w) => w.phase !== "cruise").map((w) => PHASE_NAME[w.phase]))];
  if (elsewhere.length === 0) return "";
  const where = joinAnd(elsewhere);
  return cruiseWindows.length === 0 ? ` — the bumps come during ${where} rather than at cruise` : ` — with more bumps during ${where}`;
}

// ── Smooth takeoff & landing ────────────────────────────────────────────────

interface EndpointPattern {
  points: number;
  /** "coastal — the sea breeze is at its strongest on summer afternoons" */
  detail: string;
  /** "Coastal, hot afternoons · summer afternoon" */
  summary: string;
}

/** How lively the air near one airport usually is at a local hour on a date, in points (0 = calm). */
function endpointPattern(airport: Airport, hour: number, dateIso: string): EndpointPattern {
  const { m: month } = parseISODate(dateIso);
  const season = seasonAt(month, airport.lat);
  const tropical = isTropical(airport.lat);
  const traits = airportTraits(airport.code);
  const has = (t: AirportTrait) => traits.includes(t);
  const share = afternoonShare(hour);
  const morning = hour < 10;
  const warm = tropical || season === "spring" || season === "summer";
  const climate = monthClimate(airport.code, month);
  const heat = heatAt(airport, month);
  let points = 0;
  /** Whether a trait already counted the afternoon heat, so the general afternoon nudge isn't added twice. */
  let heated = false;
  const reasons: string[] = [];
  /** The traits at work in this month, for the summary line. */
  const active: AirportTrait[] = [];

  if (has("hot_afternoon") && heat > 0) {
    const p = tropical ? 1.75 * share : heat * (0.25 + 2 * share);
    points += p;
    heated = p >= 1;
    active.push("hot_afternoon");
    const showers = tropical || (climate !== undefined && climate.rainPct >= 25);
    if (share === 1) {
      reasons.push(
        hour >= 18
          ? "early evening, with the day's heat still in the air near the airport"
          : tropical
            ? "tropical afternoon heat builds rising air and showers near the airport"
            : heat === 1
              ? `afternoon heat builds rising air${showers ? " and showers" : ""} near the airport`
              : "warm afternoons stir the air a little near the airport",
      );
    } else if (share === 0.5) {
      reasons.push(hour < 12 ? "late morning, as the day's heat begins to build" : "early evening, as the day's heat fades");
    } else if (!tropical) {
      reasons.push(`hot days in ${monthName(dateIso)}, though the air is calmer in the morning and evening`);
    }
  }
  if (has("terrain")) {
    const thermals = season === "summer" ? 0.75 * share : 0;
    const windy = season === "winter" || season === "spring";
    points += 1.25 + (windy ? 1 : 0) + thermals;
    heated = heated || thermals >= 0.75;
    active.push("terrain");
    reasons.push(
      windy
        ? `wind flowing over the high ground nearby can stir the approach in ${tropical ? "the dry season" : season}`
        : thermals > 0
          ? "afternoon heat over the high ground nearby adds a few thermals"
          : "high ground nearby, usually settled at this time of year",
    );
  }
  if (has("coastal")) {
    const breeze = warm ? 0.75 * share : 0;
    points += 0.75 + breeze;
    heated = heated || breeze >= 0.75;
    active.push("coastal");
    reasons.push(
      breeze > 0
        ? tropical
          ? "coastal — the sea breeze picks up every afternoon"
          : `coastal — the sea breeze is at its strongest on ${season} afternoons`
        : "coastal, with a gentle onshore breeze",
    );
  }
  if (has("exposed")) {
    const blustery = season === "autumn" || season === "winter";
    points += 1 + (blustery ? 1 : 0);
    active.push("exposed");
    reasons.push(blustery ? `an open, breezy site, most of all in ${season}` : "an open site, usually settled at this time of year");
  }
  if (season === "winter" && airport.lat >= 40) {
    points += 0.5;
    if (reasons.length === 0) reasons.push("winter weather systems pass through more often");
  }
  if (season === "summer" && share > 0 && !heated) {
    points += 0.5 * share;
    if (reasons.length === 0) reasons.push("a warm part of the day, when rising air can add a nudge or two");
  }
  if (morning) {
    points -= 0.5;
    if (reasons.length === 0) reasons.push("mornings are usually the calmest time of day here");
  }
  if (reasons.length === 0) reasons.push("no particular pattern — usually settled");
  points = Math.max(0, Math.min(3.5, points));
  const words = active.map((t) => AIRPORT_TRAIT_WORDS[t]);
  return {
    points,
    detail: reasons.length === 1 ? reasons[0] : `${reasons[0]}; ${reasons[1]}`,
    summary: `${words.length > 0 ? cap(words.join(", ")) : "No particular pattern"} · ${seasonWordAt(airport.lat, month)} ${todWord(hour)}`,
  };
}

const approachValue = (points: number) => (points <= 0.75 ? 4 : points <= 2 ? 3 : points <= 3.75 ? 2 : points <= 6 ? 1 : 0);
const patternEffect = (points: number): Effect => (points >= 2 ? "down" : points >= 1 ? "neutral" : "up");

/** Weeks or months out: the two airports' patterns in the month and at the scheduled hours. */
function rateApproachHistory(f: Flight, geo: RouteGeometry): Rating {
  const departHour = hourOf(f.departTime);
  const arriveHour = hourOf(f.arriveTime);
  const arriveDate = addDays(f.input.date, f.arriveDayOffset);
  const origin = endpointPattern(f.origin, departHour, f.input.date);
  const destination = endpointPattern(f.destination, arriveHour, arriveDate);
  const points = origin.points + destination.points;
  const month = monthName(f.input.date);
  const originSeason = seasonAt(geo.month, f.origin.lat);
  // The same climate-driven heat the airport factor uses, so the two lines never disagree about a warm afternoon.
  const originHeat = heatAt(f.origin, geo.month);
  const originWarm = originHeat > 0 || originSeason === "summer" || originSeason === "spring";
  const originHot = originHeat === 1 || originSeason === "summer";
  const share = afternoonShare(departHour);
  const departs = `Departs ${formatTime12(f.departTime)} in ${month}`;
  const timeDetail = departHour < 10
    ? `${departs} — mornings are usually the calmest time near the ground`
    : !originWarm
      ? `${departs} — a settled time of day`
      : share === 0 && departHour < 12
        ? `${departs} — before the day's warmth builds`
        : share === 0.5 && departHour < 12
          ? `${departs} — late morning, as the day's warmth begins to build`
          : share === 1 && departHour < 18
            ? `${departs} — the warmest part of the day, when the air near the ground is liveliest`
            : share === 1
              ? `${departs} — early evening, with the day's warmth still in the air near the ground`
              : share === 0.5
                ? `${departs} — the day's warmth is fading, and the air near the ground settles`
                : `${departs} — a settled time of day`;
  const factors: RatingFactor[] = [
    { title: `${f.origin.city} (${f.origin.code}) · departure`, detail: cap(origin.detail), effect: patternEffect(origin.points) },
    { title: `${f.destination.city} (${f.destination.code}) · arrival`, detail: cap(destination.detail), effect: patternEffect(destination.points) },
    { title: "Season and time", detail: timeDetail, effect: departHour < 10 ? "up" : originHot && share === 1 ? "down" : "neutral" },
  ];
  const originWord = seasonWordAt(f.origin.lat, geo.month);
  const destWord = seasonWordAt(f.destination.lat, parseISODate(arriveDate).m);
  const numbers: Rating["numbers"] = [
    { label: `${f.origin.code} pattern`, value: origin.summary },
    { label: `${f.destination.code} pattern`, value: destination.summary },
    { label: "Departure", value: `${formatTime12(f.departTime)} · ${todWord(departHour)}` },
    { label: "Arrival", value: `${formatTime12(f.arriveTime)} · ${todWord(arriveHour)}` },
    { label: "Season", value: originWord === destWord ? `${cap(originWord)} at both ends` : `${cap(originWord)} at ${f.origin.code}, ${destWord} at ${f.destination.code}` },
  ];
  return smoothRating(
    "takeoff_landing",
    approachValue(points),
    "history",
    `Based on typical ${month} conditions at ${f.origin.code} and ${f.destination.code}`,
    factors,
    numbers,
  );
}

const INTENSITY_POINTS: Record<Intensity, number> = { none: 0, light: 1.5, moderate: 3.5 };

const COMPASS: Record<string, string> = { N: "north", NE: "north-east", E: "east", SE: "south-east", S: "south", SW: "south-west", W: "west", NW: "north-west" };
const compassWord = (dir: string) => COMPASS[dir] ?? dir.toLowerCase();

function windPoints(w: WeatherReport, detail: boolean): number {
  if (!detail) return 0;
  return (w.windKts >= 15 ? 1.25 : w.windKts >= 12 ? 0.75 : 0) + (w.gustKts ? 0.5 : 0);
}

function windFactor(w: WeatherReport, moment: "departure" | "arrival", detail: boolean): RatingFactor {
  const title = `Wind at ${w.airportCode} · ${moment}`;
  if (!detail) return { title, detail: "Wind forecast not available yet", effect: "neutral" };
  const gust = w.gustKts ? `, gusting to ${w.gustKts}` : "";
  const word = w.windKts >= 15 ? "breezy, so a few nudges near the ground are normal" : w.windKts >= 12 ? "a steady breeze" : "light winds";
  return { title, detail: `${w.windKts} knots from the ${compassWord(w.windDir)}${gust} — ${word}`, effect: w.windKts >= 15 || w.gustKts ? "down" : w.windKts >= 12 ? "neutral" : "up" };
}

/** Within 2 days: the forecast climb and descent and the wind at both ends. */
function rateApproachForecast(f: Flight, availability: Availability): Rating {
  const t = f.turbulence;
  const climb = t.phases.find((p) => p.phase === "climb") ?? t.phases[1];
  const descent = t.phases.find((p) => p.phase === "descent") ?? t.phases[3];
  const detail = availability.weatherDetail;
  let points = INTENSITY_POINTS[climb.intensity] + INTENSITY_POINTS[descent.intensity];
  for (const w of t.windows) if (w.phase === "climb" || w.phase === "descent") points += w.durationMin * 0.05;
  points += windPoints(f.weather.origin, detail) + windPoints(f.weather.destination, detail);

  const phaseEffect = (i: Intensity): Effect => (i === "none" ? "up" : i === "light" ? "neutral" : "down");
  const factors: RatingFactor[] = [
    { title: "Climb", detail: unperiod(climb.note), effect: phaseEffect(climb.intensity) },
    { title: "Descent", detail: unperiod(descent.note), effect: phaseEffect(descent.intensity) },
    windFactor(f.weather.origin, "departure", detail),
    windFactor(f.weather.destination, "arrival", detail),
  ];
  const windValue = (w: WeatherReport) => (detail ? `${w.windKts} knots${w.gustKts ? `, gusts to ${w.gustKts}` : ""}` : "Not available yet");
  const numbers: Rating["numbers"] = [
    { label: "Climb", value: cap(climb.intensity === "none" ? "smooth" : `${climb.intensity} bumps`) },
    { label: "Descent", value: cap(descent.intensity === "none" ? "smooth" : `${descent.intensity} bumps`) },
    { label: `Wind at ${f.origin.code}`, value: windValue(f.weather.origin) },
    { label: `Wind at ${f.destination.code}`, value: windValue(f.weather.destination) },
    { label: "Weather", value: `${f.weather.origin.label} at ${f.origin.code} · ${f.weather.destination.label} at ${f.destination.code}` },
  ];
  return smoothRating(
    "takeoff_landing",
    approachValue(points),
    "forecast",
    `Based on this week's forecast for ${f.origin.code} and ${f.destination.code}`,
    factors,
    numbers,
  );
}

// ── Aircraft size ───────────────────────────────────────────────────────────

/** The stretched single-aisle types: longer and heavier than their siblings (said in the Size factor; the tier follows the seats). */
const STRETCHED_NARROW_BODIES = new Set(["A321neo", "757-200", "737-900ER"]);
/** A single-aisle jet with at least this many seats in the airline's configuration is a Mid-size jet. */
const MID_SIZE_SEATS = 185;

const SIZE_MEANING: Record<SizeTier, string> = {
  large: "A wide-body jet with two aisles, built for long trips; its size and weight mean it feels the same bumps less than smaller planes.",
  mid: "A larger single-aisle jet, the kind that flies most routes in the world; it feels light bumps a little more than a wide-body, which is normal.",
  smaller: "A single-aisle jet, the everyday workhorse of short and medium routes; light bumps are a little more noticeable on a smaller jet, and just as normal.",
};

/**
 * Cabin noise as a relative band: the dashboard's bands (frontend trust/format.ts cabinNoiseBand)
 * without its "Quieter than most airliners" band below 79 dB, which no catalogue type reaches (the
 * quietest, the A220, is 80 dB). Against the generator's own labels (airlineStats.cabinNoise:
 * "Very quiet" < 80, "Quiet" < 83, else "Average"), every catalogue type under 82 dB is its "Quiet".
 */
function cabinNoiseBand(db: number): { label: string; range: string; quieter: boolean } {
  const centre = Math.round(db);
  const range = `roughly ${centre - 2}–${centre + 2} dB at cruise`;
  return db < 82 ? { label: "A little quieter than average", range, quieter: true } : { label: "About average for an airliner", range, quieter: false };
}

function rateAircraft(f: Flight, availability: Availability): Rating {
  const ac = f.aircraft;
  const wide = ac.bodyType === "wide";
  const tier: SizeTier = wide ? "large" : ac.typicalSeats >= MID_SIZE_SEATS ? "mid" : "smaller";
  const stretched = STRETCHED_NARROW_BODIES.has(ac.model);
  const aisles = ac.seatLayout.split("-").length - 1;
  const noise = cabinNoiseBand(ac.cabinNoiseDb);
  const sizeNote = wide
    ? ""
    : stretched
      ? tier === "mid"
        ? " — the longer version of its family"
        : " — the longer version of its family, fitted with fewer seats here"
      : tier === "mid"
        ? " — more seats than most single-aisle jets"
        : "";
  const factors: RatingFactor[] = [
    {
      title: "Body type",
      detail: wide ? "Wide-body — two aisles and a heavier airframe, which rides through bumps more gently" : "Single aisle — the standard airliner on routes like this",
      effect: wide ? "up" : "neutral",
    },
    {
      title: "Size",
      detail: `${ac.fullName} · about ${ac.typicalSeats} seats in ${ac.seatLayout} rows${sizeNote}`,
      effect: wide ? "up" : "neutral",
    },
    { title: "Cabin noise", detail: `${noise.label} (${noise.range})`, effect: noise.quieter ? "up" : "neutral" },
  ];
  const numbers: Rating["numbers"] = [
    { label: "Seats", value: `About ${ac.typicalSeats}` },
    { label: "Layout", value: `${ac.seatLayout} · ${aisles === 1 ? "one aisle" : "two aisles"}` },
    { label: "In service since", value: String(ac.modelInServiceSince) },
    { label: "Flying worldwide", value: `About ${withCommas(ac.modelFleetSize)}` },
  ];
  if (availability.airframe) numbers.push({ label: "Assigned aircraft", value: `${ac.tailNumber} · delivered ${ac.deliveredYear} (can change)` });
  return {
    category: "aircraft",
    tier,
    label: SIZE_LABELS[tier],
    value: SIZE_VALUE[tier],
    meaning: SIZE_MEANING[tier],
    basis: "aircraft",
    basisText: availability.airframe ? "Based on the assigned aircraft (it can change until departure)" : "Based on the scheduled aircraft",
    factors,
    numbers,
  };
}

// ── Space & quiet ───────────────────────────────────────────────────────────

/** Sunday … Saturday: how a typical load moves with the weekday (airline booking-curve patterns). */
const WEEKDAY_LOAD: readonly number[] = [0.04, 0.01, -0.06, -0.05, 0, 0.04, -0.05];

/** Demand around the US holidays, as a share above or below an ordinary day, by offset from the holiday. */
const THANKSGIVING_DEMAND: Readonly<Record<number, number>> = { [-2]: 0.12, [-1]: 0.25, 0: -0.08, 1: -0.05, 2: 0.06, 3: 0.28, 4: 0.12 };
const LONG_WEEKEND_DEMAND: Readonly<Record<number, number>> = { [-4]: 0.05, [-3]: 0.1, 0: 0.08 };
/** Christmas, New Year and the Fourth of July, by "MM-DD". */
const FIXED_DEMAND: Readonly<Record<string, number>> = {
  "12-18": 0.08, "12-19": 0.12, "12-20": 0.18, "12-21": 0.22, "12-22": 0.22, "12-23": 0.18, "12-24": 0, "12-25": -0.08,
  "12-26": 0.12, "12-27": 0.15, "12-28": 0.15, "12-29": 0.15, "12-30": 0.12, "12-31": -0.05, "01-01": 0.08, "01-02": 0.2,
  "01-03": 0.18, "01-04": 0.1, "01-05": 0.05,
  "07-01": 0.06, "07-02": 0.1, "07-03": 0.12, "07-04": -0.05, "07-05": 0.08, "07-06": 0.05,
};
const WINTER_HOLIDAYS = /^12-(1[89]|2\d|3[01])$|^01-0[1-5]$/;

const pad2 = (n: number) => String(n).padStart(2, "0");

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

/** How much a date's holidays change a typical load, and which holiday (null on an ordinary day). */
function holidayDemand(date: string, touchesUS: boolean): { demand: number; name: string | null } {
  const monthDay = date.slice(5);
  const fixed = FIXED_DEMAND[monthDay] ?? 0;
  const winter = WINTER_HOLIDAYS.test(monthDay);
  if (!touchesUS) return winter ? { demand: fixed / 2, name: "Christmas and New Year" } : { demand: 0, name: null };
  if (fixed !== 0 || winter) return { demand: fixed, name: winter ? "Christmas and New Year" : "the Fourth of July" };
  const { y } = parseISODate(date);
  const offset = (holiday: string) => daysBetween(holiday, date);
  const thanksgiving = THANKSGIVING_DEMAND[offset(nthWeekday(y, 11, 4, 4))];
  if (thanksgiving !== undefined) return { demand: thanksgiving, name: "Thanksgiving" };
  const memorial = LONG_WEEKEND_DEMAND[offset(lastWeekday(y, 5, 1))];
  if (memorial !== undefined) return { demand: memorial, name: "Memorial Day weekend" };
  const labor = LONG_WEEKEND_DEMAND[offset(nthWeekday(y, 9, 1, 1))];
  if (labor !== undefined) return { demand: labor, name: "Labor Day weekend" };
  return { demand: 0, name: null };
}

interface Fullness {
  /** Typical load, 0–1 (a band, never shown as a number). */
  load: number;
  adjust: number;
  /** "Usually fairly full on a Friday evening" */
  phrase: string;
  /** "a typical Friday" | "typical Thanksgiving travel" */
  basis: string;
}

/** A typical fullness for the route and day: weekday, departure hour, holidays and the market. Labelled typical, never a forecast. */
function fullnessFor(f: Flight, geo: RouteGeometry): Fullness {
  const weekday = weekdayIndex(f.input.date);
  const hour = hourOf(f.departTime);
  const hourLoad = hour < 6.5 ? -0.05 : hour < 9.5 ? 0.03 : hour < 16 ? -0.02 : hour < 19 ? 0.03 : hour < 21 ? 0 : -0.06;
  const touchesUS = [f.origin.country, f.destination.country].some((c) => c === "US" || c === "PR");
  const holiday = holidayDemand(f.input.date, touchesUS);
  const marketLoad = geo.market === "long" ? 0.04 : geo.market === "busy" ? 0.03 : 0;
  const load = Math.max(0.55, Math.min(0.97, 0.8 + WEEKDAY_LOAD[weekday] + hourLoad + holiday.demand * 0.4 + marketLoad));
  const band = load < 0.72 ? "usually plenty of open seats" : load < 0.8 ? "usually a few open seats" : load < 0.86 ? "usually fairly full" : "usually very full";
  const adjust = load < 0.72 ? 1 : load < 0.8 ? 0.25 : load < 0.86 ? -0.5 : -1.5;
  const holidayTime = holiday.name !== null && Math.abs(holiday.demand) >= 0.08;
  const when = holidayTime ? `around ${holiday.name}` : todPhrase(WEEKDAYS[weekday], hour);
  return {
    load,
    adjust,
    phrase: `${cap(band)} ${when}`,
    basis: holidayTime ? `typical ${holiday.name} travel` : `a typical ${WEEKDAYS[weekday]}`,
  };
}

/** The benchmark's "1 in below the typical economy seat" in plain words: "1 inch less than the typical economy seat". */
const inchesText = (text: string) =>
  text.replace(/^(\d+(?:\.\d+)?) in (below|above) /, (_, n: string, dir: string) => `${n} ${n === "1" ? "inch" : "inches"} ${dir === "below" ? "less" : "more"} than `);

type Verdict = "better" | "worse" | "about average";

/** The seat in plain words, from both verdicts, so it never says "close to the usual" over a Legroom factor that says less. */
function roomClause(pitch: Verdict, width: Verdict): string {
  if (pitch === "better") return width === "better" ? "a little more legroom and a wider seat than the typical economy cabin" : width === "worse" ? "a little more legroom than usual, with a narrower seat" : "a little more legroom than the typical economy seat";
  if (pitch === "worse") return width === "worse" ? "seats a touch under the typical economy size" : width === "better" ? "a touch less legroom than usual, with a wider seat" : "a touch less legroom than the typical economy seat";
  return width === "better" ? "a slightly wider seat than the typical economy seat" : width === "worse" ? "a slightly narrower seat than the typical economy seat" : "legroom and width close to the usual";
}

/** The one-line meaning, built from the parts that scored (so it never contradicts the factors under it). */
function spaceMeaning(tier: SpaceTier, pitch: Verdict, width: Verdict, roomPoints: number, quieter: boolean, fullness: Fullness): string {
  const room = roomClause(pitch, width);
  if (tier === "roomy_quiet") {
    const parts: string[] = [room];
    if (quieter) parts.push("less engine hum than most");
    if (fullness.adjust >= 1) parts.push("usually plenty of open seats to spread into");
    return `${cap(joinAnd(parts))} — easier to settle in, read or rest.`;
  }
  if (tier === "fuller") {
    const parts: string[] = [];
    if (fullness.adjust <= -0.5) parts.push(uncap(fullness.phrase));
    if (roomPoints < 0) parts.push(room);
    return `A busier cabin than most — ${joinAnd(parts)}; expect more bustle in the aisle and a livelier hum until everyone is settled.`;
  }
  const hum = quieter ? "a little less engine hum than most" : "a normal level of engine hum, which most people stop noticing after takeoff";
  return `A standard economy cabin: ${room} and ${hum}.`;
}

/** Keeps a leading proper noun; otherwise lowercases, so a joined list reads in sentence case. */
const PROPER_AMENITY = /^(Wi-Fi|Swiss|Viennese|Nordic)\b/;

function rateSpace(f: Flight, geo: RouteGeometry): Rating {
  const stats = f.airlineStats;
  const pitch = compareToBenchmark("seatPitchIn", stats.seatPitchIn);
  const width = compareToBenchmark("seatWidthIn", stats.seatWidthIn);
  const noise = cabinNoiseBand(stats.cabinNoiseDb);
  const fullness = fullnessFor(f, geo);
  const verdictPoints = (v: Verdict) => (v === "better" ? 1 : v === "worse" ? -1 : 0);
  const roomPoints = verdictPoints(pitch.verdict) + verdictPoints(width.verdict);
  const noisePoints = noise.quieter ? 0.5 : 0;
  const score = roomPoints + noisePoints + fullness.adjust;
  const tier: SpaceTier = score >= 1.5 ? "roomy_quiet" : score <= -1.5 ? "fuller" : "typical";
  const verdictEffect = (v: Verdict): Effect => (v === "better" ? "up" : v === "worse" ? "down" : "neutral");
  const factors: RatingFactor[] = [
    { title: "Legroom", detail: `${stats.seatPitchIn} inches between rows — ${inchesText(pitch.text)}`, effect: verdictEffect(pitch.verdict) },
    { title: "Seat width", detail: `${stats.seatWidthIn} inches wide — ${inchesText(width.text)}`, effect: verdictEffect(width.verdict) },
    { title: "Cabin noise", detail: `${noise.label} (${noise.range})`, effect: noisePoints > 0 ? "up" : "neutral" },
    {
      title: "Typical fullness",
      detail: `${fullness.phrase} — ${fullness.adjust >= 1 ? "easier to spread out, and a quieter cabin" : fullness.adjust > 0 ? "a calm, ordinary cabin" : fullness.adjust > -1 ? "a normal amount of bustle in the aisle" : "a busier aisle and a livelier hum until everyone is settled"}`,
      effect: fullness.adjust >= 1 ? "up" : fullness.adjust <= -1 ? "down" : "neutral",
    },
  ];
  const numbers: Rating["numbers"] = [
    { label: "Seat pitch", value: `${stats.seatPitchIn} inches · ${inchesText(pitch.text)}` },
    { label: "Seat width", value: `${stats.seatWidthIn} inches · ${inchesText(width.text)}` },
    { label: "Cabin noise", value: `${cap(noise.range)} · ${noise.label.toLowerCase()}` },
    { label: "Typical fullness", value: fullness.phrase },
    { label: "On board", value: stats.amenities.map((a, i) => (i === 0 || PROPER_AMENITY.test(a) ? a : uncap(a))).join(" · ") },
  ];
  return {
    category: "space",
    tier,
    label: SPACE_LABELS[tier],
    value: SPACE_VALUE[tier],
    meaning: spaceMeaning(tier, pitch.verdict, width.verdict, roomPoints, noisePoints > 0, fullness),
    basis: "cabin",
    basisText: `Based on ${possessive(f.airline.name)} cabin and ${fullness.basis}`,
    factors,
    numbers,
  };
}
