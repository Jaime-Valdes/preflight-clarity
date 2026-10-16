/*
 * Aircraft catalog: mainstream Airbus and Boeing models with calm, factual
 * facts. The 737 MAX family and small regional jets are deliberately absent
 * (anxious flyers avoid them, and they would confound the test).
 *
 * Model facts are public (manufacturers, fleet databases) and phrased as
 * verifiable comparisons, never superlatives or crash statistics. Cabin noise
 * is approximate: measured economy-cabin levels at cruise sit around 80–85 dB(A)
 * and vary by a few dB with the seat (e.g. Zevitas et al. 2018, 200 flights),
 * newer designs a little quieter than older ones of their size.
 * Each airline flies a model in its own cabin configuration (cabinConfigFor):
 * layout, seat count and seat-map geometry are the same on every flight of
 * that airline and model.
 */
import type { Aircraft, BodyType } from "./types";
import type { Rng } from "./random";
import { createRng, round1 } from "./random";

export interface AircraftModel {
  /** Key used in airline fleets, e.g. "A321neo". */
  key: string;
  manufacturer: "Airbus" | "Boeing";
  model: string;
  fullName: string;
  bodyType: BodyType;
  seatLayout: string;
  typicalSeats: number;
  modelInServiceSince: number;
  modelFleetSize: number;
  cruiseAltitudeFt: number;
  cruiseSpeedMph: number;
  /** Practical maximum stage length in miles, used to keep pairings plausible. */
  rangeMi: number;
  /** Year the last passenger example was delivered; absent while the model is still built. */
  productionEnded?: number;
  /** Economy seat width used by the airline-comfort stats. */
  seatWidthIn: number;
  /** Typical economy cabin noise at cruise, dB(A), approximate (see the note above). */
  cabinNoiseDb: number;
  safetyRecord: string[];
}

const COMMON_FACTS = [
  "Inspected by the pilots and ground engineers before every flight",
  "Sends system health messages to engineers on the ground during the flight",
];

/** Fly-by-wire normal law holds the attitude the pilots set; it doesn't remove bumps. */
const FLY_BY_WIRE = "Fly-by-wire flight controls help keep the aircraft steady";

export const AIRCRAFT_MODELS: readonly AircraftModel[] = [
  {
    key: "A220-300",
    manufacturer: "Airbus",
    model: "A220-300",
    fullName: "Airbus A220-300",
    bodyType: "narrow",
    seatLayout: "2-3",
    typicalSeats: 137,
    modelInServiceSince: 2016,
    modelFleetSize: 380,
    cabinNoiseDb: 80,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 530,
    rangeMi: 3400,
    seatWidthIn: 18.5,
    safetyRecord: [
      "A clean-sheet design that entered airline service in 2016",
      FLY_BY_WIRE,
      "Quieter engines and a quieter cabin than older jets of its size",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A320neo",
    manufacturer: "Airbus",
    model: "A320neo",
    fullName: "Airbus A320neo",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 180,
    modelInServiceSince: 2016,
    modelFleetSize: 2100,
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 520,
    rangeMi: 3500,
    seatWidthIn: 18,
    safetyRecord: [
      "The newest version of the A320 family, one of the most widely flown airliner families",
      "In service since 2016 with dozens of airlines around the world",
      FLY_BY_WIRE,
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A321neo",
    manufacturer: "Airbus",
    model: "A321neo",
    fullName: "Airbus A321neo",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 200,
    modelInServiceSince: 2017,
    modelFleetSize: 1600,
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 36000,
    cruiseSpeedMph: 520,
    rangeMi: 4000,
    seatWidthIn: 18,
    safetyRecord: [
      "The longest member of the A320 family, in service since 2017",
      "Flown by dozens of airlines on short and medium routes",
      FLY_BY_WIRE,
      ...COMMON_FACTS,
    ],
  },
  {
    key: "737-800",
    manufacturer: "Boeing",
    model: "737-800",
    fullName: "Boeing 737-800",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 175,
    modelInServiceSince: 1998,
    modelFleetSize: 4400,
    cabinNoiseDb: 84,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 525,
    rangeMi: 3000,
    productionEnded: 2020,
    seatWidthIn: 17,
    safetyRecord: [
      "One of the most widely flown airliners ever built, in service since 1998",
      "Thousands in daily service with airlines on six continents",
      "A mature, well-understood design with decades of refinement",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "737-900ER",
    manufacturer: "Boeing",
    model: "737-900ER",
    fullName: "Boeing 737-900ER",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 178,
    modelInServiceSince: 2007,
    modelFleetSize: 500,
    cabinNoiseDb: 84,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 525,
    rangeMi: 3200,
    productionEnded: 2019,
    seatWidthIn: 17,
    safetyRecord: [
      "The longest version of the 737 Next Generation family, in service since 2007",
      "Shares its wing, engines and systems with the 737-800",
      "A mature, well-understood design with decades of refinement",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "757-200",
    manufacturer: "Boeing",
    model: "757-200",
    fullName: "Boeing 757-200",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 199,
    modelInServiceSince: 1983,
    modelFleetSize: 300,
    cabinNoiseDb: 85,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 530,
    rangeMi: 4000,
    productionEnded: 2004,
    seatWidthIn: 17.5,
    safetyRecord: [
      "Known for its powerful engines and strong climb",
      "Decades of service on transcontinental and transatlantic routes",
      "Its cabins and flight-deck systems have been updated over the years",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A330-900neo",
    manufacturer: "Airbus",
    model: "A330-900neo",
    fullName: "Airbus A330-900neo",
    bodyType: "wide",
    seatLayout: "2-4-2",
    typicalSeats: 287,
    modelInServiceSince: 2018,
    modelFleetSize: 170,
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 560,
    rangeMi: 8000,
    seatWidthIn: 18,
    safetyRecord: [
      "The newest version of the A330 family, in service since 2018",
      "Builds on more than 30 years of A330 service with airlines worldwide",
      "Fly-by-wire flight controls, and quieter engines than earlier A330s",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A350-900",
    manufacturer: "Airbus",
    model: "A350-900",
    fullName: "Airbus A350-900",
    bodyType: "wide",
    seatLayout: "3-3-3",
    typicalSeats: 325,
    modelInServiceSince: 2015,
    modelFleetSize: 560,
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 9700,
    seatWidthIn: 18,
    safetyRecord: [
      "In service since 2015 with more than 30 airlines",
      FLY_BY_WIRE,
      "A lower cabin altitude than older jets, for easier breathing",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A350-1000",
    manufacturer: "Airbus",
    model: "A350-1000",
    fullName: "Airbus A350-1000",
    bodyType: "wide",
    seatLayout: "3-3-3",
    typicalSeats: 369,
    modelInServiceSince: 2018,
    modelFleetSize: 100,
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 9700,
    seatWidthIn: 18,
    safetyRecord: [
      "The largest A350, in service since 2018 on long-haul routes",
      FLY_BY_WIRE,
      "A lower cabin altitude than older jets, for easier breathing",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "767-300ER",
    manufacturer: "Boeing",
    model: "767-300ER",
    fullName: "Boeing 767-300ER",
    bodyType: "wide",
    seatLayout: "2-3-2",
    typicalSeats: 218,
    modelInServiceSince: 1988,
    modelFleetSize: 250,
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 530,
    rangeMi: 6200,
    productionEnded: 2014,
    seatWidthIn: 18,
    safetyRecord: [
      "A long-serving wide-body on transatlantic routes since 1988",
      "A 2-3-2 economy cabin — six of every seven seats are a window or an aisle",
      "Its cabins and flight-deck systems have been updated over the years",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "777-300ER",
    manufacturer: "Boeing",
    model: "777-300ER",
    fullName: "Boeing 777-300ER",
    bodyType: "wide",
    seatLayout: "3-4-3",
    typicalSeats: 368,
    modelInServiceSince: 2004,
    modelFleetSize: 830,
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 560,
    rangeMi: 8500,
    // Passenger 777-300ERs stopped being built in the early 2020s (the line went on with freighters and the 777X).
    productionEnded: 2022,
    seatWidthIn: 17,
    safetyRecord: [
      "One of the most widely flown long-haul airliners, in service since 2004",
      "Its size and weight mean it usually feels the same bumps a little less than smaller jets",
      "Flown by dozens of airlines across the world's oceans",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "787-9",
    manufacturer: "Boeing",
    model: "787-9",
    fullName: "Boeing 787-9 Dreamliner",
    bodyType: "wide",
    seatLayout: "3-3-3",
    typicalSeats: 290,
    modelInServiceSince: 2014,
    modelFleetSize: 650,
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 9100,
    seatWidthIn: 17.2,
    safetyRecord: [
      "In service since 2014 with dozens of airlines",
      "Its flight controls are designed to sense gusts and soften the motion",
      "Larger windows than older jets, and a lower cabin altitude for easier breathing",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "787-10",
    manufacturer: "Boeing",
    model: "787-10",
    fullName: "Boeing 787-10 Dreamliner",
    bodyType: "wide",
    seatLayout: "3-3-3",
    typicalSeats: 330,
    modelInServiceSince: 2018,
    modelFleetSize: 120,
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 7400,
    seatWidthIn: 17.2,
    safetyRecord: [
      "The largest Dreamliner, in service since 2018",
      "Its flight controls are designed to sense gusts and soften the motion",
      "Larger windows than older jets, and a lower cabin altitude for easier breathing",
      ...COMMON_FACTS,
    ],
  },
];

const BY_KEY = new Map(AIRCRAFT_MODELS.map((m) => [m.key, m]));

export function getAircraftModel(key: string): AircraftModel | undefined {
  return BY_KEY.get(key);
}

/**
 * Picks a model from the airline's fleet that fits the route: narrow-bodies
 * on short hops, mostly narrow with some wide-bodies on long domestic legs,
 * and always a wide-body on oceanic or very long routes.
 */
export function chooseAircraftModel(
  rng: Rng,
  fleetKeys: readonly string[],
  distanceMi: number,
  oceanic: boolean,
): AircraftModel {
  const fleet = fleetKeys.map((k) => BY_KEY.get(k)).filter((m): m is AircraftModel => Boolean(m));
  const pool = fleet.length > 0 ? fleet : AIRCRAFT_MODELS;
  const inRange = pool.filter((m) => m.rangeMi >= distanceMi);
  // Beyond every model's range, only the fleet's longest-legged jets are believable.
  const longest = pool.reduce((max, m) => Math.max(max, m.rangeMi), 0);
  const usable = inRange.length > 0 ? inRange : pool.filter((m) => m.rangeMi === longest);
  const narrow = usable.filter((m) => m.bodyType === "narrow");
  const wide = usable.filter((m) => m.bodyType === "wide");

  let candidates: AircraftModel[];
  if (oceanic || distanceMi >= 2800) {
    candidates = wide.length > 0 ? wide : narrow;
  } else if (distanceMi < 700) {
    candidates = narrow.length > 0 ? narrow : wide;
  } else {
    const wantWide = wide.length > 0 && (narrow.length === 0 || (distanceMi >= 1800 && rng.chance(0.25)));
    candidates = wantWide ? wide : narrow.length > 0 ? narrow : wide;
  }

  // The 757 and 767 are older designs: keep them rare.
  const weighted = candidates.map((m): [AircraftModel, number] => [
    m,
    m.key === "757-200" ? 0.35 : m.key === "767-300ER" ? 0.5 : 1,
  ]);
  return rng.weighted(weighted);
}

/** Longest route any model in this fleet can fly. */
export function fleetMaxRangeMi(fleetKeys: readonly string[]): number {
  return fleetKeys.reduce((max, k) => Math.max(max, BY_KEY.get(k)?.rangeMi ?? 0), 0);
}

/** Expands a registration pattern: "#" → digit (never a leading zero), "L" → letter. */
export function makeTailNumber(rng: Rng, patterns: readonly string[]): string {
  const pattern = patterns.length > 0 ? rng.pick(patterns) : "N###XX";
  let out = "";
  let firstDigit = true;
  for (const ch of pattern) {
    if (ch === "#") {
      out += String(firstDigit ? rng.int(1, 9) : rng.int(0, 9));
      firstDigit = false;
    } else if (ch === "L") {
      out += String.fromCharCode(65 + rng.int(0, 25));
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * An airline's fleet of one model: youngest and oldest airframe and the
 * average age (fleet databases publish these, so they are known any time).
 * Deterministic per airline, model and year.
 */
export function fleetAgesFor(airlineCode: string, model: AircraftModel, flightYear: number): { avg: number; min: number; max: number } {
  const rng = createRng(`fleet|${airlineCode}|${model.key}|${flightYear}`);
  const modelAge = flightYear - model.modelInServiceSince;
  // Nothing newer than the last one built, nothing older than the type; lines that stopped being built
  // keep flying airframes from most of their production run (airlines retire them at around 25–30 years).
  const youngest = model.productionEnded === undefined ? 0.8 : Math.max(0.8, flightYear - model.productionEnded);
  const oldest = Math.max(youngest + 0.5, Math.min(model.productionEnded === undefined ? 18 : Math.min(youngest + 18, 30), modelAge - 0.2));
  // Each airline's deliveries cover part of the model's life.
  const min = round1(rng.float(youngest, youngest + Math.min(2, (oldest - youngest) / 3)));
  const max = round1(Math.max(min + 0.5, oldest - rng.float(0, (oldest - min) * 0.4)));
  const avg = round1(min + (max - min) * rng.float(0.35, 0.6));
  return { avg, min, max };
}

// ── Cabin configuration (per airline and model) ─────────────────────────────

/**
 * How one airline fits out one model (its subfleet's seat map, as airline and
 * GDS seat maps publish it). Every flight of that airline and model shows the
 * same configuration; only which seats are unavailable changes per flight.
 */
export interface CabinConfig {
  /** Economy layout, e.g. "3-3-3". */
  seatLayout: string;
  /** About how many seats in all cabins. */
  typicalSeats: number;
  /** Economy seat width, inches. */
  seatWidthIn: number;
  /** Economy rows on the seat map, in order (row 13 left out where the airline skips it). */
  rowNumbers: readonly number[];
  /** Indexes into rowNumbers of the first and last row over the wing. */
  wingFirstIndex: number;
  wingLastIndex: number;
  /** Emergency-exit rows (all over the wing). */
  exitRows: readonly number[];
}

/** Airlines that fit a model with a layout other than the usual one (economy). */
const LAYOUT_BY_AIRLINE: Record<string, Record<string, { seatLayout: string; seatWidthIn: number }>> = {
  // Japan Airlines: 9-abreast 777-300ERs and 8-abreast 787-9s.
  JL: { "777-300ER": { seatLayout: "3-3-3", seatWidthIn: 18.5 }, "787-9": { seatLayout: "2-4-2", seatWidthIn: 18.5 } },
};

const seatsAbreast = (layout: string) => layout.split("-").reduce((n, g) => n + Number(g), 0);

const CABINS = new Map<string, CabinConfig>();

/** The airline's cabin configuration for a model. Deterministic and cached. */
export function cabinConfigFor(airlineCode: string, model: AircraftModel): CabinConfig {
  const key = `${airlineCode}|${model.key}`;
  const hit = CABINS.get(key);
  if (hit) return hit;

  const rng = createRng(`cabin|${key}`);
  const override = LAYOUT_BY_AIRLINE[airlineCode]?.[model.key];
  const seatLayout = override?.seatLayout ?? model.seatLayout;
  const abreast = seatsAbreast(seatLayout) / seatsAbreast(model.seatLayout);
  const typicalSeats = Math.round(model.typicalSeats * abreast * rng.float(0.93, 1.07));

  const narrow = model.bodyType === "narrow";
  const rowCount = narrow ? rng.int(18, 26) : rng.int(20, 28);
  const firstRow = narrow ? rng.int(7, 12) : rng.int(24, 32);
  // Row numbering is an airline-wide habit.
  const skip13 = createRng(`rows|${airlineCode}`).chance(0.5);
  const rowNumbers: number[] = [];
  for (let r = firstRow; rowNumbers.length < rowCount; r++) {
    if (skip13 && r === 13) continue;
    rowNumbers.push(r);
  }

  const wingFirstIndex = Math.round(rowCount * 0.35);
  const wingLastIndex = Math.round(rowCount * 0.6);
  // Narrow-bodies: one or two overwing exit rows; wide-bodies: a door exit at the wing, often a second further back.
  const exitRows = narrow
    ? [rowNumbers[wingFirstIndex + 1], ...(rng.chance(0.7) ? [rowNumbers[wingFirstIndex + 2]] : [])]
    : [rowNumbers[wingFirstIndex], ...(rng.chance(0.5) ? [rowNumbers[wingLastIndex]] : [])];

  const config: CabinConfig = {
    seatLayout,
    typicalSeats,
    seatWidthIn: override?.seatWidthIn ?? model.seatWidthIn,
    rowNumbers,
    wingFirstIndex,
    wingLastIndex,
    exitRows,
  };
  CABINS.set(key, config);
  return config;
}

/**
 * Facts for the plane flying this flight: the model and the airline's cabin
 * configuration and fleet ages (known any time), plus the assigned airframe's
 * tail, age and delivery year (known about a day ahead — AIRFRAME_DAYS).
 */
export function buildAircraft(rng: Rng, model: AircraftModel, airlineCode: string, tailPatterns: readonly string[], flightYear: number): Aircraft {
  const fleet = fleetAgesFor(airlineCode, model, flightYear);
  const cabin = cabinConfigFor(airlineCode, model);
  const ageYears = round1(rng.float(fleet.min, fleet.max));
  const deliveredYear = Math.max(model.modelInServiceSince, flightYear - Math.round(ageYears));
  return {
    manufacturer: model.manufacturer,
    model: model.model,
    fullName: model.fullName,
    bodyType: model.bodyType,
    seatLayout: cabin.seatLayout,
    typicalSeats: cabin.typicalSeats,
    tailNumber: makeTailNumber(rng, tailPatterns),
    ageYears,
    deliveredYear,
    fleetAvgAgeYears: fleet.avg,
    fleetAgeRange: [fleet.min, fleet.max],
    modelInServiceSince: model.modelInServiceSince,
    modelFleetSize: model.modelFleetSize,
    safetyRecord: model.safetyRecord.slice(),
    cabinNoiseDb: model.cabinNoiseDb,
    cruiseAltitudeFt: model.cruiseAltitudeFt,
    cruiseSpeedMph: model.cruiseSpeedMph,
  };
}

/** Economy seat letters grouped by aisle for a layout like "3-3" or "2-4-2". */
export function columnGroupsFor(seatLayout: string): string[][] {
  const LAYOUTS: Record<string, string[][]> = {
    "3-3": [["A", "B", "C"], ["D", "E", "F"]],
    "2-3": [["A", "C"], ["D", "E", "F"]],
    "3-3-3": [["A", "B", "C"], ["D", "E", "F"], ["H", "J", "K"]],
    "2-4-2": [["A", "C"], ["D", "E", "F", "G"], ["H", "K"]],
    "3-4-3": [["A", "B", "C"], ["D", "E", "F", "G"], ["H", "J", "K"]],
    "2-3-2": [["A", "C"], ["D", "E", "F"], ["H", "K"]],
  };
  return (LAYOUTS[seatLayout] ?? LAYOUTS["3-3"]).map((g) => g.slice());
}
