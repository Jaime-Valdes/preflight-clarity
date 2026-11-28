/*
 * Checks version D's category ratings (shared/src/ratings.ts) and the airport trait table
 * (shared/src/airportTraits.ts). Run from the repo root:
 *
 *   npx tsx shared/scripts/check-ratings.ts        (also: npm run test -w shared)
 *
 * Determinism, the four categories in order, exact tier wording, the time-aware basis (history
 * weeks out, forecast within TURBULENCE_FORECAST_DAYS, nothing forecast-only shown before that),
 * a sane tier distribution at booking time over ~40 routes × 6 dates, every smooth tier
 * reachable, wide-bodies never rated bumpier than narrow-bodies in the same air, forecast-mode
 * cruise tiers in step with the smoothness score and the moderate cruise window named at its own
 * time, summer mornings never rated bumpier than afternoons at takeoff & landing for the same
 * arrival window, aircraft tiers by the seat count shown (never a Mid-size jet with
 * fewer seats than a Smaller jet on the same day, no fleet age), the booking-time cruise rating on
 * measured route history (shared/src/routeHistory.ts, here a made-up table): its figures shown as
 * the history gives them, a departure in a smoother window never rated below one in a bumpier
 * window, the route-and-season rating where a route has no history, and the history's own rules
 * (neighbouring months, the calmest window, direction, the API contract); one time-of-day word on both smoothness cards, no seat counts in
 * the fullness band, calm copy (no banned words, no exclamation marks, sentence case, plain units),
 * the voice of each basis (a booking-time meaning never says "Expect" or "this flight" and always
 * speaks for the route or the airports at this time of year — usually, often, tend, most — while
 * a forecast meaning predicts, and the two tables differ for every tier), "Nearly all" rather
 * than "About 100%" for the smooth share,
 * the trait table on catalogue codes only and never behind the generator's coastal set and
 * mountain boxes, the helpers (forYouScore, orderByPriorities, parsePriorityOrder, priceRank,
 * tierLabel) and the speed budget (< 50 µs a call, warm). Exits non-zero on any failure.
 */
import {
  APPROACH_CUTS,
  CATEGORY_LABELS,
  CATEGORY_PROMPTS,
  RATING_CATEGORIES,
  forYouScore,
  orderByPriorities,
  parsePriorityOrder,
  priceRank,
  rateFlight,
  tierLabel,
  type Rating,
  type RatingCategory,
  type RatingTier,
  type SmoothTier,
} from "../src/ratings";
import { AIRPORT_TRAITS, airportTraits } from "../src/airportTraits";
import { AIRPORTS, POPULAR_AIRPORT_CODES, getAirport } from "../src/airports";
import { addDays, formatOffset, timeToMinutes } from "../src/dates";
import { COASTAL_AIRPORTS, mountainRangeAt } from "../src/fakeFlight";
import { TURBULENCE_FORECAST_DAYS } from "../src/forecast";
import {
  A,
  AIRPORT_CELLS,
  C,
  CELLS,
  MIN_WINDOW_FLIGHTS,
  WEATHER_CELLS,
  airportFigures,
  WINDOWS,
  WINDOW_LABELS,
  isRouteHistoryDay,
  pairKey,
  routeFigures,
  routeHistoryDay,
  routeHistoryFor,
  shareText,
  windowOf,
  type RouteHistoryDay,
  type RouteHistoryTable,
} from "../src/routeHistory";
import { searchFlights, type FlightOption } from "../src/search";
import type { Flight } from "../src/types";

let failures = 0;
const failed = new Map<string, number>();
function check(ok: boolean, message: string): void {
  if (ok) return;
  failures += 1;
  const kind = message.replace(/^[^:]*: /, "").replace(/[\d.]+/g, "#").slice(0, 70);
  const seen = (failed.get(kind) ?? 0) + 1;
  failed.set(kind, seen);
  if (seen <= 3) console.error(`  FAIL ${message}`);
}
const pct = (n: number, d: number) => `${d > 0 ? Math.round((100 * n) / d) : 0}%`;

// ── Wording (restated here, independently of the module) ────────────────────

const EXPECTED_LABELS: Record<RatingTier, string> = {
  very_smooth: "Very smooth",
  smooth: "Smooth",
  moderate: "Moderate",
  slightly_bumpy: "Slightly bumpy",
  bumpy: "Bumpy",
  large: "Large jet",
  mid: "Mid-size jet",
  smaller: "Smaller jet",
  roomy_quiet: "Roomy and quiet",
  typical: "Typical cabin",
  fuller: "Fuller and livelier",
};
const SMOOTH_TIERS: SmoothTier[] = ["bumpy", "slightly_bumpy", "moderate", "smooth", "very_smooth"];
const SIZE_VALUES: Record<string, number> = { smaller: 0, mid: 2, large: 4 };
const SPACE_VALUES: Record<string, number> = { fuller: 0, typical: 2, roomy_quiet: 4 };

/** Words that never reach a nervous flyer (the calm-copy rule), plus "safe" in any form: ratings are never about safety. */
const BANNED =
  /\b(danger\w*|risk\w*|warning\w*|severe\w*|scared|scary|fear\w*|unsafe|safe|safer|safest|safely|safety|crash\w*|emergenc\w*|alarm\w*|worr(?:y|ies|ied|ying))\b/i;
/** Forecast-only facts that must not appear weeks out: the score, wind speeds, gusts, "this week". */
const FORECAST_ONLY = /\bof 100\b(?! flights)|\d+ (?:kt|knots)\b|gust|this week/i;
const SEAT_COUNT = /\b\d+\s+(open\s+)?seats?\b/i;
/** Units and abbreviations a nervous flyer should never have to decode ("30 in —", "15 kt NW"; not "1,420 in July"). */
const JARGON = /\b\d+ kt\b|\b\d+ in(?= [a-z—·]|$)|\b(?:N|NE|E|SE|S|SW|W|NW) wind\b|\bknots (?:N|NE|E|SE|S|SW|W|NW)\b/;
/** A hemisphere season has no place next to a tropical airport. */
const HEMISPHERE_SEASON = /\b(winter|spring|summer|autumn)\b/i;
/** Items after the first in a joined list start lowercase unless they are proper nouns. */
const PROPER_AMENITY = /^(Wi-Fi|Swiss|Viennese|Nordic)\b/;
/** The seat count from which a single-aisle jet is a Mid-size jet (restated from the module). */
const MID_SIZE_SEATS = 185;
/** Forecast voice — a prediction for this flight — which a booking-time (history) meaning never speaks. */
const PREDICTION = /\bexpect\w*|\bthis flight\b/i;
/** Climatology voice: what flights on the route, or at these airports, usually see at this time of year. */
const CLIMATOLOGY = /\b(usually|often|tends?|most)\b/i;
/** The smooth share from which the forecast sheet says "Nearly all" instead of a percentage (restated from the module). */
const NEARLY_ALL_PCT = 99;
/** A share of 100% is never shown as a figure ("About 100%" reads as over-precise). */
const FULL_SHARE = /\b100%/;

function stringsOf(r: Rating): Array<[string, string]> {
  const out: Array<[string, string]> = [
    ["label", r.label],
    ["meaning", r.meaning],
    ["basisText", r.basisText],
  ];
  r.factors.forEach((f, i) => out.push([`factors[${i}].title`, f.title], [`factors[${i}].detail`, f.detail]));
  r.numbers.forEach((n, i) => out.push([`numbers[${i}].label`, n.label], [`numbers[${i}].value`, n.value]));
  return out;
}

function checkCopy(tag: string, strings: Array<[string, string]>): void {
  for (const [path, value] of strings) {
    const m = BANNED.exec(value);
    check(!m, `${tag}: banned word "${m?.[0]}" at ${path}: "${value}"`);
    check(!value.includes("!"), `${tag}: exclamation mark at ${path}: "${value}"`);
    check(!/undefined|NaN|\[object|null/.test(value), `${tag}: broken text at ${path}: "${value}"`);
    check(value.trim().length > 0, `${tag}: empty text at ${path}`);
    check(/^[A-Z0-9]/.test(value), `${tag}: not sentence case at ${path}: "${value}"`);
    const j = JARGON.exec(value);
    check(!j, `${tag}: jargon "${j?.[0]}" at ${path}: "${value}"`);
    check(!FULL_SHARE.test(value), `${tag}: a 100% share shown as a figure at ${path}: "${value}"`);
  }
}

const numberOf = (r: Rating, label: string) => r.numbers.find((n) => n.label === label)?.value;
/** The word after the last " · " of a number value ("11:25 AM · late-morning" → "late-morning"). */
const todOf = (value: string | undefined) => (value ?? "").slice((value ?? "").lastIndexOf(" · ") + 3);
const hourOf = (hhmm: string) => timeToMinutes(hhmm) / 60;
/** Morning as the takeoff & landing checks define it (before 11). */
const morningWindow = (f: Flight) => hourOf(f.departTime) < 11;
/** The convective window the takeoff & landing rating tapers on (12:00–18:59). */
const convective = (hour: number) => hour >= 12 && hour < 19;
/** The destination's window for the arrival: the convective band and whether it is an early morning, on the arrival day. */
const arrivalWindow = (f: Flight) => {
  const h = hourOf(f.arriveTime);
  const band = convective(h) ? "afternoon" : (h >= 11 && h < 12) || (h >= 19 && h < 21) ? "shoulder" : h < 10 ? "morning" : "off";
  return `${f.arriveDayOffset}|${band}`;
};

checkCopy("category labels", Object.entries(CATEGORY_LABELS));
checkCopy("category prompts", Object.entries(CATEGORY_PROMPTS));
check(JSON.stringify(RATING_CATEGORIES) === JSON.stringify(["cruise", "takeoff_landing", "aircraft", "space"]), "RATING_CATEGORIES order");
check(
  CATEGORY_LABELS.cruise === "Smooth cruise" && CATEGORY_LABELS.takeoff_landing === "Smooth takeoff & landing" && CATEGORY_LABELS.aircraft === "Aircraft size" && CATEGORY_LABELS.space === "Space & quiet",
  "category labels wording",
);
for (const [tier, label] of Object.entries(EXPECTED_LABELS)) {
  const category: RatingCategory = tier in SIZE_VALUES ? "aircraft" : tier in SPACE_VALUES ? "space" : "cruise";
  check(tierLabel(category, tier as RatingTier) === label, `tierLabel(${category}, ${tier}) = "${tierLabel(category, tier as RatingTier)}", expected "${label}"`);
}
check(tierLabel("takeoff_landing", "bumpy") === "Bumpy" && tierLabel("aircraft", "bumpy") === "", "tierLabel off-scale tier is empty");

// ── Trait table: catalogue codes only, and never behind the generator's own geography ──

const TRAITS = new Set(["coastal", "terrain", "hot_afternoon", "exposed"]);
for (const [code, traits] of Object.entries(AIRPORT_TRAITS)) {
  check(Boolean(getAirport(code)), `airportTraits: ${code} is not a catalogue airport`);
  check(traits.length > 0 && traits.length <= 3 && traits.every((t) => TRAITS.has(t)) && new Set(traits).size === traits.length, `airportTraits: ${code} traits ${traits.join(",")}`);
}
check(airportTraits("jfk").includes("coastal") && airportTraits("XXX").length === 0 && airportTraits("CLT").length === 0, "airportTraits lookups");
check(["SFO", "LAX", "DEN", "PHX", "AMS", "SIN"].every((c) => airportTraits(c).length > 0), "the well-known airports have traits");
let generatorCoastal = 0;
let generatorTerrain = 0;
for (const a of AIRPORTS) {
  const traits = airportTraits(a.code);
  const listed = AIRPORT_TRAITS[a.code] ?? [];
  if (COASTAL_AIRPORTS.has(a.code)) {
    generatorCoastal++;
    check(traits.includes("coastal"), `airportTraits: ${a.code} is coastal in the generator but not here`);
    check(listed.includes("coastal"), `airportTraits: ${a.code} is coastal in the generator but the table has no row for it`);
  }
  const range = mountainRangeAt(a.lat, a.lon);
  if (range) {
    generatorTerrain++;
    check(traits.includes("terrain"), `airportTraits: ${a.code} sits in ${range.name} in the generator but has no terrain trait`);
    check(listed.includes("terrain"), `airportTraits: ${a.code} sits in ${range.name} in the generator but the table has no terrain row for it`);
  }
  check(new Set(traits).size === traits.length, `airportTraits: ${a.code} repeats a trait`);
}
check(generatorCoastal >= 40 && generatorTerrain >= 8, `generator geography: ${generatorCoastal} coastal, ${generatorTerrain} in a mountain box`);

// ── The sample ──────────────────────────────────────────────────────────────

const routes: Array<[string, string]> = [];
const pop = POPULAR_AIRPORT_CODES;
for (let i = 0; i < pop.length; i++) for (let j = 0; j < pop.length; j++) if (i !== j && (i + j) % 5 === 2) routes.push([pop[i], pop[j]]);
routes.push(
  // Long-haul and oceanic
  ["JFK", "LHR"], ["SFO", "NRT"], ["LAX", "SYD"], ["JFK", "SIN"], ["LHR", "DXB"], ["MIA", "BOG"],
  // Mountains, high terrain and hot afternoons
  ["DEN", "SFO"], ["SLC", "SEA"], ["DEN", "PHX"], ["LAX", "DEN"], ["ORD", "DEN"], ["DEN", "SLC"], ["SEA", "GEG"], ["LHR", "GVA"], ["MIA", "IAH"], ["ATL", "MCO"],
);
/** Thanksgiving, Christmas Eve, a winter Friday, a spring Saturday, a summer Friday, an autumn Tuesday. */
const DATES = ["2026-11-26", "2026-12-24", "2027-01-15", "2027-04-10", "2027-07-16", "2027-09-21"];
const SUMMER_DATE = "2027-07-16";
const FAR_DAYS = 45;
const northern = (code: string) => (getAirport(code)?.lat ?? 0) > 0;

// ── A made-up route history for the sample's US routes (the real one is measured; see routeHistory.ts) ──

const US = (code: string) => ["US", "PR"].includes(getAirport(code)?.country ?? "");
const hashOf = (text: string) => [...text].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
/** Shares across the sample, roughly as measured (most routes 85–97% smooth, a few livelier). */
const SHARES = [97, 96, 95, 94, 93, 93, 92, 91, 90, 90, 89, 88, 87, 86, 85, 83, 81, 79, 76, 69];
/** Window offsets: a clear morning, a clear evening, or the same all day. */
const PATTERNS = [[0, 5, -5, 0], [0, -4, -2, 6], [0, 0, 0, 0]];
function madeUpCell(pk: string, month: number): number[] {
  const h = hashOf(`${pk}|${month}`);
  const n = 120 + (h % 400);
  const share = SHARES[hashOf(pk) % SHARES.length] / 100;
  const pattern = PATTERNS[h % PATTERNS.length];
  const c = new Array<number>(CELLS).fill(0);
  c[C.n] = n;
  c[C.smooth] = Math.round(n * share);
  c[C.calm] = n - Math.round((n - c[C.smooth]) * 0.25);
  c[C.own] = Math.round(n * 0.3);
  const bumpy = n - c[C.smooth];
  const early = h % 2 === 0 ? Math.round(bumpy * 0.6) : Math.round(bumpy / 3);
  const middle = Math.round((bumpy - early) / 2);
  c[C.where] = early;
  c[C.where + 1] = middle;
  c[C.where + 2] = bumpy - early - middle;
  const weights = [0.05, 0.4, 0.3, 0.25];
  for (const [base, half] of [[C.ab, Math.floor(n / 2)], [C.ba, n - Math.floor(n / 2)]] as const) {
    let left = half;
    weights.forEach((wt, w) => {
      const flights = w === weights.length - 1 ? left : Math.round(half * wt);
      left -= flights;
      c[base + 2 * w] = flights;
      c[base + 2 * w + 1] = Math.max(0, Math.min(flights, Math.round(flights * (share + pattern[w] / 100))));
    });
  }
  return c;
}
const madeUpPairs: RouteHistoryTable["pairs"] = {};
const madeUpTable: RouteHistoryTable = {
  version: 1,
  source: "made up for the checks",
  definition: "made up for the checks",
  months: Array.from({ length: 12 }, (_, i) => `${i < 10 ? 2026 : 2025}-${String(i + 1).padStart(2, "0")}`).sort(),
  national: Array.from({ length: 12 }, () => [20000, 18100, 19500] as const),
  pairs: madeUpPairs,
};
const historyFor = (options: readonly FlightOption[], date: string): RouteHistoryDay => {
  for (const { flight } of options) {
    const pk = pairKey(flight.origin.code, flight.destination.code);
    if (US(flight.origin.code) && US(flight.destination.code) && !madeUpPairs[pk]) madeUpPairs[pk] = Array.from({ length: 12 }, (_, m) => madeUpCell(pk, m));
  }
  return routeHistoryDay(madeUpTable, options.map((o) => [o.flight.origin.code, o.flight.destination.code] as const), date);
};
let measuredFlights = 0;
let byRouteFlights = 0;
let windowPairs = 0;

type Mode = "booking" | "forecast";
const tally = new Map<string, number>();
const bump = (mode: Mode, category: RatingCategory, tier: string) => {
  const key = `${mode}|${category}|${tier}`;
  tally.set(key, (tally.get(key) ?? 0) + 1);
};
const seenTiers: Record<"cruise" | "takeoff_landing", Set<string>> = { cruise: new Set(), takeoff_landing: new Set() };
const blockOf = (time: string) => Math.floor((timeToMinutes(time) - 60) / 120);
const perfInputs: Array<{ option: FlightOption; today: string; history: RouteHistoryDay }> = [];
let routesWithFlights = 0;
let flightsChecked = 0;
let widePairs = 0;
let airframeShown = 0;
let moderateCruise = 0;
let sizePairs = 0;
let summerApproachPairs = 0;
let summerApproachResidual = 0;
let summerApproachResidualBumpier = 0;
let nearlyAllShare = 0;
/** Every meaning seen per "category|basis|tier": one static line each, and a different one per basis. */
const meanings = new Map<string, Set<string>>();
const sampleStart = performance.now();

for (const [o, d] of routes) {
  let served = false;
  for (const date of DATES) {
    const tag = `${o}-${d} ${date}`;
    const { options } = searchFlights({ origin: o, destination: d, date });
    if (options.length === 0) break;
    served = true;
    const history = historyFor(options, date);
    const far = options.map((option) => rateFlight({ option, today: addDays(date, -FAR_DAYS), history }));
    const near = options.map((option) => rateFlight({ option, today: addDays(date, -1), history }));
    options.forEach((option, i) => {
      const f = option.flight;
      const ftag = `${tag} ${option.key}`;
      flightsChecked++;
      if (perfInputs.length < 64) perfInputs.push({ option, today: addDays(date, -FAR_DAYS), history }, { option, today: addDays(date, -1), history });

      for (const [mode, ratings] of [["booking", far[i]], ["forecast", near[i]]] as const) {
        const mtag = `${ftag} (${mode})`;
        check(JSON.stringify(rateFlight({ option, today: addDays(date, mode === "booking" ? -FAR_DAYS : -1), history })) === JSON.stringify(ratings), `${mtag}: not deterministic`);
        check(ratings.length === 4 && ratings.every((r, k) => r.category === RATING_CATEGORIES[k]), `${mtag}: four categories in order`);
        for (const r of ratings) {
          const rtag = `${mtag} ${r.category}`;
          check(r.label === EXPECTED_LABELS[r.tier] && r.label === tierLabel(r.category, r.tier), `${rtag}: label "${r.label}" for tier ${r.tier}`);
          check(Number.isInteger(r.value) && r.value >= 0 && r.value <= 4, `${rtag}: value ${r.value}`);
          if (r.category === "aircraft") check(r.value === SIZE_VALUES[r.tier] && r.basis === "aircraft", `${rtag}: size value / basis`);
          else if (r.category === "space") check(r.value === SPACE_VALUES[r.tier] && r.basis === "cabin", `${rtag}: space value / basis`);
          else {
            check(SMOOTH_TIERS[r.value] === r.tier, `${rtag}: value ${r.value} vs tier ${r.tier}`);
            check(r.basis === (mode === "booking" ? "history" : "forecast"), `${rtag}: basis ${r.basis} ${FAR_DAYS} / 1 days out`);
            seenTiers[r.category].add(r.tier);
          }
          check(r.factors.length >= 2 && r.factors.length <= 4 && r.factors.every((x) => ["up", "down", "neutral"].includes(x.effect)), `${rtag}: ${r.factors.length} factors`);
          check(r.numbers.length >= 2, `${rtag}: ${r.numbers.length} numbers`);
          check(r.meaning.endsWith(".") && r.meaning.split(". ").length <= 2, `${rtag}: meaning "${r.meaning}"`);
          check(r.basisText.startsWith("Based on"), `${rtag}: basisText "${r.basisText}"`);
          // The voice follows the basis: at booking time the line speaks for the route or the airports at this time of year, never for this flight.
          if (r.basis === "history") {
            const p = PREDICTION.exec(r.meaning);
            check(!p, `${rtag}: booking-time meaning says "${p?.[0]}": "${r.meaning}"`);
            check(CLIMATOLOGY.test(r.meaning), `${rtag}: booking-time meaning without usually/often/tend/most: "${r.meaning}"`);
          } else if (r.basis === "forecast") {
            check(/^Expect\b/.test(r.meaning), `${rtag}: forecast meaning does not predict: "${r.meaning}"`);
          }
          if (r.basis === "history" || r.basis === "forecast") {
            const key = `${r.category}|${r.basis}|${r.tier}`;
            meanings.set(key, (meanings.get(key) ?? new Set()).add(r.meaning));
          }
          checkCopy(rtag, stringsOf(r));
          bump(mode, r.category, r.tier);
        }

        // Time-aware: weeks out nothing forecast-only shows; within 2 days the forecast is the basis and names the airports.
        const [cruise, approach, aircraft, space] = ratings;
        const text = ratings.flatMap((r) => stringsOf(r).map(([, v]) => v)).join("\n");
        if (mode === "booking") {
          const m = FORECAST_ONLY.exec(text);
          check(!m, `${mtag}: forecast-only text "${m?.[0]}" ${FAR_DAYS} days out`);
          // Measured where the route has a history (as the history gives it), else the route and the season, said so.
          const h = routeHistoryFor(history, f.origin.code, f.destination.code);
          if (h) {
            measuredFlights++;
            check(cruise.basisText === `Based on flights along this route in ${h.monthWords}`, `${mtag}: cruise basisText "${cruise.basisText}"`);
            check(numberOf(cruise, "Past flights smooth") === shareText(h.smoothPct), `${mtag}: past flights smooth "${numberOf(cruise, "Past flights smooth")}" vs ${h.smoothPct}`);
            check((numberOf(cruise, "Flights counted") ?? "").startsWith(h.flights.toLocaleString("en-US")), `${mtag}: flights counted "${numberOf(cruise, "Flights counted")}" vs ${h.flights}`);
            check(numberOf(cruise, "Calmest time of day") === (h.calmest ? WINDOW_LABELS[h.calmest] : "No clear difference"), `${mtag}: calmest "${numberOf(cruise, "Calmest time of day")}" vs ${h.calmest}`);
            check(cruise.factors[0]?.title === "Flights along this route" && cruise.factors[0].detail.includes(`${h.flights.toLocaleString("en-US")} flights`), `${mtag}: first factor "${cruise.factors[0]?.detail}"`);
            // The rating is the route's share, moved toward this departure's window when it has enough flights.
            const w = h.windows[windowOf(hourOf(f.departTime))];
            const s = w.flights >= MIN_WINDOW_FLIGHTS ? (w.flights * w.smoothPct + MIN_WINDOW_FLIGHTS * h.smoothPct) / (w.flights + MIN_WINDOW_FLIGHTS) : h.smoothPct;
            const expected = s >= 92 ? 4 : s >= 85 ? 3 : s >= 78 ? 2 : s >= 71 ? 1 : 0;
            check(cruise.value === expected, `${mtag}: cruise ${cruise.tier} for a measured ${s.toFixed(1)}%`);
            check((cruise.source ?? "").includes("NOAA MADIS") && ratings.slice(1).every((r) => r.source === undefined), `${mtag}: the source is on the measured cruise rating only`);
          } else {
            byRouteFlights++;
            check(cruise.basisText === "Based on the route and the season · no measured history for this route", `${mtag}: cruise basisText "${cruise.basisText}"`);
            check(numberOf(cruise, "Past flights smooth") === undefined && numberOf(cruise, "Flights counted") === "Too few along this route", `${mtag}: a route figure shown without a history`);
            check(!cruise.factors.some((x) => x.title === "Time of day"), `${mtag}: a time-of-day factor without a history`);
          }
          check(!text.includes(f.aircraft.tailNumber), `${mtag}: tail number ${f.aircraft.tailNumber} shown ${FAR_DAYS} days out`);
          check(!aircraft.numbers.some((n) => n.label === "Assigned aircraft"), `${mtag}: assigned aircraft shown ${FAR_DAYS} days out`);

          // One time-of-day word on both cards, and in the time-of-day factor.
          const departureWord = todOf(numberOf(cruise, "This departure"));
          check(departureWord.length > 0 && departureWord === todOf(numberOf(approach, "Departure")), `${mtag}: cruise says "${departureWord}", takeoff & landing says "${todOf(numberOf(approach, "Departure"))}"`);
          const todFactor = cruise.factors.find((x) => x.title === "Time of day");
          if (h) check(Boolean(todFactor) && (todFactor?.detail ?? "").toLowerCase().startsWith(`${departureWord} departure`), `${mtag}: time-of-day factor "${todFactor?.detail}" vs "${departureWord}"`);
          // By route and season: the route number and the route factor agree on whether the route has a feature.
          if (!h) {
            const route = numberOf(cruise, "Route") ?? "";
            const routeFactor = cruise.factors.find((x) => x.title === "Route");
            check((route === "No particular feature") === (routeFactor?.detail.startsWith("Nothing about the route") ?? false), `${mtag}: route number "${route}" vs route factor "${routeFactor?.detail}"`);
          }

          // Tropical airports: no hemisphere season beside them.
          for (const airport of [f.origin, f.destination]) {
            if (Math.abs(airport.lat) >= 23.5) continue;
            const pattern = numberOf(approach, `${airport.code} pattern`) ?? "";
            check(!HEMISPHERE_SEASON.test(pattern), `${mtag}: "${pattern}" names a season at tropical ${airport.code}`);
          }
        } else {
          check(cruise.basisText === "Based on this week's forecast", `${mtag}: cruise basisText "${cruise.basisText}"`);
          // Forecast-mode cruise agrees with the score.
          const s = f.smoothness.score;
          if (s >= 88) check(cruise.value >= 3, `${mtag}: cruise ${cruise.tier} with a score of ${s}`);
          if (s < 70) check(cruise.value <= 2, `${mtag}: cruise ${cruise.tier} with a score of ${s}`);
          if (aircraft.numbers.some((n) => n.label === "Assigned aircraft")) airframeShown++;
          // A moderate cruise window is named at its own time and length, as the timeline names it.
          const moderate = f.turbulence.windows.find((w) => w.phase === "cruise" && w.intensity === "moderate");
          if (moderate) {
            moderateCruise++;
            const detail = cruise.factors[0]?.detail ?? "";
            check(
              cruise.factors[0]?.title === "Forecast at cruise" && detail.includes(`about ${formatOffset(moderate.startMin)} into the flight`) && detail.includes(`for about ${formatOffset(moderate.durationMin)}`),
              `${mtag}: "${detail}" vs the moderate window at ${formatOffset(moderate.startMin)} for ${formatOffset(moderate.durationMin)}`,
            );
          }
          // The smooth share: "Nearly all" from NEARLY_ALL_PCT (never "About 100%"), else the figure, in the factor and the number alike.
          const share = f.turbulence.smoothMinutesPct;
          const shareFactor = cruise.factors.find((x) => x.title === "Smooth share")?.detail ?? "";
          const shareNumber = numberOf(cruise, "Smooth share of the flight") ?? "";
          const expectedShare = share >= NEARLY_ALL_PCT ? "Nearly all" : `About ${share}%`;
          if (share >= NEARLY_ALL_PCT) nearlyAllShare++;
          check(shareFactor === `${expectedShare} of the time in the air is expected to be smooth`, `${mtag}: smooth share ${share}% as "${shareFactor}"`);
          check(shareNumber === (share >= NEARLY_ALL_PCT ? "Nearly all" : `${share}%`), `${mtag}: smooth share ${share}% in the numbers as "${shareNumber}"`);
        }
        check(approach.basisText.includes(f.origin.code) && approach.basisText.includes(f.destination.code), `${mtag}: takeoff/landing basisText "${approach.basisText}" doesn't name the airports`);

        // Aircraft tier by the seat count the card shows; the stretched types are mid-size, the A220 smaller; no fleet age.
        const model = f.aircraft.model;
        const seats = f.aircraft.typicalSeats;
        const expectedSize = f.aircraft.bodyType === "wide" ? "large" : seats >= MID_SIZE_SEATS ? "mid" : "smaller";
        check(aircraft.tier === expectedSize, `${mtag}: ${model} with ${seats} seats rated ${aircraft.tier}, expected ${expectedSize}`);
        check(numberOf(aircraft, "Seats") === `About ${seats}` && aircraft.factors.some((x) => x.title === "Size" && x.detail.includes(`about ${seats} seats`)), `${mtag}: the seat count shown`);
        check(model !== "A220-300" || aircraft.tier === "smaller", `${mtag}: the A220 is a smaller jet`);
        check(!["A321neo", "757-200"].includes(model) || aircraft.tier === "mid", `${mtag}: ${model} (${seats} seats) is a mid-size jet`);
        check(!/\bage\b|older|newer/i.test(stringsOf(aircraft).map(([, v]) => v).join("\n")), `${mtag}: fleet age in the aircraft rating`);

        // Space: a fullness band, never a seat count; the cabin figures match the flight's, in plain units; the meaning matches the factors.
        const fullness = numberOf(space, "Typical fullness");
        check(Boolean(fullness) && !/\d/.test(fullness ?? "1") && /^Usually /.test(fullness ?? ""), `${mtag}: fullness "${fullness}"`);
        check(!SEAT_COUNT.test(stringsOf(space).map(([, v]) => v).join("\n")), `${mtag}: a seat count in the space rating`);
        check((numberOf(space, "Seat pitch") ?? "").startsWith(`${f.airlineStats.seatPitchIn} inches`), `${mtag}: seat pitch number "${numberOf(space, "Seat pitch")}"`);
        const onBoard = (numberOf(space, "On board") ?? "").split(" · ");
        check(onBoard.length === f.airlineStats.amenities.length && onBoard.slice(1).every((item) => /^[a-z]/.test(item) || PROPER_AMENITY.test(item)), `${mtag}: on board "${onBoard.join(" · ")}"`);
        const legroom = space.factors.find((x) => x.title === "Legroom")?.detail ?? "";
        if (space.tier === "typical") check(!(legroom.includes("less than") && space.meaning.includes("close to the usual")), `${mtag}: "${space.meaning}" vs "${legroom}"`);
        const noiseFactor = space.factors.find((x) => x.title === "Cabin noise")?.detail ?? "";
        if (space.tier !== "fuller") check(/less engine hum/i.test(space.meaning) === noiseFactor.startsWith("A little quieter"), `${mtag}: "${space.meaning}" vs "${noiseFactor}"`);
      }
    });

    // Wide-bodies never rated bumpier at cruise than a narrow-body in the same air (same block), in either mode.
    const byBlock = new Map<number, number[]>();
    options.forEach((o2, i) => byBlock.set(blockOf(o2.flight.departTime), [...(byBlock.get(blockOf(o2.flight.departTime)) ?? []), i]));
    for (const group of byBlock.values()) {
      const wides = group.filter((i) => options[i].flight.aircraft.bodyType === "wide");
      const narrows = group.filter((i) => options[i].flight.aircraft.bodyType === "narrow");
      for (const w of wides) {
        for (const n of narrows) {
          widePairs++;
          check(far[w][0].value >= far[n][0].value, `${tag}: wide-body ${options[w].key} cruise ${far[w][0].tier} below narrow-body ${options[n].key} ${far[n][0].tier} (booking)`);
          check(near[w][0].value >= near[n][0].value, `${tag}: wide-body ${options[w].key} cruise ${near[w][0].tier} below narrow-body ${options[n].key} ${near[n][0].tier} (forecast)`);
        }
      }
    }

    // Within a day, no Mid-size jet shows fewer seats than a Smaller jet.
    const mids = options.filter((_, i) => far[i][2].tier === "mid");
    const smalls = options.filter((_, i) => far[i][2].tier === "smaller");
    for (const m of mids) {
      for (const s of smalls) {
        sizePairs++;
        check(m.flight.aircraft.typicalSeats >= s.flight.aircraft.typicalSeats, `${tag}: mid-size ${m.key} (${m.flight.aircraft.model}, ${m.flight.aircraft.typicalSeats} seats) vs smaller ${s.key} (${s.flight.aircraft.model}, ${s.flight.aircraft.typicalSeats} seats)`);
      }
    }

    // Booking time, measured: on one route, a departure in a window with a higher measured share never rates below one in a lower.
    options.forEach((x, xi) => {
      const hx = routeHistoryFor(history, x.flight.origin.code, x.flight.destination.code);
      const wx = hx?.windows[windowOf(hourOf(x.flight.departTime))];
      if (!hx || !wx || wx.flights < MIN_WINDOW_FLIGHTS) return;
      options.forEach((y, yi) => {
        if (y.flight.origin.code !== x.flight.origin.code || y.flight.destination.code !== x.flight.destination.code) return;
        const wy = hx.windows[windowOf(hourOf(y.flight.departTime))];
        if (wy.flights < MIN_WINDOW_FLIGHTS || wx.smoothPct < wy.smoothPct) return;
        windowPairs++;
        check(far[xi][0].value >= far[yi][0].value, `${tag}: ${x.key} (${wx.window} ${wx.smoothPct}%) cruise ${far[xi][0].tier} below ${y.key} (${wy.window} ${wy.smoothPct}%) ${far[yi][0].tier}`);
      });
    });

    // Summer (booking): a morning departure never rates bumpier than an afternoon one at takeoff & landing when both arrive in the same window.
    if (date === SUMMER_DATE && northern(o) && northern(d)) {
      options.forEach((m, mi) => {
        if (!morningWindow(m.flight)) return;
        options.forEach((a, ai) => {
          if (convective(hourOf(a.flight.departTime))) {
            if (arrivalWindow(m.flight) === arrivalWindow(a.flight)) {
              summerApproachPairs++;
              check(far[mi][1].value >= far[ai][1].value, `${tag}: morning ${m.key} takeoff & landing ${far[mi][1].tier} below afternoon ${a.key} ${far[ai][1].tier} (same arrival window)`);
            } else {
              summerApproachResidual++;
              if (far[mi][1].value < far[ai][1].value) summerApproachResidualBumpier++;
            }
          }
        });
      });
    }
  }
  if (served) routesWithFlights++;
}
const sampleMs = performance.now() - sampleStart;

// Distribution at booking time: sane, and every smooth tier reachable (over both modes).
for (const category of ["cruise", "takeoff_landing"] as const) {
  const count = (mode: Mode, tiers: string[]) => tiers.reduce((n, t) => n + (tally.get(`${mode}|${category}|${t}`) ?? 0), 0);
  const total = count("booking", SMOOTH_TIERS);
  const lively = count("booking", ["slightly_bumpy", "bumpy"]);
  const calm = count("booking", ["very_smooth", "smooth"]);
  check(total > 0 && lively / total <= 0.15, `${category}: ${pct(lively, total)} slightly bumpy or bumpy at booking time (at most 15%)`);
  check(total > 0 && calm / total >= 0.25, `${category}: ${pct(calm, total)} smooth or very smooth at booking time (at least 25%)`);
  for (const tier of SMOOTH_TIERS) check(seenTiers[category].has(tier), `${category}: tier ${tier} never reached in the sample`);
}
check(routesWithFlights >= 35, `only ${routesWithFlights} routes with flights in the sample`);
check(widePairs > 0, "no wide-body / narrow-body pairs in the same air");
check(airframeShown > 0, "the assigned aircraft never shows a day out");
check(moderateCruise > 0, "no moderate cruise window in the sample");
check(sizePairs > 0, "no mid-size / smaller pairs on the same day");
check(summerApproachPairs > 0, `summer pairs: ${summerApproachPairs} takeoff & landing`);
check(measuredFlights > 0 && byRouteFlights > 0 && windowPairs > 0, `booking-time cruise: ${measuredFlights} measured, ${byRouteFlights} by route, ${windowPairs} window pairs`);
check(nearlyAllShare > 0, "no flight with a nearly-all smooth share a day out in the sample");

// One static meaning per category, basis and tier, and never the same line for both bases: a booking-time card never speaks with forecast certainty.
for (const category of ["cruise", "takeoff_landing"] as const) {
  for (const tier of SMOOTH_TIERS) {
    const history = meanings.get(`${category}|history|${tier}`);
    const forecast = meanings.get(`${category}|forecast|${tier}`);
    for (const [basis, set] of [["history", history], ["forecast", forecast]] as const) {
      if (set) check(set.size === 1, `${category} ${tier} (${basis}): ${set.size} different meanings`);
    }
    if (history && forecast) check([...history].every((m) => !forecast.has(m)), `${category} ${tier}: the booking-time meaning is the forecast line: "${[...history][0]}"`);
  }
}

// ── Horizon edges and odd input ─────────────────────────────────────────────

const edge = searchFlights({ origin: "JFK", destination: "LAX", date: "2027-03-10" }).options[0];
const basisAt = (daysUntil: number) => rateFlight({ option: edge, today: addDays("2027-03-10", -daysUntil) })[0].basis;
check(basisAt(TURBULENCE_FORECAST_DAYS + 1) === "history" && basisAt(TURBULENCE_FORECAST_DAYS) === "forecast" && basisAt(0) === "forecast", "basis flips at TURBULENCE_FORECAST_DAYS");
check(rateFlight({ option: edge, today: "" })[0].basis === "history" && rateFlight({ option: edge, today: "not a date" })[1].basis === "history", "an invalid today means booking time");
check(rateFlight({ option: edge, today: "2027-03-11" })[0].basis === "forecast", "a flight that already left rates from its forecast");

// ── Route history (shared/src/routeHistory.ts) ─────────────────────────────

{
  const cell = (n: number, smooth: number, ab: number[], ba: number[], where = [0, 0, 0]): number[] => {
    const c = new Array<number>(CELLS).fill(0);
    c[C.n] = n;
    c[C.smooth] = smooth;
    c[C.calm] = smooth;
    for (let k = 0; k < 3; k++) c[C.where + k] = where[k];
    ab.forEach((v, k) => (c[C.ab + k] = v));
    ba.forEach((v, k) => (c[C.ba + k] = v));
    return c;
  };
  const months = (cells: Record<number, number[]>) => Array.from({ length: 12 }, (_, m) => cells[m + 1] ?? null);
  const t: RouteHistoryTable = {
    version: 1,
    source: "",
    definition: "",
    months: ["2025-12", "2026-01", "2026-02", "2026-07"],
    national: Array.from({ length: 12 }, (_, m) => (m === 6 ? ([0, 0, 0] as const) : ([1000, 900, 980] as const))),
    pairs: {
      // January alone has enough; a clear morning A → B (JFK → LAX), and bumps in the first third going A → B.
      "JFK-LAX": months({ 1: cell(200, 180, [0, 0, 100, 99, 60, 48, 40, 33], [0, 0, 50, 45, 50, 45, 0, 0], [12, 4, 4]) }),
      // February too thin alone (10); with January and March (20 + 5) it reaches 35.
      "BOS-LGA": months({ 1: cell(20, 19, [0, 0, 10, 10, 0, 0, 0, 0], [0, 0, 10, 9, 0, 0, 0, 0]), 2: cell(10, 9, [0, 0, 10, 9, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]), 3: cell(5, 5, [0, 0, 5, 5, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]) }),
      // Never enough.
      "HNL-OGG": months({ 1: cell(10, 6, [0, 0, 10, 6, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]) }),
    },
  };
  const jan = routeFigures(t, "JFK", "LAX", 1);
  check(jan !== null && jan.months.join() === "1" && jan.monthWords === "January" && jan.period === "January 2026" && jan.flights === 200 && jan.smoothPct === 90, `routeFigures JFK→LAX January: ${JSON.stringify(jan)}`);
  check(jan?.calmest === "morning", `the clear morning window A → B is the calmest: ${jan?.calmest}`);
  check(jan?.where === "early", `bumps in the first third A → B are early going A → B: ${jan?.where}`);
  const back = routeFigures(t, "LAX", "JFK", 1);
  check(back?.where === "late" && back.windows[1].flights === 50 && back.calmest === null, `B → A: the thirds flip and its own windows count: ${JSON.stringify(back)}`);
  const feb = routeFigures(t, "LGA", "BOS", 2);
  check(feb !== null && feb.months.join() === "1,2,3" && feb.monthWords === "January–March" && feb.flights === 35, `too few in February alone → January–March: ${JSON.stringify(feb)}`);
  check(routeFigures(t, "BOS", "LGA", 7) === null && routeFigures(t, "HNL", "OGG", 1) === null && routeFigures(t, "JFK", "SFO", 1) === null && routeFigures(t, "JFK", "JFK", 1) === null, "too few flights, no pair or one airport → no figures");
  const dec = routeFigures(t, "JFK", "LAX", 12);
  check(dec !== null && dec.months.join() === "11,12,1" && dec.period === "December 2025–January 2026", `December pools November–January across the year end: ${JSON.stringify(dec?.months)} ${dec?.period}`);
  const day = routeHistoryDay(t, [["JFK", "LAX"], ["HNL", "OGG"], ["JFK", "LAX"]], "2027-01-15");
  check(day.month === 1 && day.from === "2025-12" && day.to === "2026-07" && day.national?.smoothPct === 90 && Object.keys(day.routes).join() === "JFK-LAX,HNL-OGG" && day.routes["HNL-OGG"] === null, `routeHistoryDay: ${JSON.stringify(day).slice(0, 200)}`);
  check(routeHistoryDay(t, [], "2027-07-04").national === null, "a month with no flights has no national figure");
  check(routeHistoryFor(day, "JFK", "LAX")?.flights === 200 && routeHistoryFor(day, "EWR", "LAX") === null && routeHistoryFor(null, "JFK", "LAX") === undefined, "routeHistoryFor");
  check(isRouteHistoryDay(day) && isRouteHistoryDay(JSON.parse(JSON.stringify(day))), "isRouteHistoryDay accepts what routeHistoryDay makes");
  for (const bad of [null, 1, {}, { ...day, month: 13 }, { ...day, routes: { "JFK-LAX": { ...jan, smoothPct: 140 } } }, { ...day, routes: { "JFK-LAX": { ...jan, windows: [] } } }, { ...day, national: { flights: 1 } }]) {
    check(!isRouteHistoryDay(bad), `isRouteHistoryDay accepts ${JSON.stringify(bad)?.slice(0, 80)}`);
  }
  check(shareText(89.6) === "90%" && shareText(99.4) === "99%" && shareText(99.5) === "Nearly all" && shareText(100, true) === "nearly all", "shareText");
  check(WINDOWS.map((_, w) => w).join() === [3, 6, 13, 19].map(windowOf).join() && windowOf(22) === 0 && windowOf(4) === 0 && windowOf(12) === 2 && windowOf(17) === 3, "windowOf");
  // No figures at all (the browser's illustrative day): the route-and-season rating, still labelled.
  const plain = rateFlight({ option: edge, today: addDays("2027-03-10", -FAR_DAYS) })[0];
  check(plain.basisText.endsWith("no measured history for this route") && plain.source === undefined, `no history at all: "${plain.basisText}" (source ${plain.source})`);
}

// ── Takeoff & landing history (shared/src/routeHistory.ts airportFigures; ratings.ts rateApproachMeasured) ──

{
  /** AIRPORT_CELLS from [flights, smooth] per window for departures and arrivals (calm: smooth plus half the rest). */
  const ends = (dep: number[][], arr: number[][]): number[] => {
    const c = new Array<number>(AIRPORT_CELLS).fill(0);
    for (const [base, side] of [[A.dep, dep], [A.arr, arr]] as const)
      side.forEach(([n, sm], w) => {
        c[base + 3 * w] = n;
        c[base + 3 * w + 1] = sm;
        c[base + 3 * w + 2] = sm + Math.floor((n - sm) / 2);
      });
    return c;
  };
  const months = (cells: Record<number, number[]>) => Array.from({ length: 12 }, (_, m) => cells[m + 1] ?? null);
  const gusty = new Array<number>(WEATHER_CELLS).fill(0);
  [[200, 10], [400, 60], [300, 120], [300, 45]].forEach(([h, g], w) => { gusty[4 * w] = h; gusty[4 * w + 1] = g; gusty[4 * w + 2] = Math.round(g / 2); });
  // JFK: takeoffs clearly smoothest in the morning; landings livelier. LAX: calm all day. OGG: nothing measured, weather only.
  const JFK = ends([[10, 8], [200, 170], [120, 30], [150, 60]], [[20, 10], [150, 90], [150, 45], [160, 80]]);
  const LAX = ends([[10, 9], [150, 130], [150, 125], [150, 128]], [[30, 25], [150, 90], [150, 45], [160, 80]]);
  const national = ends([[500, 400], [5000, 4000], [4000, 2400], [4000, 3000]], [[600, 400], [5000, 3500], [5000, 1500], [5000, 3000]]);
  const t: RouteHistoryTable = {
    version: 1,
    source: "",
    definition: "",
    months: ["2026-01", "2026-02"],
    national: Array.from({ length: 12 }, () => [1000, 900, 980] as const),
    pairs: {},
    airports: { JFK: months({ 1: JFK }), LAX: months({ 1: LAX, 2: ends([[0, 0], [5, 5], [5, 5], [5, 5]], [[0, 0], [5, 5], [5, 5], [5, 5]]) }) },
    airportsNational: months({ 1: national, 2: national }),
    weather: { JFK: months({ 1: gusty }), OGG: months({ 1: gusty }) },
  };
  const jfk = airportFigures(t, "JFK", 1);
  check(jfk !== null && jfk.months.join() === "1" && jfk.departures?.flights === 480 && jfk.departures.calmest === "morning" && jfk.arrivals?.flights === 480, `airportFigures JFK January: ${JSON.stringify(jfk?.departures)}`);
  check(jfk?.weather?.[2]?.gustPct === 40 && jfk.weather[1]?.gustPct === 15, `JFK weather by window: ${JSON.stringify(jfk?.weather)}`);
  const laxFeb = airportFigures(t, "LAX", 2);
  check(laxFeb !== null && laxFeb.months.join() === "1,2,3" && (laxFeb.departures?.flights ?? 0) > 450, `too few in February alone → January–March: ${JSON.stringify(laxFeb?.months)}`);
  const ogg = airportFigures(t, "OGG", 1);
  check(ogg !== null && ogg.departures === null && ogg.arrivals === null && ogg.weather !== null, "weather only: no takeoff or landing figures");
  check(airportFigures(t, "SFO", 1) === null && airportFigures({ ...t, airports: undefined }, "JFK", 1) === null, "nothing at the airport, or an older table → null");

  const date = "2027-01-15";
  const today = addDays(date, -FAR_DAYS);
  const opts = searchFlights({ origin: "JFK", destination: "LAX", date }).options;
  const day = routeHistoryDay(t, [["JFK", "LAX"]], date);
  check(isRouteHistoryDay(day) && isRouteHistoryDay(JSON.parse(JSON.stringify(day))) && Object.keys(day.airports ?? {}).join() === "JFK,LAX", `the day carries both airports: ${Object.keys(day.airports ?? {})}`);
  const share = (fig: NonNullable<typeof jfk>["departures"], hour: number) => {
    const w = fig!.windows[windowOf(hour)];
    return w.flights >= MIN_WINDOW_FLIGHTS ? (w.flights * w.smoothPct + MIN_WINDOW_FLIGHTS * fig!.smoothPct) / (w.flights + MIN_WINDOW_FLIGHTS) : fig!.smoothPct;
  };
  const laxJan = airportFigures(t, "LAX", 1)!;
  const byHour: Array<[number, number]> = [];
  for (const option of opts) {
    const f = option.flight;
    const tag = `takeoff & landing JFK→LAX ${f.departTime}`;
    const approach = rateFlight({ option, today, history: day })[1];
    const v = (share(jfk!.departures, hourOf(f.departTime)) * share(laxJan.arrivals, hourOf(f.arriveTime))) / 100;
    const expected = v >= APPROACH_CUTS[0] ? 4 : v >= APPROACH_CUTS[1] ? 3 : v >= APPROACH_CUTS[2] ? 2 : v >= APPROACH_CUTS[3] ? 1 : 0;
    check(approach.value === expected, `${tag}: ${approach.tier} for a measured ${v.toFixed(1)}`);
    check(approach.basisText === "Based on takeoffs from JFK and landings at LAX in January", `${tag}: basisText "${approach.basisText}"`);
    check((approach.source ?? "").includes("NOAA MADIS") && (approach.source ?? "").includes("Iowa Environmental Mesonet") && (approach.definition ?? "").startsWith("A smooth takeoff or landing"), `${tag}: source "${approach.source}"`);
    check(numberOf(approach, "Smooth takeoffs from JFK") === `${shareText(jfk!.departures!.smoothPct)} · 480 departures` && numberOf(approach, "Calmest time to take off from JFK") === WINDOW_LABELS.morning, `${tag}: numbers ${JSON.stringify(approach.numbers)}`);
    check(approach.factors.some((x) => x.title === "Wind near the ground" && x.detail.includes("% of") && x.detail.includes("hours at JFK")), `${tag}: a wind factor from JFK's reports`);
    check(!approach.numbers.some((n) => n.label.endsWith(" pattern")), `${tag}: the traits model beside measured figures`);
    checkCopy(tag, stringsOf(approach));
    byHour.push([v, approach.value]);
  }
  // On one route, a flight with a higher chance of two smooth ends never rates below one with a lower.
  for (const [a, va] of byHour) for (const [b, vb] of byHour) if (a > b) check(va >= vb, `takeoff & landing: ${a.toFixed(1)} rated ${va}, ${b.toFixed(1)} rated ${vb}`);
  check(new Set(byHour.map(([, v]) => v)).size >= 2, `the time of day moves JFK→LAX takeoff & landing: ${byHour.map(([, v]) => v).join()}`);

  // An airport with too few: US airports overall, said so; an older table (no airports): the traits model.
  const ho = searchFlights({ origin: "JFK", destination: "OGG", date }).options[0] ?? searchFlights({ origin: "LAX", destination: "OGG", date }).options[0];
  if (ho) {
    const hoDay = routeHistoryDay(t, [[ho.flight.origin.code, "OGG"]], date);
    const r = rateFlight({ option: ho, today, history: hoDay })[1];
    check(r.basisText.endsWith("too few measured at OGG, so US airports overall there") && (numberOf(r, "Smooth landings at OGG") ?? "").startsWith("Too few at OGG"), `OGG falls back to US airports: "${r.basisText}" / ${numberOf(r, "Smooth landings at OGG")}`);
    checkCopy("takeoff & landing → OGG", stringsOf(r));
  } else check(false, "no flight to OGG in the generator");
  const older = rateFlight({ option: opts[0], today, history: routeHistoryDay({ ...t, airports: undefined, airportsNational: undefined, weather: undefined }, [["JFK", "LAX"]], date) })[1];
  check(older.source === undefined && older.numbers.some((n) => n.label === "JFK pattern"), `no airport figures: the traits model, unlabelled as measured (${older.basisText})`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const stub = (category: RatingCategory, value: number): Rating => ({
  category,
  tier: "moderate",
  label: "Moderate",
  value,
  meaning: "Stub.",
  basis: "history",
  basisText: "Based on a stub",
  factors: [],
  numbers: [],
});
const setA = [stub("cruise", 4), stub("takeoff_landing", 2), stub("aircraft", 2), stub("space", 0)];
const setB = [stub("cruise", 0), stub("takeoff_landing", 2), stub("aircraft", 2), stub("space", 4)];
const cruiseFirst: RatingCategory[] = ["cruise", "takeoff_landing", "aircraft", "space"];
const spaceFirst: RatingCategory[] = ["space", "aircraft", "takeoff_landing", "cruise"];
check(forYouScore(setA, cruiseFirst) > forYouScore(setB, cruiseFirst), "forYouScore prefers the top category (cruise first)");
check(forYouScore(setB, spaceFirst) > forYouScore(setA, spaceFirst), "forYouScore prefers the top category (space first)");
check(forYouScore(setA, cruiseFirst) === 4 * 4 + 3 * 2 + 2 * 2 + 1 * 0, `forYouScore weights 4,3,2,1: ${forYouScore(setA, cruiseFirst)}`);
check(forYouScore(setA, ["space"]) === 4 * 0 + 1 * 4 + 1 * 2 + 1 * 2, `forYouScore: unlisted categories weigh 1 (${forYouScore(setA, ["space"])})`);
check(forYouScore(setA, []) === 4 + 2 + 2 + 0, "forYouScore with no order is the plain sum");
check(orderByPriorities(setA, spaceFirst).map((r) => r.category).join(",") === "space,aircraft,takeoff_landing,cruise", "orderByPriorities");
check(orderByPriorities(setA, ["space"]).map((r) => r.category).join(",") === "space,cruise,takeoff_landing,aircraft", "orderByPriorities: the rest follow in the default order");
check(orderByPriorities(setA, spaceFirst) !== setA && setA[0].category === "cruise", "orderByPriorities returns a copy");

check(JSON.stringify(parsePriorityOrder(spaceFirst)) === JSON.stringify(spaceFirst), "parsePriorityOrder accepts a valid array");
check(JSON.stringify(parsePriorityOrder("space, aircraft,takeoff_landing,cruise")) === JSON.stringify(spaceFirst), "parsePriorityOrder accepts a comma-separated string");
for (const bad of [null, undefined, 42, "", "cruise", ["cruise"], ["cruise", "cruise", "space", "aircraft"], [...cruiseFirst, "space"], ["cruise", "space", "aircraft", "pilots"], "cruise,space,aircraft,takeoff_landing,extra", [1, 2, 3, 4], {}]) {
  check(parsePriorityOrder(bad) === null, `parsePriorityOrder accepts ${JSON.stringify(bad)}`);
}

check(priceRank([100, 120, 100, 150], 100) === 1 && priceRank([100, 120, 100, 150], 120) === 3 && priceRank([100, 120, 100, 150], 150) === 4, "priceRank");
check(priceRank([], 99) === 1 && priceRank([50], 40) === 1, "priceRank edge cases");

// ── Speed ───────────────────────────────────────────────────────────────────

for (let i = 0; i < 1000; i++) rateFlight(perfInputs[i % perfInputs.length]);
const perfStart = performance.now();
const CALLS = 2000;
for (let i = 0; i < CALLS; i++) rateFlight(perfInputs[i % perfInputs.length]);
const perCallUs = ((performance.now() - perfStart) / CALLS) * 1000;
check(perCallUs < 50, `rateFlight averages ${perCallUs.toFixed(1)} µs a call (budget 50 µs)`);

// ── Summary ─────────────────────────────────────────────────────────────────

const line = (mode: Mode, category: RatingCategory, tiers: string[]) =>
  tiers.map((t) => `${t.replace("_", " ")} ${pct(tally.get(`${mode}|${category}|${t}`) ?? 0, tiers.reduce((n, x) => n + (tally.get(`${mode}|${category}|${x}`) ?? 0), 0))}`).join(" · ");
console.log(`Sample: ${routesWithFlights} routes × ${DATES.length} dates · ${flightsChecked} flights rated twice (${FAR_DAYS} days out and a day out) in ${(sampleMs / 1000).toFixed(1)} s · ${widePairs} wide/narrow pairs in the same air`);
console.log(`Cruise · booking ${line("booking", "cruise", [...SMOOTH_TIERS].reverse())}`);
console.log(`Cruise · forecast ${line("forecast", "cruise", [...SMOOTH_TIERS].reverse())}`);
console.log(`Takeoff & landing · booking ${line("booking", "takeoff_landing", [...SMOOTH_TIERS].reverse())}`);
console.log(`Takeoff & landing · forecast ${line("forecast", "takeoff_landing", [...SMOOTH_TIERS].reverse())}`);
console.log(`Aircraft · ${line("booking", "aircraft", ["large", "mid", "smaller"])}`);
console.log(`Space & quiet · ${line("booking", "space", ["roomy_quiet", "typical", "fuller"])}`);
console.log(`Booking-time cruise · ${measuredFlights} flights on measured history, ${byRouteFlights} by route and season · ${windowPairs} same-route window pairs`);
console.log(`Summer mornings vs afternoons · ${summerApproachPairs} takeoff & landing pairs with the same arrival window; of the ${summerApproachResidual} with different arrival windows, ${summerApproachResidualBumpier} rate the morning bumpier`);
console.log(`Mid-size vs smaller jets on the same day · ${sizePairs} pairs · ${moderateCruise} moderate cruise windows a day out · ${nearlyAllShare} nearly-all smooth shares a day out`);
console.log(`Meaning lines · ${[...meanings.keys()].filter((k) => k.includes("|history|")).length} booking-time and ${[...meanings.keys()].filter((k) => k.includes("|forecast|")).length} forecast category/tier lines seen, each in its own voice`);
console.log(`Trait table · ${Object.keys(AIRPORT_TRAITS).length} airports (${generatorCoastal} coastal and ${generatorTerrain} in a mountain box in the generator)`);
console.log(`Speed · rateFlight ${perCallUs.toFixed(1)} µs a call, warm (${CALLS} calls)`);

if (failures > 0) {
  console.error(`\n${failures} rating check(s) failed.`);
  process.exit(1);
}
console.log("\nRating checks passed.");
