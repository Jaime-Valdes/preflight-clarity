/*
 * Airport traits for the takeoff & landing rating (shared/src/ratings.ts): a small,
 * hand-made table of catalogue airports with well-known low-level approach patterns.
 *
 * Real-world data it stands for (docs/FEASIBILITY.md — everything here is obtainable):
 *  - METAR climatology by airport, month and hour (wind, gusts, sea-breeze onset, convection).
 *  - Terrain data around the airport (mountains, valleys, plateau altitude).
 *  - PIREP / EDR turbulence climatology in the climb and approach areas.
 * A real product would compute these from that data; this prototype lists the airports whose
 * patterns are common knowledge among pilots, with one line of reason each. Everything not
 * listed is "typical" — no particular pattern at low level.
 *
 * Two traits are also read from the generator's own geography, so a flight's two bases can
 * never disagree about an airport: every airport in the generator's coastal set
 * (COASTAL_AIRPORTS — its descents cite "a sea breeze near the coast") is coastal, and every
 * airport inside one of its mountain boxes (mountainRangeAt — its descents cite air flowing
 * over the range) has terrain. The table lists those too, with their reasons; check-ratings
 * fails if it ever falls behind the generator.
 *
 * Traits (seasonal: ratings.ts combines them with the month, the local hour, the climate
 * normals and the hemisphere, so a southern airport's "summer" is December–February):
 *  - coastal:        sea-breeze fronts and onshore wind near the runway, strongest on spring and
 *                    summer afternoons (every afternoon in the tropics); mornings are usually calm.
 *  - terrain:        high ground or a valley: wind flowing over the mountains stirs the air on the
 *                    climb-out and approach, most in winter and spring; summer afternoons add thermals.
 *  - hot_afternoon:  afternoon heat builds rising air (and showers where the month is wet) near the
 *                    airport in the months whose mean temperature is warm or hot; all year in the tropics.
 *  - exposed:        an open, breezy site where autumn and winter weather systems pass through often.
 *
 * Calm copy only: these words reach nervous flyers through the rating's factors.
 */
import { getAirport } from "./airports";
import { COASTAL_AIRPORTS, mountainRangeAt } from "./fakeFlight";

export type AirportTrait = "coastal" | "terrain" | "hot_afternoon" | "exposed";

/** Season-neutral words for the detail sheet's pattern line (the season is said separately). */
export const AIRPORT_TRAIT_WORDS: Record<AirportTrait, string> = {
  coastal: "coastal",
  terrain: "high ground nearby",
  hot_afternoon: "hot afternoons",
  exposed: "an open, breezy site",
};

/** Catalogue codes only (shared/scripts/check-ratings.ts verifies). One reason per line. */
export const AIRPORT_TRAITS: Readonly<Record<string, readonly AirportTrait[]>> = {
  // ── Coastal: sea breeze and onshore wind ──
  SFO: ["coastal"], // Bay sea breeze through the Golden Gate on summer afternoons; marine layer mornings
  OAK: ["coastal"], // same Bay sea breeze as SFO, across the water
  LAX: ["coastal"], // onshore wind off the Pacific builds every afternoon; approaches over the sea
  SAN: ["coastal"], // approach along the coast; afternoon onshore breeze
  SEA: ["coastal"], // Puget Sound sea breeze and marine air on the approach
  YVR: ["coastal"], // Fraser delta on the Strait of Georgia; sea breeze, and Pacific lows in winter
  BOS: ["coastal", "exposed"], // runways on the harbour; nor'easters and sea breeze in the warm season
  LGA: ["coastal"], // runways on Flushing Bay; afternoon sea breeze off Long Island Sound
  JFK: ["coastal"], // Jamaica Bay sea breeze on spring and summer afternoons
  EWR: ["coastal"], // Newark Bay and the harbour sea breeze
  MIA: ["coastal", "hot_afternoon"], // sea breeze meets afternoon showers nearly every summer day
  FLL: ["coastal", "hot_afternoon"], // same Atlantic sea breeze and summer showers as Miami
  TPA: ["coastal", "hot_afternoon"], // Gulf sea breeze; Florida's summer afternoon showers
  HNL: ["coastal"], // trade winds across the runway, gusty against the Koolau ridge
  OGG: ["coastal"], // trade winds funnel across Maui's central valley: a famously breezy approach
  SJU: ["coastal"], // trade winds and afternoon sea-breeze showers
  CUN: ["coastal", "hot_afternoon"], // Caribbean sea breeze; tropical afternoon showers
  MBJ: ["coastal"], // Montego Bay shoreline; trade winds and an afternoon sea breeze
  NAS: ["coastal"], // low island site; trade winds across the runway
  PUJ: ["coastal"], // Caribbean trade winds along the coast
  LIM: ["coastal"], // Pacific coast under the marine layer; onshore breeze every afternoon
  GIG: ["coastal"], // Guanabara Bay site; sea breeze on summer afternoons
  SYD: ["coastal"], // southerly busters and the afternoon sea breeze over Botany Bay
  BNE: ["coastal"], // Moreton Bay sea breeze on summer afternoons
  PER: ["coastal", "exposed"], // the "Fremantle Doctor" sea breeze arrives most summer afternoons
  AKL: ["coastal", "exposed"], // Manukau Harbour approach; westerly winds most of the year
  HKG: ["coastal", "terrain"], // Lantau's hills bend the wind over the sea approaches on breezy days
  HND: ["coastal"], // Tokyo Bay: runways on reclaimed land; sea breeze on summer afternoons
  KIX: ["coastal"], // artificial island in Osaka Bay; sea breeze and typhoon-season wind
  DPS: ["coastal"], // runway built out into the sea at Bali; tropical sea breeze
  LIS: ["coastal"], // Atlantic nortada wind on summer afternoons
  NCE: ["coastal"], // approach over the Mediterranean; afternoon sea breeze and Alpine foehn days
  BCN: ["coastal"], // approach along the coast; afternoon sea breeze
  ATH: ["coastal"], // Saronic Gulf site; summer afternoon sea breeze and the meltemi wind
  IST: ["coastal"], // Black Sea coast north of the city; the poyraz north-easterly
  TLV: ["coastal"], // Mediterranean sea breeze most afternoons
  CMN: ["coastal"], // Atlantic coastal plain; afternoon onshore breeze
  LOS: ["coastal"], // Lagos lagoon coast; sea breeze and wet-season showers
  ACC: ["coastal"], // Gulf of Guinea coast; sea breeze most afternoons
  CPT: ["coastal", "exposed"], // the "Cape Doctor" south-easter blows hard across the summer afternoons
  KEF: ["coastal", "exposed"], // Atlantic lows bring strong wind most of the year
  // ── Terrain: mountains and valleys around the airport ──
  DEN: ["terrain"], // the Rockies 30 mi west: mountain-wave and downslope wind on the approach in winter and spring
  SLC: ["terrain"], // the Wasatch range right beside the field; canyon winds
  YYC: ["terrain"], // the Rockies' foothills to the west: chinook winds and mountain wave in winter and spring
  RNO: ["terrain"], // Sierra Nevada wave and valley winds; summer afternoon thermals
  ABQ: ["terrain"], // high desert plateau beside the Sandia mountains; afternoon thermals
  ELP: ["terrain", "hot_afternoon"], // Franklin Mountains beside the field; hot desert afternoons
  BOI: ["terrain"], // approach up the Boise valley with mountains to the north-east
  GEG: ["terrain"], // plateau site with the Rockies' foothills to the east
  ZRH: ["terrain"], // the Alps to the south: foehn wind days stir the approach
  GVA: ["terrain"], // between the Jura and the Alps; the bise and foehn winds
  MXP: ["terrain"], // the Alps to the north: foehn wind days stir the approach over the Po plain
  VCE: ["terrain"], // the Alps and Dolomites to the north; the bora wind off the Adriatic in winter
  MEX: ["terrain"], // high valley at 7,300 ft ringed by mountains; afternoon convection in the wet season
  BOG: ["terrain"], // 8,400 ft plateau in the Andes; afternoon showers
  SCL: ["terrain"], // the Andes right beside Santiago; valley winds
  KTM: ["terrain"], // Himalayan valley: terrain on every side of the approach
  ADD: ["terrain"], // 7,600 ft plateau; afternoon showers in the rainy season
  NBO: ["terrain"], // 5,300 ft plateau; afternoon thermals in the dry season
  // ── Hot afternoons: heat, rising air and showers ──
  PHX: ["hot_afternoon"], // desert heat: afternoon thermals and monsoon showers in summer
  TUS: ["hot_afternoon", "terrain"], // desert heat with mountains on three sides
  LAS: ["hot_afternoon", "terrain"], // desert heat; wind off the Spring Mountains
  DFW: ["hot_afternoon"], // Texas summer heat; spring and summer afternoon showers
  DAL: ["hot_afternoon"], // the same Dallas summer pattern as DFW
  IAH: ["hot_afternoon"], // Gulf humidity: afternoon showers most summer days
  HOU: ["hot_afternoon"], // the same Houston summer pattern as IAH, nearer the bay
  AUS: ["hot_afternoon"], // Texas Hill Country heat and summer afternoon showers
  SAT: ["hot_afternoon"], // the same south Texas summer pattern as Austin
  MSY: ["hot_afternoon", "coastal"], // Gulf coast humidity; afternoon showers most summer days
  ATL: ["hot_afternoon"], // humid southern summers: afternoon showers build most days
  MCO: ["hot_afternoon"], // central Florida: afternoon showers nearly every summer day
  DEL: ["hot_afternoon"], // pre-monsoon heat and dust in late spring; monsoon showers in summer
  BOM: ["hot_afternoon", "coastal"], // monsoon showers June–September; sea breeze the rest of the year
  BKK: ["hot_afternoon"], // tropical afternoon showers most of the year
  SIN: ["hot_afternoon", "coastal"], // equatorial: afternoon showers nearly every day; Changi sits on the strait
  KUL: ["hot_afternoon"], // the same equatorial afternoon pattern as Singapore
  CGK: ["hot_afternoon", "coastal"], // tropical afternoon showers; sea breeze off the Java Sea
  MNL: ["hot_afternoon", "coastal"], // tropical afternoon showers; bay sea breeze
  SGN: ["hot_afternoon"], // tropical afternoon showers in the wet season
  DXB: ["hot_afternoon", "coastal"], // desert heat: afternoon thermals in summer; Gulf sea breeze
  AUH: ["hot_afternoon", "coastal"], // the same Gulf heat and sea breeze as Dubai
  DOH: ["hot_afternoon", "coastal"], // the same Gulf heat and sea breeze as Dubai
  // ── Exposed: open, breezy sites ──
  AMS: ["exposed"], // polder site by the North Sea: strong crosswinds in autumn and winter
  LHR: ["exposed"], // open Thames valley site; Atlantic lows bring breezy winter days
  MAN: ["exposed"], // open site in the north-west; Atlantic weather systems
  EDI: ["exposed"], // Firth of Forth site: breezy most of the year
  DUB: ["exposed", "coastal"], // Irish Sea site; Atlantic wind in autumn and winter
  CPH: ["exposed", "coastal"], // Øresund site: wind off the strait in autumn and winter
  ORD: ["exposed"], // flat, open prairie site; winter weather systems and lake-effect wind
};

/**
 * The traits of a catalogue airport: the table's row, plus coastal / terrain whenever the
 * generator's coastal set or mountain boxes say so (so the lists cannot drift apart). Empty for
 * a typical airport or an unknown code.
 */
export function airportTraits(code: string): readonly AirportTrait[] {
  const key = code.trim().toUpperCase();
  const airport = getAirport(key);
  if (!airport) return [];
  const listed = AIRPORT_TRAITS[key] ?? [];
  const coastal = COASTAL_AIRPORTS.has(key) && !listed.includes("coastal");
  const terrain = mountainRangeAt(airport.lat, airport.lon) !== null && !listed.includes("terrain");
  if (!coastal && !terrain) return listed;
  const out: AirportTrait[] = [...listed];
  if (coastal) out.push("coastal");
  if (terrain) out.push("terrain");
  return out;
}
