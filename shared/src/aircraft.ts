/*
 * Aircraft catalog: mainstream Airbus and Boeing models with calm, factual
 * facts. The 737 MAX family and small regional jets are deliberately absent
 * from every airline's fleet list (anxious flyers avoid them, and they would
 * confound the test), so the study's generator never draws them; they are in
 * the catalogue (scheduleOnly) because real schedules name them (version D,
 * docs/REAL_DATA.md) and a published flight should show its own type's facts.
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
  /** ICAO type designator, the code published schedules name the type by, e.g. "A21N" (schedule.ts maps it back). */
  icao: string;
  manufacturer: "Airbus" | "Boeing" | "Embraer" | "Bombardier";
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
  /** Only reached through a published schedule (version D): in no airline's fleet list, never drawn by the study's generator. */
  scheduleOnly?: boolean;
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
    icao: "BCS3",
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
    icao: "A20N",
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
    icao: "A21N",
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
    icao: "B738",
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
    icao: "B739",
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
    icao: "B752",
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
    icao: "A339",
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
    icao: "A359",
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
    icao: "A35K",
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
    icao: "B763",
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
    icao: "B77W",
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
    icao: "B789",
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
    icao: "B78X",
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
  // ── Types reached only through a published schedule (version D) ──
  // None is in an airline's fleet list, so the study's generator (and version C's timetables) never
  // draw them; a real schedule that names one shows that type's own facts instead of a stand-in.
  {
    key: "737-700",
    icao: "B737",
    manufacturer: "Boeing",
    model: "737-700",
    fullName: "Boeing 737-700",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 143,
    modelInServiceSince: 1998,
    modelFleetSize: 1000,
    cabinNoiseDb: 84,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 525,
    rangeMi: 3400,
    // The last passenger -700s were delivered in the late 2010s; the line went on with the -800 and the MAX.
    productionEnded: 2017,
    seatWidthIn: 17,
    scheduleOnly: true,
    safetyRecord: [
      "The shorter member of the 737 Next Generation family, in service since 1998",
      "Shares its wing, engines and systems with the 737-800",
      "A mature, well-understood design with decades of refinement",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "737 MAX 8",
    icao: "B38M",
    manufacturer: "Boeing",
    model: "737 MAX 8",
    fullName: "Boeing 737 MAX 8",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 175,
    modelInServiceSince: 2017,
    modelFleetSize: 1700,
    cabinNoiseDb: 82,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 525,
    rangeMi: 4000,
    seatWidthIn: 17,
    scheduleOnly: true,
    safetyRecord: [
      "The newest version of the 737 family, in service since 2017",
      "Quieter, more fuel-efficient engines than the 737-800 it follows",
      "Flown by dozens of airlines on short and medium routes",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "737 MAX 9",
    icao: "B39M",
    manufacturer: "Boeing",
    model: "737 MAX 9",
    fullName: "Boeing 737 MAX 9",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 180,
    modelInServiceSince: 2018,
    modelFleetSize: 300,
    cabinNoiseDb: 82,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 525,
    rangeMi: 4000,
    seatWidthIn: 17,
    scheduleOnly: true,
    safetyRecord: [
      "The longer version of the 737 MAX, in service since 2018",
      "Shares its wing, engines and systems with the 737 MAX 8",
      "In service with airlines in the Americas, Europe and the Middle East",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A319",
    icao: "A319",
    manufacturer: "Airbus",
    model: "A319",
    fullName: "Airbus A319",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 134,
    modelInServiceSince: 1996,
    modelFleetSize: 1100,
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 520,
    rangeMi: 4200,
    productionEnded: 2019,
    seatWidthIn: 18,
    scheduleOnly: true,
    safetyRecord: [
      "The shortest member of the A320 family, in service since 1996",
      "Shares its wing, engines and cockpit with the A320",
      FLY_BY_WIRE,
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A320-200",
    icao: "A320",
    manufacturer: "Airbus",
    model: "A320-200",
    fullName: "Airbus A320-200",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 162,
    modelInServiceSince: 1988,
    modelFleetSize: 4000,
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 520,
    rangeMi: 3500,
    productionEnded: 2021,
    seatWidthIn: 18,
    scheduleOnly: true,
    safetyRecord: [
      "The original A320, in service since 1988 and one of the most widely flown airliners ever built",
      "Thousands in daily service with airlines on six continents",
      FLY_BY_WIRE,
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A321-200",
    icao: "A321",
    manufacturer: "Airbus",
    model: "A321-200",
    fullName: "Airbus A321-200",
    bodyType: "narrow",
    seatLayout: "3-3",
    typicalSeats: 190,
    modelInServiceSince: 1997,
    modelFleetSize: 1500,
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 36000,
    cruiseSpeedMph: 520,
    rangeMi: 3400,
    productionEnded: 2021,
    seatWidthIn: 18,
    scheduleOnly: true,
    safetyRecord: [
      "The longest member of the original A320 family, in service since 1997",
      "Shares its wing, engines and cockpit with the A320",
      FLY_BY_WIRE,
      ...COMMON_FACTS,
    ],
  },
  {
    key: "777-200ER",
    icao: "B772",
    manufacturer: "Boeing",
    model: "777-200ER",
    fullName: "Boeing 777-200ER",
    bodyType: "wide",
    seatLayout: "3-4-3",
    typicalSeats: 290,
    modelInServiceSince: 1997,
    modelFleetSize: 250,
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 560,
    rangeMi: 8000,
    productionEnded: 2013,
    seatWidthIn: 17,
    scheduleOnly: true,
    safetyRecord: [
      "The long-range version of the original 777, in service since 1997",
      "Its size and weight mean it usually feels the same bumps a little less than smaller jets",
      "Its cabins and flight-deck systems have been updated over the years",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "787-8",
    icao: "B788",
    manufacturer: "Boeing",
    model: "787-8",
    fullName: "Boeing 787-8 Dreamliner",
    bodyType: "wide",
    seatLayout: "3-3-3",
    typicalSeats: 248,
    modelInServiceSince: 2011,
    modelFleetSize: 400,
    cabinNoiseDb: 81,
    cruiseAltitudeFt: 41000,
    cruiseSpeedMph: 560,
    rangeMi: 8400,
    seatWidthIn: 17.2,
    scheduleOnly: true,
    safetyRecord: [
      "The first Dreamliner, in service since 2011",
      "Its flight controls are designed to sense gusts and soften the motion",
      "Larger windows than older jets, and a lower cabin altitude for easier breathing",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A330-300",
    icao: "A333",
    manufacturer: "Airbus",
    model: "A330-300",
    fullName: "Airbus A330-300",
    bodyType: "wide",
    seatLayout: "2-4-2",
    typicalSeats: 277,
    modelInServiceSince: 1994,
    modelFleetSize: 650,
    cabinNoiseDb: 82,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 550,
    rangeMi: 7200,
    productionEnded: 2021,
    seatWidthIn: 18,
    scheduleOnly: true,
    safetyRecord: [
      "A long-serving wide-body, in service since 1994 with airlines worldwide",
      "A 2-4-2 economy cabin — three of every four seats are a window or an aisle",
      FLY_BY_WIRE,
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A330-200",
    icao: "A332",
    manufacturer: "Airbus",
    model: "A330-200",
    fullName: "Airbus A330-200",
    bodyType: "wide",
    seatLayout: "2-4-2",
    typicalSeats: 247,
    modelInServiceSince: 1998,
    modelFleetSize: 500,
    cabinNoiseDb: 82,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 550,
    rangeMi: 8100,
    productionEnded: 2020,
    seatWidthIn: 18,
    scheduleOnly: true,
    safetyRecord: [
      "The longer-range version of the A330, in service since 1998",
      "A 2-4-2 economy cabin — three of every four seats are a window or an aisle",
      FLY_BY_WIRE,
      ...COMMON_FACTS,
    ],
  },
  {
    key: "E175",
    icao: "E75L",
    manufacturer: "Embraer",
    model: "E175",
    fullName: "Embraer E175",
    bodyType: "narrow",
    seatLayout: "2-2",
    typicalSeats: 76,
    modelInServiceSince: 2005,
    modelFleetSize: 850,
    cabinNoiseDb: 82,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 500,
    rangeMi: 2300,
    seatWidthIn: 18.3,
    scheduleOnly: true,
    safetyRecord: [
      "A regional jet with a 2-2 cabin: every seat is a window or an aisle",
      "In service since 2005, flown mostly by the regional partners of the big airlines",
      "A mature design, refined over hundreds of deliveries",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "CRJ-900",
    icao: "CRJ9",
    manufacturer: "Bombardier",
    model: "CRJ-900",
    fullName: "Bombardier CRJ-900",
    bodyType: "narrow",
    seatLayout: "2-2",
    typicalSeats: 76,
    modelInServiceSince: 2003,
    modelFleetSize: 450,
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 500,
    rangeMi: 1900,
    // The CRJ line closed in 2020 (the programme passed to MHI RJ, which supports the fleet).
    productionEnded: 2020,
    seatWidthIn: 17.3,
    scheduleOnly: true,
    safetyRecord: [
      "A regional jet with a 2-2 cabin: every seat is a window or an aisle",
      "In service since 2003, flown mostly by the regional partners of the big airlines",
      "Engines mounted at the back of the fuselage, so the front of the cabin is the quieter end",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "CRJ-700",
    icao: "CRJ7",
    manufacturer: "Bombardier",
    model: "CRJ-700",
    fullName: "Bombardier CRJ-700",
    bodyType: "narrow",
    seatLayout: "2-2",
    typicalSeats: 70,
    modelInServiceSince: 2001,
    modelFleetSize: 300,
    cabinNoiseDb: 83,
    cruiseAltitudeFt: 37000,
    cruiseSpeedMph: 500,
    rangeMi: 1800,
    // Orders moved to the longer CRJ-900 in the mid-2010s; the CRJ line closed in 2020.
    productionEnded: 2016,
    seatWidthIn: 17.3,
    scheduleOnly: true,
    safetyRecord: [
      "A regional jet with a 2-2 cabin: every seat is a window or an aisle",
      "In service since 2001, flown mostly by the regional partners of the big airlines",
      "Engines mounted at the back of the fuselage, so the front of the cabin is the quieter end",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "747-8",
    icao: "B748",
    manufacturer: "Boeing",
    model: "747-8",
    fullName: "Boeing 747-8",
    bodyType: "wide",
    seatLayout: "3-4-3",
    typicalSeats: 410,
    modelInServiceSince: 2012,
    modelFleetSize: 45,
    cabinNoiseDb: 82,
    cruiseAltitudeFt: 40000,
    cruiseSpeedMph: 570,
    rangeMi: 8900,
    // The last passenger 747-8 was delivered in 2017 (the line went on with freighters until 2023).
    productionEnded: 2017,
    seatWidthIn: 17.5,
    scheduleOnly: true,
    safetyRecord: [
      "The newest version of the 747, in service since 2012",
      "Its size and weight mean it usually feels the same bumps a little less than smaller jets",
      "Quieter engines than earlier 747s, shared with the 787 family",
      ...COMMON_FACTS,
    ],
  },
  {
    key: "A380-800",
    icao: "A388",
    manufacturer: "Airbus",
    model: "A380-800",
    fullName: "Airbus A380-800",
    bodyType: "wide",
    seatLayout: "3-4-3",
    typicalSeats: 525,
    modelInServiceSince: 2007,
    modelFleetSize: 200,
    cabinNoiseDb: 80,
    cruiseAltitudeFt: 39000,
    cruiseSpeedMph: 560,
    rangeMi: 9200,
    productionEnded: 2021,
    seatWidthIn: 18,
    scheduleOnly: true,
    safetyRecord: [
      "A double-deck airliner in service since 2007 on long-haul routes",
      "Its size and weight mean it usually feels the same bumps a little less than smaller jets",
      "A notably quiet cabin for its size",
      FLY_BY_WIRE,
      ...COMMON_FACTS,
    ],
  },
];

const BY_KEY = new Map(AIRCRAFT_MODELS.map((m) => [m.key, m]));

/** The name to show for an aircraft: the type as the schedule listed it when the catalogue stood in for it, else the catalogue's. */
export function displayAircraftName(aircraft: Pick<Aircraft, "fullName" | "listedAs">): string {
  return aircraft.listedAs ?? aircraft.fullName;
}

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
  // Without a fleet, the study's catalogue only: the schedule-only types are never drawn.
  const pool = fleet.length > 0 ? fleet : AIRCRAFT_MODELS.filter((m) => !m.scheduleOnly);
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
  // A regional jet (2-2) seats about 70–80 in all: a shorter map, numbered from just behind the front cabin.
  const regional = seatsAbreast(model.seatLayout) <= 4;
  const rowCount = regional ? rng.int(16, 20) : narrow ? rng.int(18, 26) : rng.int(20, 28);
  const firstRow = regional ? rng.int(4, 10) : narrow ? rng.int(7, 12) : rng.int(24, 32);
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
    "2-2": [["A", "B"], ["C", "D"]],
    "3-3-3": [["A", "B", "C"], ["D", "E", "F"], ["H", "J", "K"]],
    "2-4-2": [["A", "C"], ["D", "E", "F", "G"], ["H", "K"]],
    "3-4-3": [["A", "B", "C"], ["D", "E", "F", "G"], ["H", "J", "K"]],
    "2-3-2": [["A", "C"], ["D", "E", "F"], ["H", "K"]],
  };
  return (LAYOUTS[seatLayout] ?? LAYOUTS["3-3"]).map((g) => g.slice());
}
