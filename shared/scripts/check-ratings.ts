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
 * time, summer mornings never rated bumpier than afternoons (at cruise, and at takeoff & landing
 * for the same arrival window), aircraft tiers by the seat count shown (never a Mid-size jet with
 * fewer seats than a Smaller jet on the same day, no fleet age), the calmest-slot sentence in
 * step with the generator's slot, one time-of-day word on both smoothness cards, no seat counts in
 * the fullness band, calm copy (no banned words, no exclamation marks, sentence case, plain units),
 * the trait table on catalogue codes only and never behind the generator's coastal set and
 * mountain boxes, the helpers (forYouScore, orderByPriorities, parsePriorityOrder, priceRank,
 * tierLabel) and the speed budget (< 50 µs a call, warm). Exits non-zero on any failure.
 */
import {
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
import { COASTAL_AIRPORTS, mountainRangeAt, routeBestSlot } from "../src/fakeFlight";
import { TURBULENCE_FORECAST_DAYS } from "../src/forecast";
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
const FORECAST_ONLY = /\bof 100\b|\d+ (?:kt|knots)\b|gust|this week/i;
const SEAT_COUNT = /\b\d+\s+(open\s+)?seats?\b/i;
/** Units and abbreviations a nervous flyer should never have to decode ("30 in —", "15 kt NW"; not "1,420 in July"). */
const JARGON = /\b\d+ kt\b|\b\d+ in(?= [a-z—·]|$)|\b(?:N|NE|E|SE|S|SW|W|NW) wind\b|\bknots (?:N|NE|E|SE|S|SW|W|NW)\b/;
/** A hemisphere season has no place next to a tropical airport. */
const HEMISPHERE_SEASON = /\b(winter|spring|summer|autumn)\b/i;
/** Items after the first in a joined list start lowercase unless they are proper nouns. */
const PROPER_AMENITY = /^(Wi-Fi|Swiss|Viennese|Nordic)\b/;
/** The history sentence's leading word → the generator's slot. */
const SLOT_OF_WORD: Record<string, string> = { Morning: "morning", Midday: "midday", Afternoon: "afternoon", "Early-evening": "evening", Evening: "evening", Overnight: "overnight" };
/** The seat count from which a single-aisle jet is a Mid-size jet (restated from the module). */
const MID_SIZE_SEATS = 185;

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
  }
}

const numberOf = (r: Rating, label: string) => r.numbers.find((n) => n.label === label)?.value;
/** The word after the last " · " of a number value ("11:25 AM · late-morning" → "late-morning"). */
const todOf = (value: string | undefined) => (value ?? "").slice((value ?? "").lastIndexOf(" · ") + 3);
const hourOf = (hhmm: string) => timeToMinutes(hhmm) / 60;
/** Morning and afternoon as the generator's departure windows (departWindowOf) define them. */
const morningWindow = (f: Flight) => hourOf(f.departTime) < 11;
const afternoonWindow = (f: Flight) => hourOf(f.departTime) >= 11 && hourOf(f.departTime) < 17;
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

type Mode = "booking" | "forecast";
const tally = new Map<string, number>();
const bump = (mode: Mode, category: RatingCategory, tier: string) => {
  const key = `${mode}|${category}|${tier}`;
  tally.set(key, (tally.get(key) ?? 0) + 1);
};
const seenTiers: Record<"cruise" | "takeoff_landing", Set<string>> = { cruise: new Set(), takeoff_landing: new Set() };
const blockOf = (time: string) => Math.floor((timeToMinutes(time) - 60) / 120);
const perfInputs: Array<{ option: FlightOption; today: string }> = [];
let routesWithFlights = 0;
let flightsChecked = 0;
let widePairs = 0;
let airframeShown = 0;
let moderateCruise = 0;
let sizePairs = 0;
let summerCruisePairs = 0;
let summerApproachPairs = 0;
let summerApproachResidual = 0;
let summerApproachResidualBumpier = 0;
const sampleStart = performance.now();

for (const [o, d] of routes) {
  let served = false;
  for (const date of DATES) {
    const tag = `${o}-${d} ${date}`;
    const { options } = searchFlights({ origin: o, destination: d, date });
    if (options.length === 0) break;
    served = true;
    const far = options.map((option) => rateFlight({ option, today: addDays(date, -FAR_DAYS) }));
    const near = options.map((option) => rateFlight({ option, today: addDays(date, -1) }));
    options.forEach((option, i) => {
      const f = option.flight;
      const ftag = `${tag} ${option.key}`;
      flightsChecked++;
      if (perfInputs.length < 64) perfInputs.push({ option, today: addDays(date, -FAR_DAYS) }, { option, today: addDays(date, -1) });

      for (const [mode, ratings] of [["booking", far[i]], ["forecast", near[i]]] as const) {
        const mtag = `${ftag} (${mode})`;
        check(JSON.stringify(rateFlight({ option, today: addDays(date, mode === "booking" ? -FAR_DAYS : -1) })) === JSON.stringify(ratings), `${mtag}: not deterministic`);
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
          checkCopy(rtag, stringsOf(r));
          bump(mode, r.category, r.tier);
        }

        // Time-aware: weeks out nothing forecast-only shows; within 2 days the forecast is the basis and names the airports.
        const [cruise, approach, aircraft, space] = ratings;
        const text = ratings.flatMap((r) => stringsOf(r).map(([, v]) => v)).join("\n");
        if (mode === "booking") {
          const m = FORECAST_ONLY.exec(text);
          check(!m, `${mtag}: forecast-only text "${m?.[0]}" ${FAR_DAYS} days out`);
          check(cruise.basisText === `Based on past flights on this route in ${f.turbulence.history.month}`, `${mtag}: cruise basisText "${cruise.basisText}"`);
          check(!text.includes(f.aircraft.tailNumber), `${mtag}: tail number ${f.aircraft.tailNumber} shown ${FAR_DAYS} days out`);
          check(!aircraft.numbers.some((n) => n.label === "Assigned aircraft"), `${mtag}: assigned aircraft shown ${FAR_DAYS} days out`);

          // The calmest slot comes from the generator; the history sentence agrees with it, so the wording never falls back.
          const sentence = f.turbulence.history.bestDepartureWindow;
          const word = /^(Morning|Midday|Afternoon|Early-evening|Evening|Overnight) departures/.exec(sentence)?.[1];
          const slot = routeBestSlot(f.input);
          check(word !== undefined && SLOT_OF_WORD[word] === slot, `${mtag}: history sentence "${sentence}" vs the generator's slot ${slot}`);
          const calmest = numberOf(cruise, "Calmest time of day") ?? "";
          check(word !== undefined && calmest.startsWith(word.replace("-", " ")), `${mtag}: calmest time "${calmest}" vs "${word}"`);

          // One time-of-day word on both cards, and in the time-of-day factor.
          const departureWord = todOf(numberOf(cruise, "This departure"));
          check(departureWord.length > 0 && departureWord === todOf(numberOf(approach, "Departure")), `${mtag}: cruise says "${departureWord}", takeoff & landing says "${todOf(numberOf(approach, "Departure"))}"`);
          const todFactor = cruise.factors.find((x) => x.title === "Time of day");
          check(Boolean(todFactor) && (todFactor?.detail ?? "").toLowerCase().startsWith(`${departureWord} departure`), `${mtag}: time-of-day factor "${todFactor?.detail}" vs "${departureWord}"`);
          const route = numberOf(cruise, "Route") ?? "";
          const routeFactor = cruise.factors.find((x) => x.title === "Route");
          check((route === "No particular feature") === (routeFactor === undefined), `${mtag}: route number "${route}" vs route factor "${routeFactor?.detail}"`);

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

    // Summer (booking): a morning departure never rates bumpier than an afternoon one — at cruise, and at takeoff & landing when both arrive in the same window.
    if (date === SUMMER_DATE && northern(o) && northern(d)) {
      options.forEach((m, mi) => {
        if (!morningWindow(m.flight)) return;
        options.forEach((a, ai) => {
          if (afternoonWindow(a.flight)) {
            summerCruisePairs++;
            check(far[mi][0].value >= far[ai][0].value, `${tag}: morning ${m.key} cruise ${far[mi][0].tier} below afternoon ${a.key} ${far[ai][0].tier}`);
          }
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
check(summerCruisePairs > 0 && summerApproachPairs > 0, `summer pairs: ${summerCruisePairs} cruise, ${summerApproachPairs} takeoff & landing`);

// ── Horizon edges and odd input ─────────────────────────────────────────────

const edge = searchFlights({ origin: "JFK", destination: "LAX", date: "2027-03-10" }).options[0];
const basisAt = (daysUntil: number) => rateFlight({ option: edge, today: addDays("2027-03-10", -daysUntil) })[0].basis;
check(basisAt(TURBULENCE_FORECAST_DAYS + 1) === "history" && basisAt(TURBULENCE_FORECAST_DAYS) === "forecast" && basisAt(0) === "forecast", "basis flips at TURBULENCE_FORECAST_DAYS");
check(rateFlight({ option: edge, today: "" })[0].basis === "history" && rateFlight({ option: edge, today: "not a date" })[1].basis === "history", "an invalid today means booking time");
check(rateFlight({ option: edge, today: "2027-03-11" })[0].basis === "forecast", "a flight that already left rates from its forecast");

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
console.log(`Summer mornings vs afternoons · ${summerCruisePairs} cruise pairs · ${summerApproachPairs} takeoff & landing pairs with the same arrival window; of the ${summerApproachResidual} with different arrival windows, ${summerApproachResidualBumpier} rate the morning bumpier`);
console.log(`Mid-size vs smaller jets on the same day · ${sizePairs} pairs · ${moderateCruise} moderate cruise windows a day out`);
console.log(`Trait table · ${Object.keys(AIRPORT_TRAITS).length} airports (${generatorCoastal} coastal and ${generatorTerrain} in a mountain box in the generator)`);
console.log(`Speed · rateFlight ${perCallUs.toFixed(1)} µs a call, warm (${CALLS} calls)`);

if (failures > 0) {
  console.error(`\n${failures} rating check(s) failed.`);
  process.exit(1);
}
console.log("\nRating checks passed.");
