/*
 * Airline catalog and route-aware airline selection.
 *
 * Carriers associated with recent high-profile events are deliberately left
 * out: anxious flyers know them and they would confound the study. Every
 * airline gets a high safety score (see fakeFlight.ts) — the prototype never
 * singles out a real airline negatively.
 *
 * candidateAirlines picks a believable carrier for any route (the study's
 * example flight); nonstopCarriers says who would really fly a route nonstop,
 * which can be nobody (version C, docs/FEASIBILITY.md).
 */
import type { Airline, Airport } from "./types";
import type { Rng } from "./random";
import { fleetMaxRangeMi, getAircraftModel } from "./aircraft";
import { annualPassengersM, greatCircleMi, internationalLimitMi } from "./airports";

export type Region = "NA" | "SA" | "EU" | "ME" | "AS" | "OC" | "AF";

export interface AirlineProfile extends Airline {
  region: Region;
  /** Airports where the airline is a major presence (weights route choice). */
  hubs: readonly string[];
  /** Model keys from aircraft.ts the airline operates. */
  fleet: readonly string[];
  /** Registration patterns: "#" → digit, "L" → letter, anything else literal. */
  tailPatterns: readonly string[];
  amenities: readonly string[];
  /** Flies wide-body jets on oceanic / >2,600 mi routes. */
  longHaul: boolean;
  /** Wide-body-only carriers don't bother with hops shorter than this. */
  minRouteMi?: number;
  /** Airports the airline is known not to serve. */
  notServed?: readonly string[];
  /** Point-to-point carrier: only plausible when one end is a focus city. */
  focus?: boolean;
  /** Countries (besides home) the airline flies to; other international routes are out. */
  intlCountries?: readonly string[];
  /** Only flies within its home market. */
  domesticOnly?: boolean;
  /** Only plausible on routes touching Hawaii. */
  hawaiiOnly?: boolean;
  /** Other countries where the airline also runs domestic flights. */
  alsoHome?: readonly string[];
  /** Big network carrier that can plausibly appear as a fallback. */
  hubCarrier?: boolean;
  /** Version C's illustrative fares: value carriers price lower, premium ones higher on long-haul. Absent = standard. */
  fareTier?: "value" | "premium";
  /** Flies ultra-long-range nonstops (beyond ~9,100 mi, 17+ hours) with aircraft configured for them. */
  ultraLongHaul?: boolean;
  /** Hubs its international nonstops leave from, when not all of them (version C's nonstop rule). */
  intlHubs?: readonly string[];
  /** Hubs with a shorter reach: the farthest nonstop the airline flies from each, in miles (version C's nonstop rule). */
  hubReachMi?: Readonly<Record<string, number>>;
}

/** Icelandair's and Aer Lingus's networks: North America and Europe (no Asia, Africa or Middle East). */
const NORTH_ATLANTIC: readonly string[] = [
  "US", "CA", "GB", "IE", "FR", "NL", "BE", "DE", "CH", "AT", "CZ", "PL", "HU", "DK", "SE", "NO", "FI", "IS", "ES", "PT", "IT", "GR",
];

export const AIRLINES: readonly AirlineProfile[] = [
  // ── United States ──
  { code: "DL", name: "Delta Air Lines", country: "US", region: "NA", hubs: ["ATL", "DTW", "MSP", "SLC", "JFK", "LGA", "BOS", "SEA", "LAX"], fleet: ["A220-300", "A321neo", "737-800", "737-900ER", "757-200", "A330-900neo", "A350-900", "767-300ER"], tailPatterns: ["N###DN", "N###DZ", "N###DX", "N###DA"], amenities: ["Free Wi-Fi", "Seat-back screens", "Power at every seat", "Free snacks and drinks"], longHaul: true, hubCarrier: true },
  { code: "UA", name: "United Airlines", country: "US", region: "NA", hubs: ["EWR", "ORD", "IAH", "DEN", "SFO", "IAD", "LAX"], fleet: ["A321neo", "737-800", "737-900ER", "757-200", "767-300ER", "777-300ER", "787-9", "787-10"], tailPatterns: ["N#####"], amenities: ["Seat-back screens on most planes", "Power at every seat", "Free messaging", "Wi-Fi available"], longHaul: true, hubCarrier: true, notServed: ["JFK"] },
  { code: "AA", name: "American Airlines", country: "US", region: "NA", hubs: ["DFW", "CLT", "PHX", "MIA", "PHL", "ORD", "DCA", "LAX", "JFK"], fleet: ["A321neo", "737-800", "787-9", "777-300ER"], tailPatterns: ["N###AN", "N###NN", "N###AA"], amenities: ["Free messaging", "Streaming entertainment", "Power at every seat", "Wi-Fi available"], longHaul: true, hubCarrier: true },
  { code: "B6", name: "JetBlue Airways", country: "US", region: "NA", hubs: ["JFK", "BOS", "FLL", "MCO", "SJU", "EWR", "LGA"], fleet: ["A220-300", "A321neo"], tailPatterns: ["N###JB", "N###JT"], amenities: ["Free high-speed Wi-Fi", "Seat-back screens", "Free snacks and drinks", "Extra legroom in economy"], longHaul: false, focus: true, intlCountries: ["MX", "CR", "CO", "PE", "DO", "JM", "BS", "CA", "GB", "FR", "NL", "IE"], fareTier: "value" },
  { code: "AS", name: "Alaska Airlines", country: "US", region: "NA", hubs: ["SEA", "PDX", "SFO", "LAX", "SAN", "ANC"], fleet: ["737-800", "737-900ER"], tailPatterns: ["N###AS", "N###AK"], amenities: ["Free messaging", "Streaming entertainment", "Power at most seats", "Free snacks"], longHaul: false, focus: true, intlCountries: ["MX", "CA", "CR", "BS"] },
  { code: "WN", name: "Southwest Airlines", country: "US", region: "NA", hubs: ["DAL", "HOU", "MDW", "BWI", "DEN", "LAS", "PHX", "MCO", "BNA", "OAK", "SAN"], fleet: ["737-800"], tailPatterns: ["N8###W", "N8###Q", "N8###Z"], amenities: ["Free messaging", "Streaming entertainment", "Free snacks and drinks", "Power at most seats"], longHaul: false, domesticOnly: true, notServed: ["JFK", "EWR", "IAD", "DFW", "ANC"], fareTier: "value" },
  { code: "HA", name: "Hawaiian Airlines", country: "US", region: "NA", hubs: ["HNL", "OGG"], fleet: ["A321neo", "787-9"], tailPatterns: ["N###HA"], amenities: ["Free Wi-Fi", "Complimentary meals", "Seat-back screens on long flights", "Power at every seat"], longHaul: true, hawaiiOnly: true, intlCountries: ["JP", "KR", "AU", "NZ"], intlHubs: ["HNL"], hubReachMi: { OGG: 2900 } },
  // ── Canada ──
  { code: "AC", name: "Air Canada", country: "CA", region: "NA", hubs: ["YYZ", "YVR", "YUL", "YYC"], fleet: ["A220-300", "A321neo", "787-9", "777-300ER"], tailPatterns: ["C-FLLL", "C-GLLL"], amenities: ["Seat-back screens", "Power at every seat", "Free messaging", "Wi-Fi available"], longHaul: true, hubCarrier: true },
  // ── Europe ──
  { code: "BA", name: "British Airways", country: "GB", region: "EU", hubs: ["LHR", "LGW"], fleet: ["A320neo", "A321neo", "787-9", "787-10", "777-300ER", "A350-1000"], tailPatterns: ["G-LLLL"], amenities: ["Seat-back screens on long flights", "Free messaging", "Complimentary meals on long flights", "Power at every seat"], longHaul: true, hubCarrier: true },
  { code: "VS", name: "Virgin Atlantic", country: "GB", region: "EU", hubs: ["LHR", "MAN"], fleet: ["A330-900neo", "A350-1000", "787-9"], tailPatterns: ["G-VLLL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true, minRouteMi: 1800, fareTier: "premium" },
  { code: "AF", name: "Air France", country: "FR", region: "EU", hubs: ["CDG", "ORY"], fleet: ["A220-300", "A320neo", "A350-900", "777-300ER", "787-9"], tailPatterns: ["F-HLLL", "F-GLLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Complimentary meals", "Power at every seat"], longHaul: true, hubCarrier: true },
  { code: "KL", name: "KLM Royal Dutch Airlines", country: "NL", region: "EU", hubs: ["AMS"], fleet: ["737-800", "A321neo", "777-300ER", "787-9", "787-10", "A350-900"], tailPatterns: ["PH-BLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Complimentary snacks and drinks", "Power at every seat"], longHaul: true, hubCarrier: true },
  { code: "LH", name: "Lufthansa", country: "DE", region: "EU", hubs: ["FRA", "MUC"], fleet: ["A320neo", "A321neo", "A350-900", "787-9"], tailPatterns: ["D-ALLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Complimentary snacks on short flights", "Power at every seat"], longHaul: true, hubCarrier: true },
  { code: "LX", name: "Swiss International Air Lines", country: "CH", region: "EU", hubs: ["ZRH", "GVA"], fleet: ["A220-300", "A320neo", "A321neo", "777-300ER"], tailPatterns: ["HB-JLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Swiss chocolate on every flight", "Power at every seat"], longHaul: true, fareTier: "premium" },
  { code: "IB", name: "Iberia", country: "ES", region: "EU", hubs: ["MAD", "BCN"], fleet: ["A320neo", "A321neo", "A350-900"], tailPatterns: ["EC-LLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Wi-Fi available", "Power at every seat"], longHaul: true },
  { code: "SK", name: "SAS Scandinavian Airlines", country: "SE", region: "EU", hubs: ["CPH", "ARN", "OSL"], fleet: ["A320neo", "A321neo", "A350-900"], tailPatterns: ["SE-RLL", "LN-RLL", "OY-KLL"], amenities: ["Free Wi-Fi for members", "Seat-back screens on long flights", "Free coffee and tea", "Power at every seat"], longHaul: true, alsoHome: ["DK", "NO"] },
  { code: "AY", name: "Finnair", country: "FI", region: "EU", hubs: ["HEL"], fleet: ["A320neo", "A350-900"], tailPatterns: ["OH-LLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Nordic design cabin", "Power at every seat"], longHaul: true },
  { code: "EI", name: "Aer Lingus", country: "IE", region: "EU", hubs: ["DUB"], fleet: ["A320neo", "A321neo", "A330-900neo"], tailPatterns: ["EI-LLL"], amenities: ["Wi-Fi available", "Seat-back screens on long flights", "Complimentary meals on long flights", "Power at every seat"], longHaul: true, intlCountries: NORTH_ATLANTIC },
  { code: "TP", name: "TAP Air Portugal", country: "PT", region: "EU", hubs: ["LIS"], fleet: ["A320neo", "A321neo", "A330-900neo"], tailPatterns: ["CS-TLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Complimentary meals on long flights", "Power at every seat"], longHaul: true },
  { code: "OS", name: "Austrian Airlines", country: "AT", region: "EU", hubs: ["VIE"], fleet: ["A320neo", "787-9"], tailPatterns: ["OE-LLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Viennese coffee service", "Power at every seat"], longHaul: true },
  { code: "AZ", name: "ITA Airways", country: "IT", region: "EU", hubs: ["FCO", "MXP"], fleet: ["A220-300", "A320neo", "A321neo", "A330-900neo", "A350-900"], tailPatterns: ["EI-HLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Complimentary meals on long flights", "Power at every seat"], longHaul: true },
  { code: "TK", name: "Turkish Airlines", country: "TR", region: "EU", hubs: ["IST"], fleet: ["A321neo", "737-800", "A350-900", "787-9", "777-300ER"], tailPatterns: ["TC-LLL"], amenities: ["Seat-back screens", "Complimentary meals on every flight", "Free messaging", "Power at every seat"], longHaul: true, hubCarrier: true },
  { code: "FI", name: "Icelandair", country: "IS", region: "EU", hubs: ["KEF"], fleet: ["757-200", "767-300ER", "A321neo"], tailPatterns: ["TF-LLL"], amenities: ["Seat-back screens", "Wi-Fi available", "Free messaging", "Power at every seat"], longHaul: true, intlCountries: NORTH_ATLANTIC },
  { code: "LO", name: "LOT Polish Airlines", country: "PL", region: "EU", hubs: ["WAW"], fleet: ["737-800", "787-9"], tailPatterns: ["SP-LLL"], amenities: ["Free messaging", "Seat-back screens on long flights", "Complimentary snacks", "Power at every seat"], longHaul: true },
  { code: "A3", name: "Aegean Airlines", country: "GR", region: "EU", hubs: ["ATH"], fleet: ["A320neo", "A321neo"], tailPatterns: ["SX-LLL"], amenities: ["Free messaging", "Complimentary meals on most flights", "Streaming entertainment", "Power at most seats"], longHaul: false },
  // ── Middle East ──
  { code: "EK", name: "Emirates", country: "AE", region: "ME", hubs: ["DXB"], fleet: ["777-300ER", "A350-900"], tailPatterns: ["A6-ELL"], amenities: ["Seat-back screens with thousands of channels", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true, hubCarrier: true, fareTier: "premium" },
  { code: "QR", name: "Qatar Airways", country: "QA", region: "ME", hubs: ["DOH"], fleet: ["A350-900", "A350-1000", "777-300ER", "787-9", "A320neo"], tailPatterns: ["A7-ALL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true, hubCarrier: true, fareTier: "premium" },
  { code: "EY", name: "Etihad Airways", country: "AE", region: "ME", hubs: ["AUH"], fleet: ["787-9", "787-10", "A350-1000", "A321neo"], tailPatterns: ["A6-BLL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true, fareTier: "premium" },
  { code: "LY", name: "El Al", country: "IL", region: "ME", hubs: ["TLV"], fleet: ["737-800", "787-9"], tailPatterns: ["4X-ELL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true },
  // ── Asia ──
  { code: "SQ", name: "Singapore Airlines", country: "SG", region: "AS", hubs: ["SIN"], fleet: ["A350-900", "777-300ER", "787-10"], tailPatterns: ["9V-SLL"], amenities: ["Free Wi-Fi", "Seat-back screens", "Complimentary meals", "Power at every seat"], longHaul: true, hubCarrier: true, minRouteMi: 500, fareTier: "premium", ultraLongHaul: true },
  { code: "CX", name: "Cathay Pacific", country: "HK", region: "AS", hubs: ["HKG"], fleet: ["A350-900", "A350-1000", "777-300ER", "A321neo"], tailPatterns: ["B-LLL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true, hubCarrier: true, fareTier: "premium" },
  { code: "NH", name: "All Nippon Airways", country: "JP", region: "AS", hubs: ["HND", "NRT", "KIX"], fleet: ["787-9", "787-10", "777-300ER", "A321neo", "737-800"], tailPatterns: ["JA###A"], amenities: ["Seat-back screens", "Complimentary meals on international flights", "Free Wi-Fi on domestic flights", "Power at every seat"], longHaul: true, hubCarrier: true, fareTier: "premium" },
  { code: "JL", name: "Japan Airlines", country: "JP", region: "AS", hubs: ["HND", "NRT", "KIX"], fleet: ["787-9", "777-300ER", "A350-900", "A350-1000", "737-800"], tailPatterns: ["JA###J"], amenities: ["Seat-back screens", "Complimentary meals on international flights", "Free Wi-Fi on domestic flights", "Power at every seat"], longHaul: true, hubCarrier: true, fareTier: "premium" },
  { code: "KE", name: "Korean Air", country: "KR", region: "AS", hubs: ["ICN"], fleet: ["787-9", "787-10", "777-300ER", "A321neo", "A220-300", "737-800"], tailPatterns: ["HL8###"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true, hubCarrier: true },
  { code: "BR", name: "EVA Air", country: "TW", region: "AS", hubs: ["TPE"], fleet: ["787-9", "787-10", "777-300ER", "A321neo"], tailPatterns: ["B-16###"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true },
  { code: "TG", name: "Thai Airways", country: "TH", region: "AS", hubs: ["BKK"], fleet: ["777-300ER", "787-9", "A350-900", "A320neo"], tailPatterns: ["HS-TLL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at most seats"], longHaul: true },
  { code: "MH", name: "Malaysia Airlines", country: "MY", region: "AS", hubs: ["KUL"], fleet: ["A350-900", "A330-900neo", "737-800"], tailPatterns: ["9M-MLL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at most seats"], longHaul: true },
  { code: "6E", name: "IndiGo", country: "IN", region: "AS", hubs: ["DEL", "BOM", "BLR"], fleet: ["A320neo", "A321neo"], tailPatterns: ["VT-ILL"], amenities: ["Streaming entertainment", "Extra-legroom rows available", "New, quiet A320neo cabins"], longHaul: false, domesticOnly: true, fareTier: "value" },
  { code: "CA", name: "Air China", country: "CN", region: "AS", hubs: ["PEK"], fleet: ["A320neo", "A321neo", "737-800", "787-9", "777-300ER", "A350-900"], tailPatterns: ["B-####"], amenities: ["Seat-back screens on long flights", "Complimentary meals", "Power at every seat", "Free messaging"], longHaul: true },
  { code: "VN", name: "Vietnam Airlines", country: "VN", region: "AS", hubs: ["SGN"], fleet: ["A321neo", "787-9", "787-10", "A350-900"], tailPatterns: ["VN-ALLL"], amenities: ["Seat-back screens on long flights", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true },
  { code: "PR", name: "Philippine Airlines", country: "PH", region: "AS", hubs: ["MNL"], fleet: ["A321neo", "A350-900", "777-300ER"], tailPatterns: ["RP-C####"], amenities: ["Seat-back screens on long flights", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true },
  { code: "GA", name: "Garuda Indonesia", country: "ID", region: "AS", hubs: ["CGK", "DPS"], fleet: ["737-800", "A330-900neo", "777-300ER"], tailPatterns: ["PK-GLL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at most seats"], longHaul: true },
  // ── Oceania ──
  { code: "QF", name: "Qantas", country: "AU", region: "OC", hubs: ["SYD", "MEL", "BNE", "PER"], fleet: ["737-800", "A321neo", "787-9"], tailPatterns: ["VH-LLL"], amenities: ["Seat-back screens", "Complimentary meals and snacks", "Free Wi-Fi on domestic flights", "Power at every seat"], longHaul: true, hubCarrier: true, fareTier: "premium" },
  { code: "NZ", name: "Air New Zealand", country: "NZ", region: "OC", hubs: ["AKL"], fleet: ["A320neo", "A321neo", "787-9", "777-300ER"], tailPatterns: ["ZK-LLL"], amenities: ["Seat-back screens", "Complimentary meals on long flights", "Wi-Fi available", "Power at every seat"], longHaul: true },
  // ── Latin America ──
  { code: "LA", name: "LATAM Airlines", country: "CL", region: "SA", hubs: ["SCL", "LIM", "GRU", "BOG"], fleet: ["A320neo", "A321neo", "787-9", "777-300ER"], tailPatterns: ["CC-BLL", "PR-XLL"], amenities: ["Seat-back screens on long flights", "Streaming entertainment", "Power at every seat", "Free messaging"], longHaul: true, hubCarrier: true, alsoHome: ["BR", "PE", "CO"] },
  { code: "AV", name: "Avianca", country: "CO", region: "SA", hubs: ["BOG"], fleet: ["A320neo", "787-9"], tailPatterns: ["N###AV"], amenities: ["Streaming entertainment", "Seat-back screens on long flights", "Power at most seats", "Free messaging"], longHaul: true },
  { code: "AM", name: "Aeroméxico", country: "MX", region: "NA", hubs: ["MEX", "GDL"], fleet: ["737-800", "787-9"], tailPatterns: ["XA-LLL"], amenities: ["Seat-back screens", "Complimentary meals and drinks", "Wi-Fi available", "Power at every seat"], longHaul: true },
  { code: "CM", name: "Copa Airlines", country: "PA", region: "SA", hubs: ["PTY"], fleet: ["737-800"], tailPatterns: ["HP-####CMP"], amenities: ["Seat-back screens on most planes", "Complimentary meals and drinks", "Free messaging", "Power at most seats"], longHaul: false },
  { code: "AR", name: "Aerolíneas Argentinas", country: "AR", region: "SA", hubs: ["EZE"], fleet: ["737-800", "A330-900neo"], tailPatterns: ["LV-LLL"], amenities: ["Seat-back screens on long flights", "Complimentary meals", "Wi-Fi available", "Power at most seats"], longHaul: true },
  // ── Africa ──
  { code: "ET", name: "Ethiopian Airlines", country: "ET", region: "AF", hubs: ["ADD"], fleet: ["737-800", "787-9", "A350-900", "A350-1000"], tailPatterns: ["ET-ALL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true, hubCarrier: true },
  { code: "KQ", name: "Kenya Airways", country: "KE", region: "AF", hubs: ["NBO"], fleet: ["737-800", "787-9"], tailPatterns: ["5Y-KLL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true },
  { code: "MS", name: "EgyptAir", country: "EG", region: "AF", hubs: ["CAI"], fleet: ["A320neo", "A321neo", "787-9"], tailPatterns: ["SU-GLL"], amenities: ["Seat-back screens", "Complimentary meals", "Wi-Fi available", "Power at every seat"], longHaul: true },
  { code: "AT", name: "Royal Air Maroc", country: "MA", region: "AF", hubs: ["CMN", "RAK"], fleet: ["737-800", "787-9"], tailPatterns: ["CN-RLL"], amenities: ["Seat-back screens on long flights", "Complimentary meals", "Wi-Fi available", "Power at most seats"], longHaul: true },
  { code: "SA", name: "South African Airways", country: "ZA", region: "AF", hubs: ["JNB", "CPT"], fleet: ["A320neo", "A350-900"], tailPatterns: ["ZS-SLL"], amenities: ["Seat-back screens on long flights", "Complimentary meals", "Wi-Fi available", "Power at most seats"], longHaul: true },
];

const BY_CODE = new Map(AIRLINES.map((a) => [a.code, a]));

export function getAirline(code: string): AirlineProfile | undefined {
  return BY_CODE.get(code.toUpperCase());
}

const REGION_BY_COUNTRY: Record<string, Region> = {
  US: "NA", PR: "NA", CA: "NA", MX: "NA", CR: "NA", PA: "NA", JM: "NA", BS: "NA", DO: "NA",
  CO: "SA", PE: "SA", BR: "SA", AR: "SA", CL: "SA",
  GB: "EU", IE: "EU", FR: "EU", NL: "EU", BE: "EU", DE: "EU", CH: "EU", AT: "EU", CZ: "EU", PL: "EU", HU: "EU",
  DK: "EU", SE: "EU", NO: "EU", FI: "EU", IS: "EU", ES: "EU", PT: "EU", IT: "EU", GR: "EU", TR: "EU",
  AE: "ME", QA: "ME", IL: "ME", JO: "ME",
  JP: "AS", KR: "AS", CN: "AS", HK: "AS", TW: "AS", PH: "AS", VN: "AS", TH: "AS", MY: "AS", SG: "AS", ID: "AS", IN: "AS",
  PK: "AS", BD: "AS", LK: "AS", NP: "AS",
  AU: "OC", NZ: "OC",
  ZA: "AF", EG: "AF", ET: "AF", KE: "AF", NG: "AF", GH: "AF", MA: "AF",
};

export function regionOf(country: string): Region {
  return REGION_BY_COUNTRY[country] ?? "NA";
}

/** Puerto Rico flies as part of the US domestic market. */
export function marketOf(country: string): string {
  return country === "PR" ? "US" : country;
}

const HAWAII = new Set(["HNL", "OGG"]);

function operatesDomesticallyIn(airline: AirlineProfile, market: string): boolean {
  return airline.country === market || (airline.alsoHome?.includes(market) ?? false);
}

/** The airline's own limits: Hawaii-only, domestic-only, long-haul, shortest route, airports and countries it serves. */
function canFly(a: AirlineProfile, origin: Airport, destination: Airport, distanceMi: number, oceanic: boolean, checkRange: boolean): boolean {
  const mo = marketOf(origin.country);
  const md = marketOf(destination.country);
  const domestic = mo === md;
  if (a.hawaiiOnly && !(HAWAII.has(origin.code) || HAWAII.has(destination.code))) return false;
  if (a.domesticOnly && !(domestic && operatesDomesticallyIn(a, mo))) return false;
  if ((oceanic || distanceMi > 2600) && !a.longHaul) return false;
  if (a.minRouteMi && distanceMi < a.minRouteMi) return false;
  if (a.notServed && (a.notServed.includes(origin.code) || a.notServed.includes(destination.code))) return false;
  const intl = a.intlCountries;
  if (!domestic && intl) {
    const away = [mo, md].filter((c) => !operatesDomesticallyIn(a, c));
    if (away.some((c) => !intl.includes(c))) return false;
  }
  if (checkRange && distanceMi > 6500 && fleetMaxRangeMi(a.fleet) < distanceMi) return false;
  return true;
}

/**
 * Carriers from either endpoint's home market that can fly the route, with selection
 * weights (hub presence weighted up). Point-to-point (focus) carriers need a focus city
 * at one end. Empty when no home-market carrier fits.
 */
function homeMarketCarriers(origin: Airport, destination: Airport, distanceMi: number, oceanic: boolean, checkRange: boolean): Array<[AirlineProfile, number]> {
  const mo = marketOf(origin.country);
  const md = marketOf(destination.country);
  const domestic = mo === md;
  const weights: Array<[AirlineProfile, number]> = [];
  for (const a of AIRLINES) {
    if (!canFly(a, origin, destination, distanceMi, oceanic, checkRange)) continue;
    const hubs = (a.hubs.includes(origin.code) ? 1 : 0) + (a.hubs.includes(destination.code) ? 1 : 0);
    if (a.focus && hubs === 0) continue;
    const hubBonus = hubs * 3;
    if (domestic) {
      if (operatesDomesticallyIn(a, mo)) weights.push([a, 1 + hubBonus]);
    } else if (operatesDomesticallyIn(a, mo) || operatesDomesticallyIn(a, md)) {
      weights.push([a, 2 + hubBonus]);
    }
  }
  return weights;
}

/**
 * Airlines that plausibly fly this route, with selection weights. Domestic
 * routes get that country's carriers; international routes get carriers from
 * either endpoint's country, hub presence weighted up. Big network carriers
 * are a fallback so every route gets a believable airline (the study's example
 * flight; version C uses nonstopCarriers, which can be empty).
 */
export function candidateAirlines(
  origin: Airport,
  destination: Airport,
  distanceMi: number,
  oceanic: boolean,
): Array<[AirlineProfile, number]> {
  const fits = (a: AirlineProfile, checkRange: boolean) => canFly(a, origin, destination, distanceMi, oceanic, checkRange);

  // Three tiers: carriers from either endpoint's country (hubs weighted up), then
  // big network carriers from either region, then any big network carrier.
  const pick = (checkRange: boolean): Array<[AirlineProfile, number]> | null => {
    const weights = homeMarketCarriers(origin, destination, distanceMi, oceanic, checkRange);
    if (weights.length > 0) return weights;

    const ro = regionOf(origin.country);
    const rd = regionOf(destination.country);
    const regional = AIRLINES.filter((a) => a.hubCarrier && fits(a, checkRange) && (a.region === ro || a.region === rd));
    if (regional.length > 0) return regional.map((a) => [a, 1]);

    const global = AIRLINES.filter((a) => a.hubCarrier && fits(a, checkRange));
    return global.length > 0 ? global.map((a) => [a, 1]) : null;
  };

  // Beyond every catalogued fleet's range (> 9,700 mi, e.g. JFK–SYD) the endpoint
  // countries' flag carriers on their longest-legged jets are still the believable answer.
  return (
    pick(true) ??
    pick(false) ??
    AIRLINES.filter((a) => a.longHaul && a.hubCarrier && !a.hawaiiOnly).map((a): [AirlineProfile, number] => [a, 1])
  );
}

// ── Nonstop plausibility (version C) ────────────────────────────────────────

/** Closer than this, airports share a metro area or a short drive: nobody flies between them. */
export const NONSTOP_MIN_MI = 100;
/** Beyond this, only ultra-long-range carriers fly, and only between two big airports. */
const ULTRA_LONG_MI = 9100;
const ULTRA_LONG_MIN_PAX_M = 45;
/** Domestic mega hubs (80M+ passengers a year) reach small cities from further away. */
const MEGA_HUB_PAX_M = 80;

/** [up to this many miles, the far end needs at least this many million passengers a year]. */
type SizeBands = ReadonlyArray<readonly [number, number]>;
const DOMESTIC_NEED: SizeBands = [[1150, 0], [1800, 5], [2700, 9], [Infinity, 20]];
const MEGA_HUB_NEED: SizeBands = [[1500, 0], [2200, 2.5], [2700, 8], [Infinity, 20]];
const INTERNATIONAL_NEED: SizeBands = [[1500, 2], [3000, 5], [5500, 13], [7500, 22], [Infinity, 40]];
/** Carriers outside the big networks need a bigger far end: on international routes, and domestic ones beyond 2,700 mi. */
const SMALLER_NETWORK_FACTOR = { international: 1.5, domesticLong: 1.25 };

function needFor(bands: SizeBands, distanceMi: number): number {
  for (const [upTo, pax] of bands) if (distanceMi <= upTo) return pax;
  return bands[bands.length - 1][1];
}

/**
 * Real nonstops the size rule below misses (2025–26 schedules), with the carriers that fly them:
 * gateways whose long-haul networks are far bigger than their passenger numbers suggest (Accra,
 * Lagos, Rio), and a few thinner routes a carrier flies from its hub. Either direction.
 */
export const LISTED_NONSTOPS: Readonly<Record<string, readonly string[]>> = {
  "ACC-LHR": ["BA"], "ACC-AMS": ["KL"], "ACC-DXB": ["EK"], "ACC-ADD": ["ET"], "ACC-JNB": ["SA"], "ACC-CMN": ["AT"],
  "ACC-JFK": ["DL"], "ACC-IAD": ["UA"],
  "LOS-LHR": ["BA", "VS"], "LOS-CDG": ["AF"], "LOS-AMS": ["KL"], "LOS-FRA": ["LH"], "LOS-IST": ["TK"], "LOS-ATL": ["DL"],
  "LOS-IAD": ["UA"],
  "GIG-LHR": ["BA"], "GIG-CDG": ["AF"], "GIG-AMS": ["KL"], "GIG-MAD": ["IB"], "GIG-LIS": ["TP"],
  "JNB-EWR": ["UA"], "CPT-EWR": ["UA"], "AKL-DOH": ["QR"], "AKL-YVR": ["AC", "NZ"],
  "PIT-LHR": ["BA"], "VCE-JFK": ["DL"], "BUF-LAS": ["WN"], "SRQ-BOS": ["B6"], "TUS-SEA": ["AS"],
};

function listedCarriers(a: string, b: string): readonly string[] {
  return LISTED_NONSTOPS[`${a}-${b}`] ?? LISTED_NONSTOPS[`${b}-${a}`] ?? [];
}

/** Can the airline's fleet (narrow-bodies only at LGA / DCA) fly this far — on a wide-body where the route needs one? */
function fleetReaches(a: AirlineProfile, distanceMi: number, needsWide: boolean, narrowOnly: boolean): boolean {
  let best = 0;
  for (const key of a.fleet) {
    const m = getAircraftModel(key);
    if (!m || (narrowOnly && m.bodyType !== "narrow") || (needsWide && m.bodyType !== "wide")) continue;
    best = Math.max(best, m.rangeMi);
  }
  return best >= distanceMi;
}

/**
 * Airlines that would plausibly fly this route nonstop, with candidateAirlines'
 * weights — often none (docs/FEASIBILITY.md: no invented nonstops). A real product
 * reads this from published schedules (OAG, Cirium); the rule approximates them:
 *
 * 1. Both ends are catalog airports at least NONSTOP_MIN_MI apart; long-haul only
 *    where the airport has it (internationalLimitMi).
 * 2. The carrier is from one end's home market and its own limits allow the route
 *    (candidateAirlines' first tier — third-country fallbacks never count).
 * 3. It has a hub or focus city at one end (one whose flights go that far, and
 *    abroad where they do: intlHubs, hubReachMi) — or, outside the US's
 *    hub-and-spoke market, it is the home carrier of a domestic route.
 * 4. Its fleet reaches the distance, on a wide-body where the route needs one.
 * 5. The far end is big enough for the distance (approximate passengers a year,
 *    annualPassengersM): any city within ~1,150 mi of a domestic hub, only larger
 *    ones further out or abroad; carriers outside the big networks need bigger
 *    markets on long flights. Flights between a carrier's own hubs always qualify.
 * 6. Beyond ULTRA_LONG_MI only ultra-long-range carriers fly, between big airports.
 * 7. A few real routes the size rule misses are listed with their carriers
 *    (LISTED_NONSTOPS); those carriers still need rules 2 and 4.
 *
 * `origin` / `destination` are the airports as flown (a long LaGuardia trip is the
 * JFK route); `narrowOnly` is true at LGA / DCA. Symmetric in the two ends, and the
 * same on every date.
 */
export function nonstopCarriers(origin: Airport, destination: Airport, narrowOnly: boolean): Array<[AirlineProfile, number]> {
  if (!origin.known || !destination.known || origin.code === destination.code) return [];
  const distanceMi = greatCircleMi(origin, destination);
  if (distanceMi < NONSTOP_MIN_MI) return [];
  const mo = marketOf(origin.country);
  const md = marketOf(destination.country);
  const domestic = mo === md;
  if (!domestic && distanceMi > Math.min(internationalLimitMi(origin.code), internationalLimitMi(destination.code))) return [];
  const oceanic = regionOf(origin.country) !== regionOf(destination.country) && distanceMi > 1500;
  const needsWide = !narrowOnly && (oceanic || distanceMi >= 2800);
  const ultra = distanceMi > ULTRA_LONG_MI;
  if (ultra && Math.min(annualPassengersM(origin.code), annualPassengersM(destination.code)) < ULTRA_LONG_MIN_PAX_M) return [];
  const listed = listedCarriers(origin.code, destination.code);
  // A hub counts for this route if the airline's flights from it go this far (and abroad, where they do).
  const hubFor = (a: AirlineProfile, code: string) =>
    a.hubs.includes(code) && (domestic || !a.intlHubs || a.intlHubs.includes(code)) && distanceMi <= (a.hubReachMi?.[code] ?? Infinity);

  const out: Array<[AirlineProfile, number]> = [];
  for (const [a, weight] of homeMarketCarriers(origin, destination, distanceMi, oceanic, false)) {
    if (ultra && !a.ultraLongHaul) continue;
    if (!fleetReaches(a, distanceMi, needsWide, narrowOnly)) continue;
    const hubAtOrigin = hubFor(a, origin.code);
    const hubAtDestination = hubFor(a, destination.code);
    if ((hubAtOrigin && hubAtDestination) || listed.includes(a.code)) {
      out.push([a, weight]);
      continue;
    }
    if (!hubAtOrigin && !hubAtDestination) {
      // A home carrier links its country's main airports (not in the US, where nonstops fan out from hubs and focus cities).
      const smaller = Math.min(annualPassengersM(origin.code), annualPassengersM(destination.code));
      if (domestic && mo !== "US" && !a.focus && smaller >= needFor(DOMESTIC_NEED, distanceMi)) out.push([a, weight]);
      continue;
    }
    const hub = hubAtOrigin ? origin : destination;
    const far = hubAtOrigin ? destination : origin;
    const bands = !domestic ? INTERNATIONAL_NEED : annualPassengersM(hub.code) >= MEGA_HUB_PAX_M ? MEGA_HUB_NEED : DOMESTIC_NEED;
    let need = needFor(bands, distanceMi);
    if (!a.hubCarrier) {
      if (!domestic) need *= SMALLER_NETWORK_FACTOR.international;
      else if (distanceMi > 2700) need *= SMALLER_NETWORK_FACTOR.domesticLong;
    }
    if (annualPassengersM(far.code) >= need) out.push([a, weight]);
  }
  return out;
}

/** Numbers retired after well-known events; anxious flyers recognise them. Only numbers the draw ranges can reach. */
export const RETIRED_FLIGHT_NUMBERS: Record<string, readonly number[]> = {
  UA: [93, 175, 232, 328, 585, 811], AA: [11, 77, 191, 587, 965, 1420], DL: [89, 191, 1141], AS: [261, 1282],
  WN: [1248, 1380], B6: [292], AC: [143, 624, 797], BA: [9, 38, 2276], AF: [296, 358, 447], KL: [867],
  LH: [540, 2904], SK: [686, 751], TK: [981, 1951], EK: [521], SQ: [6, 321], JL: [123, 350, 516], KE: [7, 801],
  MH: [17, 370, 653], QF: [1, 32, 72], NZ: [901], AV: [52, 203], MS: [804, 990], ET: [302, 409, 961], KQ: [507],
  SA: [295], GA: [152, 200], CA: [129], TG: [311], PR: [434], AM: [498], CM: [201], IB: [610], AT: [630],
};

export function isRetiredFlightNumber(flightNumber: string): boolean {
  const [code, num] = flightNumber.split(" ");
  return (RETIRED_FLIGHT_NUMBERS[code] ?? []).includes(Number(num));
}

/** "DL 1423": long-haul flights carry short numbers, domestic ones 3–4 digits. */
export function makeFlightNumber(rng: Rng, airline: Airline, longHaul: boolean): string {
  const draw = () =>
    longHaul
      ? rng.weighted<number>([
          [rng.int(1, 99), 50],
          [rng.int(100, 999), 50],
        ])
      : rng.weighted<number>([
          [rng.int(100, 999), 45],
          [rng.int(1000, 2999), 55],
        ]);
  const retired = RETIRED_FLIGHT_NUMBERS[airline.code] ?? [];
  let n = draw();
  for (let tries = 0; retired.includes(n) && tries < 8; tries++) n = draw();
  while (retired.includes(n)) n++; // deterministic fallback; never loops forever
  return `${airline.code} ${n}`;
}

export function toAirline(profile: AirlineProfile): Airline {
  return { code: profile.code, name: profile.name, country: profile.country };
}
