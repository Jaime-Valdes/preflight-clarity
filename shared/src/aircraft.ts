/*
 * Aircraft catalog: mainstream Airbus and Boeing models with calm, factual
 * facts. The 737 MAX family and small regional jets are deliberately absent
 * (anxious flyers avoid them, and they would confound the test).
 */
import type { Aircraft, BodyType } from "./types";
import type { Rng } from "./random";
import { round1 } from "./random";

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
  cabinNoiseDb: number;
  cruiseAltitudeFt: number;
  cruiseSpeedMph: number;
  /** Practical maximum stage length in miles, used to keep pairings plausible. */
  rangeMi: number;
  /** Economy seat width used by the airline-comfort stats. */
  seatWidthIn: number;
  safetyRecord: string[];
}

const COMMON_FACTS = [
  "Inspected by the pilots and ground engineers before every flight",
  "Monitored in real time by the airline's maintenance control center",
];

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
    cabinNoiseDb: 76,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 530,
    rangeMi: 3400,
    seatWidthIn: 18.5,
    safetyRecord: [
      "One of the newest airliner designs flying, in service since 2016",
      "Modern fly-by-wire flight controls smooth out small bumps automatically",
      "Quiet geared-turbofan engines — among the quietest cabins in the sky",
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
    cabinNoiseDb: 78,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 520,
    rangeMi: 3500,
    seatWidthIn: 18,
    safetyRecord: [
      "The newest version of the A320 family, the most widely flown airliner in the world",
      "In service since 2016 with more than 100 airlines",
      "Modern fly-by-wire flight controls smooth out small bumps automatically",
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
    cabinNoiseDb: 78,
    cruiseAltitudeFt: 36000,
    cruiseSpeedMph: 520,
    rangeMi: 4000,
    seatWidthIn: 18,
    safetyRecord: [
      "The longest member of the A320 family, in service since 2017",
      "Flown by more than 80 airlines on short and medium routes",
      "Modern fly-by-wire flight controls smooth out small bumps automatically",
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
    cabinNoiseDb: 82,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 525,
    rangeMi: 3000,
    seatWidthIn: 17,
    safetyRecord: [
      "One of the most widely flown airliners ever built, in service since 1998",
      "Thousands in daily service with airlines on every continent",
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
    cabinNoiseDb: 82,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 525,
    rangeMi: 3200,
    seatWidthIn: 17,
    safetyRecord: [
      "The longest version of the 737 Next Generation family, in service since 2007",
      "Shares its proven wing, engines and systems with the 737-800",
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
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 530,
    rangeMi: 4000,
    seatWidthIn: 17.5,
    safetyRecord: [
      "A pilot favorite, known for its powerful engines and strong climb",
      "Decades of service on transcontinental and transatlantic routes",
      "Regularly updated with modern avionics and cabins",
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
    cabinNoiseDb: 77,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 560,
    rangeMi: 8000,
    seatWidthIn: 18,
    safetyRecord: [
      "The newest version of the A330 family, in service since 2018",
      "Builds on more than 25 years of A330 service with over 100 airlines",
      "Modern fly-by-wire flight controls and new, quieter engines",
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
    cabinNoiseDb: 75,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 9700,
    seatWidthIn: 18,
    safetyRecord: [
      "In service since 2015 with more than 30 airlines",
      "Its wing flexes and adjusts automatically to smooth out bumps",
      "One of the quietest cabins flying, with a lower cabin altitude for easier breathing",
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
    cabinNoiseDb: 75,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 9700,
    seatWidthIn: 18,
    safetyRecord: [
      "The largest A350, in service since 2018 on the world's longest routes",
      "Its wing flexes and adjusts automatically to smooth out bumps",
      "One of the quietest cabins flying, with a lower cabin altitude for easier breathing",
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
    cabinNoiseDb: 80,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 530,
    rangeMi: 6200,
    seatWidthIn: 18,
    safetyRecord: [
      "A long-serving wide-body on transatlantic routes since 1988",
      "A roomy 2-3-2 cabin — most seats are a window or an aisle",
      "Regularly updated with modern avionics and cabins",
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
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 560,
    rangeMi: 8500,
    seatWidthIn: 17,
    safetyRecord: [
      "The world's most widely flown long-haul airliner, in service since 2004",
      "Its size and weight make it noticeably steadier in bumpy air",
      "Flown by more than 40 airlines across every ocean",
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
    cabinNoiseDb: 78,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 8800,
    seatWidthIn: 17.2,
    safetyRecord: [
      "In service since 2014 with more than 60 airlines",
      "Gust-smoothing technology senses bumps and adjusts the wings automatically",
      "Larger windows, cleaner air and a lower cabin altitude for easier breathing",
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
    cabinNoiseDb: 78,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 7400,
    seatWidthIn: 17.2,
    safetyRecord: [
      "The largest Dreamliner, in service since 2018",
      "Gust-smoothing technology senses bumps and adjusts the wings automatically",
      "Larger windows, cleaner air and a lower cabin altitude for easier breathing",
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
  const usable = inRange.length > 0 ? inRange : pool;
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

/** Per-airframe facts for one specific plane flying this flight. */
export function buildAircraft(rng: Rng, model: AircraftModel, tailPatterns: readonly string[], flightYear: number): Aircraft {
  const modelAge = flightYear - model.modelInServiceSince;
  const maxAge = Math.max(0.8, Math.min(18, modelAge - 0.2));
  const ageYears = round1(rng.float(0.8, maxAge));
  const deliveredYear = Math.max(model.modelInServiceSince, flightYear - Math.round(ageYears));
  return {
    manufacturer: model.manufacturer,
    model: model.model,
    fullName: model.fullName,
    bodyType: model.bodyType,
    seatLayout: model.seatLayout,
    typicalSeats: model.typicalSeats,
    tailNumber: makeTailNumber(rng, tailPatterns),
    ageYears,
    deliveredYear,
    modelInServiceSince: model.modelInServiceSince,
    modelFleetSize: model.modelFleetSize,
    lastInspectionDaysAgo: rng.int(3, 28),
    lastCheckType: "A-check",
    nextCheckDueDays: rng.int(20, 60),
    maintenanceStatus: "All scheduled checks up to date",
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
