# Real data for version D — plan and source map

Written 2026-11-04 from a source survey (nine parallel readers and researchers over the code and the
official pages of every candidate source) and the team rule in docs/FEASIBILITY.md: show nothing a real
product could not obtain. Today every flight fact in `/d` comes from the deterministic generator in
`shared/src/search.ts` + `fakeFlight.ts`, computed in the browser. This document says which real source
replaces which piece, in what order, and what each costs.

## The finding that reshapes the plan

**Amadeus Self-Service is gone.** The portal and its API keys were retired on 17 July 2026 (the
`amadeus4dev` GitHub organisation is archived, `test.api.amadeus.com` no longer resolves, every
Self-Service doc URL redirects to the enterprise home). Flight Offers Search, Seatmap Display and
On-Demand Flight Status, the one-stop answer for schedules, fares and seat maps, are now enterprise
contracts only. Everything below is built on what a small team can actually sign up for.

## What becomes real, from where (by step)

| Step | What D shows | Source | Access and cost | Terms that shape the design |
| --- | --- | --- | --- | --- |
| 1 | The day's nonstops: operating carrier, flight number, local times, day offset, block time, scheduled aircraft type, terminal | **AeroDataBox** FIDS (departures at the origin for the local day, filtered by destination, codeshares collapsed) | Self-service. Marketplace Basic: free, 400 units/month (about 100 route-days), non-commercial, attribution required. Pro $8/month (5,000 units). Direct Starter $19/month (40,000 units, 5 req/s). Schedules 180–365 days ahead by plan. | Contents may be cached at most 7 days (reference identifiers indefinitely); commercial use needs a paid plan; no permanent copies. |
| 1 (upgrade) | Same, with seats per cabin and a one-year horizon | FlightAware AeroAPI v4 `/schedules` | Personal tier: free up to $5/month (about 60–250 route-days) but personal or academic use only; Standard $100/month minimum for a consumer product. $0.02 per 15-record page. | Standard licence allows B2C derivative works; raw storage restricted. |
| 2 | Airport weather at both ends: condition, temperature (7 days), wind, gusts, direction, visibility (2 days) | **NOAA AWC data API** (TAF, METAR), **NWS API** (US airports), **Open-Meteo** (airports abroad) | Free, no key. AWC: 100 requests/minute, 30 days of history. Open-Meteo free tier is non-commercial (paid plans exist). | NOAA data is public domain: store it freely. Open-Meteo needs attribution (CC BY 4.0). |
| 3 | Cruise turbulence forecast within 2 days (the "forecast" basis of the cruise rating) | **NOAA GTG 3-km CONUS grids** on NOMADS (EDR along the great-circle path, 18-hour horizon, hourly cycles); AWC G-AIRMET Tango, SIGMETs and PIREPs as the simpler first pass | Free. GRIB2 files 150–170 MB per forecast hour (use the `.idx` byte ranges); 120 requests/minute per IP; only about two days are kept online, so archive what we sample. | US domestic only. International and oceanic routes need WAFS (eligibility unclear) or a paid EDR API (Meteomatics, Met Office). |
| 4 | Route history for booking-time ratings: smooth share by route and month, the usual bumpy phase, the calmest departure window; airport wind and gust patterns by month and hour | **IEM PIREP archive** (counts of turbulence reports near the path by month and hour), **IEM METAR archive** (airport climatology), BTS T-100 for traffic normalisation | Free, public domain. 1 request per second per IP; precompute monthly tables. | A bias to note: pilots report bumps, rarely smooth air; normalise by traffic. |
| 5 | Airline record: on-time across the network and on this route, last 12 months | **BTS On-Time Performance** (marketing-carrier monthly files, about 38 MB each) and UK CAA punctuality CSVs for UK routes | Free, public domain; 2–3 months behind. | US domestic and UK routes only; other carriers get a network figure from annual reports or "not available". |
| 5 | The safety basis | IOSA registry (hand-checked quarterly), FAA IASA categories, EU Air Safety List, NTSB | Free to read; no APIs. | Show facts (registered, overseen by, not on the EU list), never a number. The 92–99 "safety score" goes. |
| 6 | Aircraft: fleet-average age per airline and type; the assigned tail, its age and delivery year a day out | **AeroDataBox** aircraft-by-registration and fleet endpoints; **FAA registry** (US tails, free); airline 10-K fleet tables | Included in the AeroDataBox plan; FAA registry is a free weekly download. | Fleet ages recomputed within the 7-day cache window unless on a higher plan. |
| 6 | Seat pitch, width, layout, seat count | A hand-maintained table per airline and subfleet from the airlines' own aircraft pages (about 150 rows), seatmaps.com later | Free (manual) or quote. | No free machine-readable source exists; SeatGuru is stale and unlicensed. |
| 7 | Day of travel: gate, terminal, revised and actual times, delays | **AeroDataBox** flight status; **FAA NAS status** for airport-wide delays | Ultra $37.50–40/month covers about 25,000 status calls. | Gates appear hours before departure; keep "posted on the day". |
| — | Fares | None legitimately self-service for a comparison tool: Duffel bans metasearch use; Google Flights via SerpApi is scraped | — | Keep fares illustrative and say so, or show BTS DB1B "typical fare" bands (domestic, quarterly). Live fares need a booking partnership. US DOT rules: a displayed fare must be the full price at the moment shown. |
| — | Open seats and recommended seats "open right now" | Not obtainable without a booking API | — | Show the smoothest rows from the layout only; point to the airline's seat map. |
| — | Cabin-crew rating from passenger reviews | Not licensable (Skytrax terms) | — | Drop. |

Static reference that stays hand-maintained and labelled: crew rules per regulator, aircraft-type facts
(in service since, fleet size, cabin-noise band, not a dB figure), the sounds timeline per aircraft
family, the A-check explainer, the seat-zone model (over the wing is smoothest).

## Architecture (step 1 builds it; later steps fill it)

- **Backend** (`backend/`, Hono on Vercel): `GET /flights/day?from=JFK&to=LAX&date=YYYY-MM-DD` returns
  the day's schedule rows for the route (operating carrier, flight number, local times, day offset,
  block minutes, aircraft type, terminal, codeshares, `fetchedAt`, `provider`). Provider adapters behind
  one interface: `generator` (today's timetable, so the app works with no key) and `aerodatabox`.
  Results are cached in Supabase (`route_days`: route, date, provider, fetched_at, expires_at, payload)
  with a 24-hour TTL and a hard 7-day expiry (the AeroDataBox cache rule); a short in-memory LRU in
  front. Keys live only in server env (`FLIGHT_PROVIDER`, `AERODATABOX_API_KEY`). The existing per-IP
  rate limit applies.
- **Shared** (`shared/`): a provider-agnostic `ScheduleRow` type and `optionsFromSchedule(day, rows)`,
  which turns real rows into `FlightOption[]` through the generator's existing
  `buildScheduledFlight(day, spec)`. Everything a later step has not made real yet (weather, turbulence,
  seats, sounds) is still generated from the real row's facts, so the ratings and every page keep
  working, and each basis line keeps saying what it rests on. The aircraft catalogue grows to cover
  what real schedules return (737 MAX, A321ceo, 777-200, E175, CRJ-900, A220) with a family fallback.
  `generateFlight` (the A/B study) does not change; `search.ts` stays the C contract.
- **Frontend** (`frontend/`, D only): a client-side day store (`lib/flights/`) that fetches a route-day
  once through `/api/flights/day`, keeps it for the session, and serves every D page from the same
  snapshot (results, flight, compare, tray, date strip), so "cheapest", price ranks and marks never
  disagree between pages. The shared C components take the store through the tool context (an optional
  source; C keeps the generator). Loading shows the mascot state.
- **Labels**: each field carries where it came from; the UI says "scheduled aircraft, can change",
  "typical fare, not a live price", "forecast as of …". Horizons become data-driven: a field is shown
  when the provider returned it, not only when the calendar allows.

## Order of work

1. Data layer + real schedules (AeroDataBox; the generator as fallback). Needs: an AeroDataBox key
   (free Basic for development; Pro $8/month before the public sees it; attribution line on the page).
2. Real airport weather (free): the takeoff and landing rating within 7 and 2 days.
3. Real route history (free archives, precomputed monthly): booking-time ratings for cruise and
   takeoff/landing on real climatology.
4. Airline on-time from BTS (free, monthly job) and the factual safety basis; drop the invented scores.
5. Aircraft and airframe facts (AeroDataBox + FAA registry) and the seat-spec table.
6. Cruise turbulence forecast from GTG grids (US domestic), the heaviest build.
7. Day-of status (gate, delays) on the flight page.
Fares and seat availability wait for a business decision (booking partner) and stay labelled.

## Rules for storing real data

- NOAA, NWS, BTS, IEM, FAA registry: public domain, store and model freely (attribute NOAA where
  unaltered).
- AeroDataBox: cache contents at most 7 days; keep only identifiers (codes, flight numbers,
  registrations) longer; attribution while on a free plan; paid plan for any commercial use.
- FlightAware: Personal tier is academic/personal only; Standard for a consumer product; do not store
  raw responses beyond the licence.
- Open-Meteo: attribution; paid plan once commercial.
- Fares (if ever shown as real): full price at the moment shown, code-share operator named on the first
  screen, quoted-at time visible.

## Step 1 build specification (the contract between the three parts)

### Shared: `shared/src/schedule.ts` (new, pure; no fetch, no Node APIs)

```ts
/** One nonstop flight in a route's published schedule, as a provider returns it. */
export interface ScheduleRow {
  /** Operating carrier IATA designator, e.g. "DL". */
  airline: string;
  /** Carrier name as the provider gives it (used when the carrier is not in the catalogue). */
  airlineName?: string;
  /** Flight number digits as published, e.g. "1423" (no carrier prefix, no spaces). */
  number: string;
  /** The airports as flown (IATA), the local departure date and local wall-clock times. */
  origin: string;
  destination: string;
  date: string;          // "YYYY-MM-DD" at the origin
  departTime: string;    // "HH:MM" local at the origin
  arriveTime: string;    // "HH:MM" local at the destination
  arriveDayOffset: number;
  /** Published gate-to-gate minutes (from the two scheduled instants). */
  blockMin: number;
  /** The aircraft as the provider names it: an ICAO or IATA type code and/or free text. */
  aircraft: { code?: string; name?: string };
  /** Origin terminal when published. */
  terminal?: string;
  /** Marketing carriers selling this flight under their own numbers (informational). */
  codeshares?: string[];
}

export interface RouteDaySchedule {
  origin: string;
  destination: string;
  date: string;
  provider: "generator" | "aerodatabox";
  /** ISO instant the rows were fetched from the provider. */
  fetchedAt: string;
  rows: ScheduleRow[];
  /** true: the route has nonstop service; false: nobody flies it nonstop; null: unknown (a day with no rows). */
  served: boolean | null;
}

/** Real rows → the day's FlightOption[] (search.ts shape), each flight hydrated by buildScheduledFlight. */
export function optionsFromSchedule(schedule: RouteDaySchedule): SearchResults;
/** The catalogue key for a provider's aircraft code or name ("B738" → "737-800"), or a family fallback. */
export function resolveAircraftKey(aircraft: { code?: string; name?: string }): string;
/** The schedule rows the generator would produce for a route-day (so the backend's generator provider and tests share one path). */
export function generatedSchedule(input: FlightInput, fetchedAt: string): RouteDaySchedule;
```

Rules: `optionsFromSchedule` sorts by departure time, drops rows whose key (`airline + number`, uppercase)
repeats within the day, builds `routeDay(input)` for the shared facts, maps each row to a
`ScheduledFlightSpec` (id `hashId("c|ORIGIN|DEST|DATE|KEY")`, seed `c|ROUTE|DATE|KEY`, the catalogue
aircraft key, `blockMin` at least the day's airborne time plus 15, air block and air time from the
departure minute as `search.ts` does) and an illustrative fare through the same `fareFor` path (exported
as `illustrativeFare`); `fareAt` keeps working. A carrier outside `AIRLINES` gets a fallback profile
(`fallbackAirlineProfile(code, name, country?)` in `airlines.ts`: standard tier, no hubs, regulator by
country); `buildScheduledFlight` accepts the profile through an optional `airlineProfile` on the spec.
The aircraft catalogue gains the types real schedules return (737-700, 737 MAX 8, 737 MAX 9, A319,
A320-200, A321-200, 777-200ER, 787-8, A330-300, A330-200, E175, CRJ-900, CRJ-700, 747-8, A380-800) with
reference facts from manufacturer pages, and `resolveAircraftKey` maps ICAO/IATA codes and common
names to keys, with a family fallback (unknown narrow-body → "A320neo"-class facts flagged `approximate`).
`generateFlight` and the exported shapes of `search.ts` do not change (additive exports only);
`shared/scripts/check-schedule.ts` checks determinism, key uniqueness, the horizon rules and that
`generatedSchedule` → `optionsFromSchedule` reproduces `searchFlights` for a sample of route-days.

### Backend: `GET /flights/day?from=JFK&to=LAX&date=YYYY-MM-DD`

- Validates `from`/`to` (3 uppercase letters, in the airport catalogue) and `date` (`YYYY-MM-DD`, from
  yesterday to 330 days ahead by the server clock). `400 { ok:false, error }` otherwise.
- Responds `200 { ok: true, schedule: RouteDaySchedule, cached: boolean }` with
  `Cache-Control: public, max-age=600` (overriding the app-wide no-store for this route only).
- Provider from `FLIGHT_PROVIDER` (`generator` default, `aerodatabox`, `fixture` for tests, which reads
  `backend/fixtures/aerodatabox/*.json`). Interface:
  `interface ScheduleProvider { name; fetchDay(from, to, date): Promise<RouteDaySchedule> }`.
- Cache: in-memory LRU (256 route-days, TTL 24 h) in front of Supabase table `route_days`
  (`route text, date date, provider text, fetched_at timestamptz, expires_at timestamptz, payload jsonb,
  primary key (route, date, provider)`), TTL 24 h, never served past 7 days (the AeroDataBox cache rule);
  without Supabase the memory cache alone. Expired rows are overwritten on refresh.
- AeroDataBox adapter: two FIDS calls (`/flights/airports/iata/{from}/{date}T00:00/{date}T12:00` and
  `{date}T12:00/{date}T23:59`, `direction=Departure&withLeg=true&withCodeshared=false&withCargo=false&withPrivate=false&withCancelled=false`),
  keep rows whose `arrival.airport.iata === to` and `codeshareStatus !== "IsCodeshared"` and `isCargo === false`, map `number` ("DL 1423"), `airline.iata/name`,
  `aircraft.model`, `departure.scheduledTime.{local,utc}`, `arrival.scheduledTime.{local,utc}`,
  `departure.terminal`. Host and headers from env: `AERODATABOX_API_KEY`, `AERODATABOX_HOST`
  (`rapidapi` → `https://aerodatabox.p.rapidapi.com` with `x-rapidapi-key` + `x-rapidapi-host`;
  `direct` → `https://api.aerodatabox.com` with the `X-Api-Key` header, as the OpenAPI spec states). A
  non-200 or a network error surfaces as `502 { ok:false, error:"provider_error" }`; a `204` is a day with
  no rows. One retry on 429 after the `Retry-After`. The per-IP rate limit middleware applies.
- Env example and README get the three variables; `schema.sql` gains the table (idempotent).
- Tests (`backend/scripts/test.ts`): the route with the generator provider, the fixture provider's
  mapping (times, offsets, block minutes, codeshare exclusion, terminal), cache hit/miss/expiry, validation.

### Frontend (version D only; A, B and C keep the generator)

- `frontend/lib/flights/store.ts`: a module-level day store keyed `ORIGIN|DEST|DATE` with
  `useRouteDay(day)` (`useSyncExternalStore`) returning `{ status: "loading"|"ready"|"error", results, provider, fetchedAt }`,
  `peekRouteDay(day)` (sync, null until ready) and `ensureRouteDay(day)` (starts a fetch once). The loader
  calls `/api/flights/day`, then `optionsFromSchedule` in the browser; when the API is unreachable or
  `API_URL` is unset it falls back to the generator and marks the provider `generator`. Entries are
  frozen `SearchResults`, so every page shares one snapshot.
- `frontend/lib/flights/source.ts`: `FlightSource { searchFlights(q): SearchResults | null; findOption(q, key): FlightOption | null | undefined; ensure(q): void }`
  with `generatorSource` (always ready) and `storeSource`. `ToolInfo` gains `flights: "generator" | "store"`
  (`c` → generator, `d` → store); `useFlightSource()` from the tool context.
- Shared components take the source through the context with the generator as the default behaviour:
  `FlightPage.resolve` (a "loading" view until the day is ready; `nextDay` through the source),
  `facts.ts resolveColumns` + `ComparePage` (loading until every item's day is ready),
  `CompareTray.lookUp` (chips show the key until ready), `DateStrip` (a tile shows a quiet placeholder
  until its day is ready), `DCompareTable.optionsOn`, `DResults.runSearch` (the mascot loading state while
  the day loads; errors use the existing notice).
- Attribution and labels: under the results count, "Schedules: AeroDataBox · fares are illustrative" when
  the provider is AeroDataBox (required on the free plan), and "Illustrative schedule" when it is the
  generator; the fare copy already says illustrative.
- Nothing about events, query parameters or the compare/choice ids changes; keys are still
  `AIRLINE+NUMBER`.
