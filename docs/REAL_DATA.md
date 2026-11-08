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
| 2 | Airport weather at both ends: condition and temperature (7 days); wind, gusts, direction, visibility, chance of rain and a calm note (2 days); the wind and weather in the takeoff and landing rating (2 days) | **NWS API** gridpoint forecast (US and Puerto Rico airports, about 8 days), **NOAA AWC data API** (TAF for 9–30 hours and METAR, every airport by ICAO code), **Open-Meteo** (the base series for airports abroad; in the US only what NWS leaves empty: visibility at some offices, the hours past its grid) | Free, no key. NWS: a User-Agent is required, the rate limit is not published. AWC: 100 requests/minute, no CORS (the backend proxies), 30 days of history. Open-Meteo: 10,000 calls/day, the free API is non-commercial (paid plans exist), shared hosts such as Vercel may be limited earlier. | NOAA data is public domain: store it freely, credit "NOAA". Open-Meteo is CC BY 4.0: a linked credit, a link to the licence and "adapted" next to its data. Weather is kept at most a day. |
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
2. Real airport weather (free; NWS, AWC TAF and METAR, Open-Meteo): the weather cards within 7 days and the
   takeoff and landing rating within 2. Needs: nothing to sign up for; `schema.sql` re-run for `airport_weather`.
3. Real route history (free archives, precomputed monthly): booking-time ratings for cruise and
   takeoff/landing on real climatology.
4. Airline on-time from BTS (free, monthly job) and the factual safety basis; drop the invented scores.
5. Aircraft and airframe facts (AeroDataBox + FAA registry) and the seat-spec table.
6. Cruise turbulence forecast from GTG grids (US domestic), the heaviest build.
7. Day-of status (gate, delays) on the flight page.
Fares and seat availability wait for a business decision (booking partner) and stay labelled.

## Rules for storing real data

- NOAA, NWS, BTS, IEM, FAA registry: public domain, store and model freely (attribute NOAA where
  unaltered; version D names "NOAA" wherever its weather shows).
- AeroDataBox: cache contents at most 7 days; keep only identifiers (codes, flight numbers,
  registrations) longer; attribution while on a free plan; paid plan for any commercial use.
- FlightAware: Personal tier is academic/personal only; Standard for a consumer product; do not store
  raw responses beyond the licence.
- Open-Meteo (CC BY 4.0; the free API is non-commercial): next to any place its data shows, the linked credit
  "Open-Meteo.com", a link to the licence and a note that the data were adapted ("Open-Meteo.com (CC BY 4.0,
  adapted)"); at most 10,000 calls a day; a paid plan once commercial.
- Airport weather (every source): refreshed hourly and never served or kept past 24 hours, a retention choice
  (NOAA sets no limit), so every "as of" time shown is within the last day.
- Fares (if ever shown as real): full price at the moment shown, code-share operator named on the first
  screen, quoted-at time visible.

## Status (2026-11-04): step 1 is built

Branch `data/real-schedules` (on top of the version D look). What is live when `FLIGHT_PROVIDER=aerodatabox`
and `AERODATABOX_API_KEY` are set in the backend's environment:

- `/d` results, flight and compare pages show the published nonstops for the route and day (AeroDataBox
  FIDS: operating carrier, flight number, local times, arrival and day offset, block time, aircraft
  type, terminal), hydrated with the generator's weather, turbulence, seats and sounds until the later
  steps make those real. A first check of JFK→LAX on 12 Nov 2026 returned 30 real flights (JetBlue,
  American and Delta, A320/A321/767/777/A330, terminals 4, 5 and 8).
- Every page says where the schedule came from ("Schedules: AeroDataBox · fares are illustrative", or
  "Illustrative schedule" when the generator stands in). A type the catalogue has no entry for keeps the
  schedule's own name and says the facts shown are a similar type's.
- Cost control: a route-day costs 4 AeroDataBox units (two 12-hour FIDS windows); the server caches a
  day for 24 hours (file store in development, Supabase `route_days` in production; nothing older than
  7 days is ever served or kept) and refuses more than `FLIGHT_PROVIDER_ROUTE_DAYS_PER_HOUR` (default
  60) provider calls an hour. The date strip no longer loads the six other days; a tile says "Tap to see"
  until that day is opened. On the free Basic plan (400 units a month) that is about 100 fresh
  route-days a month.
- Without a key, or when the API cannot answer, the pages fall back to the generator and say so.
  Versions A, B and C are untouched (frozen pixel captures of 14 pages identical to main; the study's
  generator hash guard passes).

To run it: `FLIGHT_PROVIDER=aerodatabox`, `AERODATABOX_API_KEY=…`, `AERODATABOX_HOST=rapidapi` in
`backend/.env`, then `npm run dev` and open `/d?test=1`. Production needs the same three variables on
the backend's Vercel project and `backend/supabase/schema.sql` re-run for the `route_days` table.

Next: step 2 (real airport weather, free) and step 3 (route history from the public archives).

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

## Step 2 build specification (real airport weather)

Written 2026-11-04 on branch `data/real-weather` (cut from `data/real-schedules` at `e546570`), from a design
review: three designs, three judges and three readers over the code and the live APIs. Real forecasts and
observations replace the generator's invented weather at both ends of every version D flight, wherever a
source has a figure for the flight's own hour; everything else works as in step 1 and says so. As for step 1,
three builders (Shared, Backend, Frontend) work from this section alone: every name, string and number they
must agree on is here.

The API answers the fixtures are cut from were saved on 2026-11-04 between 15:21Z and 15:33Z in
`S = /private/tmp/claude-501/-Users-jaimevaldes-Desktop-Capstone-Dashboard-Prototype/3df0b1f8-250b-4a0f-af75-3e14cce1a7b5/scratchpad/wx/samples/`.
That is a session folder: copy the files listed under Fixtures into `backend/fixtures/weather/` before it is
cleared.

What does not change: `generateFlight`, `buildCore`, `referenceDay`, `searchFlights` and every A/B/C page (the
study's hash, `AB_SNAPSHOT` in `shared/scripts/check-search.ts`, keeps its value); `WeatherCondition` (nine calm
conditions: the icon); `impact` (`"none" | "minor"`: the tint); `shared/src/forecast.ts` (the horizons stay the
product rule: condition and temperature from `WEATHER_FORECAST_DAYS` = 7 days out, wind, gusts, visibility,
chance of rain and the note from `WEATHER_DETAIL_DAYS` = 2); the air block's bump draw (`air.wx` in
`buildScheduledFlight`): real weather re-words a flight's causes and its takeoff and landing notes, never its
bumps; `RouteDayState`; the study's records (they never carry weather).

### Decisions

1. **One seam.** An optional `weatherAt` callback on `ScheduledFlightSpec`, used where `buildScheduledFlight`
   binds `weather`. `optionsFromSchedule(schedule, weather?)` builds it from the two airports' records. No
   records, no change, byte for byte.
2. **One record per airport, not per airport-day.** `GET /weather/airport?code=JFK` answers the airport's hourly
   rows (UTC instants, about 10 days from 00:00Z today) and its latest observation. One record serves every
   date in the horizon, and next-day arrivals.
3. **Who leads where.** US and Puerto Rico airports: the NWS gridpoint forecast sets every figure it has. Every
   airport: the AWC TAF sets wind, gust, visibility, cloud and weather while it is valid (9–30 hours). Open-Meteo
   is the base series abroad and, in the US, fills only what NWS leaves empty: visibility at forecast offices
   that publish none (LOX and HFO in the samples: LAX and HNL), the hours past the grid's end (about 7.8–8.3 days
   from early today), and everything when NWS does not answer. This refines the source map's "NWS for US
   airports, Open-Meteo abroad": NWS alone would leave LAX and HNL with no visibility past the TAF and day-7
   evenings with no forecast. Each row records the sources that set it, so a US hour credits Open-Meteo only
   when Open-Meteo set one of its figures.
4. **The observation stays apart.** The latest METAR (kept only when at most 90 minutes old at the fetch) sits
   beside the rows, not in them, and stands in for a moment within 60 minutes of its `obsTime`. Its report says
   "Observed …" at that `obsTime`; its chance of rain is the forecast's, and the line under the card says so.
   No clock is passed to the pure builder: an observation can only describe moments within an hour of when it
   was made, which is true whenever the page is read.
5. **Nothing is estimated.** A report needs temperature, wind, cloud, visibility and chance of rain for its hour,
   each from a source; otherwise that end keeps the generated report and is labelled illustrative.
6. **TEMPO and PROB groups never move a figure.** The TAF's prevailing groups (the base group, `FM`, and `BECMG`
   from `timeBec`) set the figures. A `TEMPO` or `PROB40` group adds a note clause ("Gusts to 27 knots are
   possible at times (a 40% chance).") and a `PROB30` group a slight chance.
7. **Gusts by source.** TAF and METAR gusts as reported. NWS gusts only at 10 knots or more over the mean wind
   (the reporting convention; 6 of the 187 saved JFK hours). Open-Meteo's gust is the preceding hour's maximum
   and runs about twice the mean on an ordinary day (LHR sample: mean 5.8 kt, gusts 12.7 kt; HNL 10.9 and
   25.5), so it shows only at 25 knots or more and 15 over the mean (4 of 363 LHR hours).
8. **Calm words for real weather, without hiding it.** No new condition: the label tells the truth ("Thundery
   showers", "Freezing rain", "Heavy snow", "Dense fog", "Cloudy and windy"), the note says what usually follows
   (a wait, de-icing, a longer way in) in the generator's voice, and the takeoff & landing rating counts
   thunder, heavy showers, freezing precipitation, heavy snow and winds of 25 knots or more.
9. **Every real figure says what it is and when.** `WeatherReport.source` (additive) carries the kind
   (forecast, model, observation), the sources and the instant, with its label on the airport's clock
   ("Wed 7:41 AM"), built once in pure code. D shows a line under each weather card, a credit on each page that
   uses weather, and a footer on the takeoff & landing sheet. Open-Meteo's credit is a link, links the licence
   and says the data were adapted (CC BY 4.0).
10. **Time is instants.** Every row is a UTC instant; Open-Meteo is asked with `timezone=UTC&timeformat=unixtime`;
    an overlay applies to a row when the row's instant falls inside the overlay's interval; the hour pick is the
    nearest complete row by instant. Half-hour and quarter-hour zones (DEL, BOM, BLR, HYD, MAA, CCU, AMD, CMB,
    KTM) and DST need nothing special.
11. **The backend mirrors step 1:** a provider interface; an `AirportWeatherCache` twin of `RouteDayCache` (TTL
    1 h, 10 min when a source was missing, ceiling 24 h, an hourly budget, in-flight sharing, stale-if-error); a
    durable `airport_weather` table; `Cache-Control: public, max-age=600`; the same error codes; fixtures from
    the saved answers, run through the live mapping.
12. **Polite to free sources.** User-Agent `preflight-clarity capstone prototype` (plus `WEATHER_CONTACT` when
    set); TAF then METAR, 250 ms apart, under an allowance of 50 AWC calls a minute per process; a static NWS
    grid table, so a cold start skips `/points`; 120 airports an hour per process; no source is called from the
    browser (AWC sends no CORS headers).
13. **The day settles once.** The day store fetches the schedule and both airports' records together and builds
    one frozen snapshot with the real reports inside. No second store, no re-settle, no new state fields.
14. **Built in parallel from a contract commit.** Shared lands every new type and signature first, with stub
    bodies that return "nothing real" (`null`, `[]`, `undefined`), so the app keeps working; then the three
    bodies are built at once.

### Shared

#### `shared/src/types.ts` (additive)

```ts
/** A real weather source behind a WeatherReport (version D, step 2; shared/src/weather.ts). */
export type WeatherSourceName = "nws" | "open-meteo" | "awc-taf" | "awc-metar";

/** Weather a source names for an hour; the backend maps NWS, WMO and METAR/TAF codes onto it. */
export type WxPhenomenon =
  | "thunderstorm" | "hail" | "freezing_rain" | "freezing_drizzle" | "sleet"
  | "snow" | "snow_showers" | "blowing_snow" | "rain_showers" | "rain" | "drizzle"
  | "freezing_fog" | "fog" | "mist" | "haze" | "smoke" | "dust";
export type WxIntensity = "light" | "moderate" | "heavy";
/** How likely the source says it is. "slight" (TAF PROB30, NWS slight chance or isolated, Open-Meteo under 25 %) only ever makes a note clause. */
export type WxChance = "slight" | "chance" | "likely" | "definite";

export interface WxEvent {
  phenomenon: WxPhenomenon;
  intensity: WxIntensity;
  chance: WxChance;
  /** "nearby": a METAR/TAF VC group; "patchy": NWS patchy or areas, METAR MI/BC/PR fog; "scattered": NWS scattered. Absent: at the airport. */
  where?: "nearby" | "patchy" | "scattered";
  /** From a TAF TEMPO group (null) or a PROB40 group (40): at times, never the hour's prevailing weather. Absent: prevailing, or a slight chance. */
  tempo?: number | null;
}

/** Where a real WeatherReport's figures came from, and when. Absent on a generated report (A/B/C never see one). */
export interface WeatherProvenance {
  /**
   * "forecast": an official forecast (NWS grid, TAF) set figures, Open-Meteo perhaps filling some;
   * "model": Open-Meteo alone; "observation": the airport's METAR (the chance of rain is the forecast's).
   */
  kind: "forecast" | "model" | "observation";
  /** The sources behind the figures, most specific first: "awc-metar", "awc-taf", "nws", "open-meteo". */
  sources: WeatherSourceName[];
  /**
   * ISO instant. forecast: the oldest issue time among its official sources (NWS updateTime, TAF issueTime);
   * model: when Open-Meteo was asked (it publishes no run time); observation: the METAR's obsTime.
   */
  at: string;
  /** `at` on the airport's clock, "Wed 7:41 AM": built once here, so no renderer needs a clock or a time zone. */
  atLabel: string;
  /** The event that set the label; null when the sky and the wind did. */
  headline: WxEvent | null;
  /** Said as note clauses: TEMPO/PROB40 events first, then slight chances. */
  possible: WxEvent[];
  /** A TEMPO or PROB40 gust: in the note, never the shown gust, never in a rating. */
  possibleGust: { kts: number; probability: number | null } | null;
  /** visibilityMi is a floor: the source said "more than 6 miles" (P6SM, 9999) and nothing finer agreed. */
  visibilityFloor: boolean;
}

export interface WeatherReport {
  // …every existing field unchanged; windDir's comment gains: on a real report "" when calm (under 3 knots)
  //    and "Variable" when the direction varies…
  /** Version D only: present when the figures are real (shared/src/weather.ts realWeatherReport). */
  source?: WeatherProvenance;
}
```

`WeatherCondition`, `Flight`, `Airport`, `ForecastStatus`, `FlightSummary` and `SessionRecord` are unchanged; the
records rebuild `FlightSummary` from literal keys, so older records parse as before. ICAO codes are not added to
`Airport`: every serialised Flight carries its airports, so a new field would move the study's hash.

#### `shared/src/tz.ts` (new, pure)

The private zone helpers of `fakeFlight.ts:145-220` (`formatterFor`, `localParts`, `tzOffsetMinutes`, `localToUtc`,
`utcToLocal`), copied with the same `FORMATTERS` cache and exported; `fakeFlight.ts` keeps its own copies.

```ts
/** Offset of `tz` from UTC in minutes at `utcMs` (0 for an unknown zone, read as UTC). */
export function tzOffsetMinutes(tz: string, utcMs: number): number;
/**
 * The instant of local "HH:MM" on "YYYY-MM-DD" in `tz`, in two passes. A fall-back time that repeats is its first
 * occurrence (01:30 on 2026-11-01 in New York is 05:30Z); a time inside a spring-forward gap lands an hour from
 * the gap, on either side by zone (02:30 on 2027-03-14 in New York is 06:30Z, 01:30 on 2027-03-28 in London is
 * 01:30Z). Published schedules never use those times.
 */
export function localToUtc(dateIso: string, hhmm: string, tz: string): number;
/** The local date, "HH:MM" and fractional hour of an instant in `tz`. */
export function utcToLocal(utcMs: number, tz: string): { date: string; time: string; hour: number };
/** "Wed 7:41 AM": the instant on the zone's clock (the first three letters of the weekday, formatTime12). */
export function clockLabel(utcMs: number, tz: string): string;
```

`new Date(utcMs)` appears in this file only to feed `Intl.DateTimeFormat.formatToParts`, which is deterministic
for an instant and a zone.

#### `shared/src/airportIcao.ts` (new, pure)

```ts
/**
 * ICAO location indicators for the 187 catalogue airports, for the Aviation Weather Center's TAF and METAR.
 * OurAirports airports.csv, `icao_code` by `iata_code` (public domain), checked against AWC's station list on
 * 2026-11-04. Kept apart from Airport so the study's serialised flights do not change.
 */
export const ICAO_BY_IATA: Readonly<Record<string, string>>;
/** The ICAO code for a catalogue IATA code (case-insensitive); null for anything else, synthetic airports included. */
export function icaoFor(iata: string): string | null;
```

The table, verified against both sources (186 agree; one override):

```
JFK:KJFK LGA:KLGA EWR:KEWR BOS:KBOS PHL:KPHL DCA:KDCA IAD:KIAD BWI:KBWI ATL:KATL CLT:KCLT RDU:KRDU MIA:KMIA
FLL:KFLL MCO:KMCO TPA:KTPA BNA:KBNA ORD:KORD MDW:KMDW DTW:KDTW MSP:KMSP STL:KSTL MCI:KMCI CLE:KCLE PIT:KPIT
CVG:KCVG IND:KIND CMH:KCMH MKE:KMKE DFW:KDFW DAL:KDAL IAH:KIAH HOU:KHOU AUS:KAUS SAT:KSAT MSY:KMSY DEN:KDEN
SLC:KSLC PHX:KPHX LAS:KLAS LAX:KLAX SAN:KSAN SFO:KSFO SJC:KSJC OAK:KOAK SMF:KSMF SEA:KSEA PDX:KPDX HNL:PHNL
OGG:PHOG ANC:PANC SJU:TJSJ BUF:KBUF ROC:KROC SYR:KSYR ALB:KALB ISP:KISP HPN:KHPN BDL:KBDL PVD:KPVD BTV:KBTV
PWM:KPWM MHT:KMHT RIC:KRIC ORF:KORF CHS:KCHS SAV:KSAV JAX:KJAX PBI:KDJT RSW:KRSW SRQ:KSRQ MYR:KMYR GSP:KGSP
TYS:KTYS SDF:KSDF MEM:KMEM BHM:KBHM DSM:KDSM OMA:KOMA OKC:KOKC TUL:KTUL ELP:KELP ABQ:KABQ TUS:KTUS RNO:KRNO
BOI:KBOI GEG:KGEG YYZ:CYYZ YVR:CYVR YUL:CYUL YYC:CYYC MEX:MMMX GDL:MMGL CUN:MMUN SJO:MROC PTY:MPTO MBJ:MKJS
NAS:MYNN PUJ:MDPC BOG:SKBO LIM:SPJC GRU:SBGR GIG:SBGL EZE:SAEZ SCL:SCEL LHR:EGLL LGW:EGKK MAN:EGCC EDI:EGPH
DUB:EIDW CDG:LFPG ORY:LFPO NCE:LFMN AMS:EHAM BRU:EBBR FRA:EDDF MUC:EDDM BER:EDDB ZRH:LSZH GVA:LSGG VIE:LOWW
PRG:LKPR WAW:EPWA BUD:LHBP CPH:EKCH ARN:ESSA OSL:ENGM HEL:EFHK KEF:BIKF MAD:LEMD BCN:LEBL LIS:LPPT FCO:LIRF
MXP:LIMC VCE:LIPZ ATH:LGAV IST:LTFM DXB:OMDB AUH:OMAA DOH:OTHH TLV:LLBG AMM:OJAI HND:RJTT NRT:RJAA KIX:RJBB
ICN:RKSI PEK:ZBAA PVG:ZSPD HKG:VHHH TPE:RCTP MNL:RPLL SGN:VVTS BKK:VTBS KUL:WMKK SIN:WSSS CGK:WIII DPS:WADD
DEL:VIDP BOM:VABB BLR:VOBL HYD:VOHS MAA:VOMM CCU:VECC AMD:VAAH LHE:OPLA KHI:OPKC DAC:VGHS CMB:VCBI KTM:VNKT
CAN:ZGGG SZX:ZGSZ CTU:ZUUU HAN:VVNB PUS:RKPK SYD:YSSY MEL:YMML BNE:YBBN PER:YPPH AKL:NZAA JNB:FAOR CPT:FACT
CAI:HECA ADD:HAAB NBO:HKJK LOS:DNMM ACC:DGAA CMN:GMMN RAK:GMMX
```

The override: PBI → KDJT. OurAirports now lists West Palm Beach under IATA DJT (icao_code KDJT); AWC answers
METAR and TAF only as KDJT, while its station list still maps PBI to KPBI. LIM is SPJC (OurAirports `icao_code`;
its frozen `ident` is SPIM).

#### `shared/src/weather.ts` (new, pure): the record

```ts
/** WEATHER_PROVIDER values a record can carry: the live sources, or the saved answers (tests). */
export type WeatherProviderName = "live" | "fixture";

export interface WeatherSourceInfo {
  name: WeatherSourceName;
  /** ISO instant: NWS updateTime, TAF issueTime, METAR obsTime; Open-Meteo publishes none, so when it was asked. */
  issuedAt: string;
}

/** One row of an airport's record: the figures for the instant `at`. null: no source had that figure. */
export interface WeatherHour {
  /** ISO instant. Live rows fall on whole UTC hours; nothing relies on it (the DEL fixture's rows fall at :30). */
  at: string;
  tempC: number | null;
  /** Mean wind in knots, and where it blows from in degrees true; windDeg null: variable. Under 3 knots reads as calm. */
  windKts: number | null;
  windDeg: number | null;
  /** The gust worth showing, filtered by its source's rule when the row was composed; always from the source that set windKts. */
  gustKts: number | null;
  /** Statute miles, at most 10. */
  visibilityMi: number | null;
  visibilityFloor: boolean;
  /** 0–100. */
  precipPct: number | null;
  cloudPct: number | null;
  /** Prevailing events, TEMPO/PROB40 events (`tempo` set) and slight chances. */
  wx: WxEvent[];
  /** The largest gust a TEMPO or PROB40 group in force allows for. */
  tempoGust: { kts: number; probability: number | null } | null;
  /** The sources that set at least one figure of this row, most specific first. */
  from: WeatherSourceName[];
}

/** The airport's latest METAR. A null field: the report had no such group. */
export interface WeatherObservation {
  /** obsTime as an ISO instant (the true observation time; reportTime is nominal). */
  at: string;
  tempC: number | null;
  windKts: number | null;
  windDeg: number | null;
  gustKts: number | null;
  visibilityMi: number | null;
  visibilityFloor: boolean;
  cloudPct: number | null;
  /** [] when the METAR reports no weather. */
  wx: WxEvent[];
}

/** GET /weather/airport's payload, the durable record's payload and the browser's per-airport cache entry. */
export interface AirportWeather {
  /** IATA, as in the catalogue. */
  airport: string;
  icao: string | null;
  /** The catalogue's IANA zone: every instant here is UTC, read locally with this. */
  tz: string;
  provider: WeatherProviderName;
  /** ISO instant the sources were asked. */
  fetchedAt: string;
  /** Every source that answered with data. */
  sources: WeatherSourceInfo[];
  /** Sources this airport should have had that did not answer (an error, a timeout, the deadline, the AWC allowance). */
  missing: WeatherSourceName[];
  /** Ascending `at`, no duplicates. */
  hours: WeatherHour[];
  /** The latest METAR when it was at most 90 minutes old at fetchedAt; else null. */
  observation: WeatherObservation | null;
}
```

Units live in the field names (°C, knots, degrees true, statute miles, percent). Stored numbers are rounded to one
decimal.

#### `shared/src/weather.ts`: the report

```ts
export const PICK_WINDOW_MS = 90 * 60 * 1000;
export const OBSERVATION_WINDOW_MS = 60 * 60 * 1000;
export const WIND_CALM = "";
export const WIND_VARIABLE = "Variable";

export interface RealWeatherInput {
  /** The airport as flown (RouteDay.origin or .destination; a search from LGA can fly from JFK). */
  airport: Airport;
  moment: "departure" | "arrival";
  /** The local date and "HH:MM" at that airport: the flight's departure, or its arrival on its own local date. */
  date: string;
  localTime: string;
  weather: AirportWeather;
}

/**
 * The real report for that moment, or null (the generated report then stands in for that end). Never throws: a
 * malformed record or row reads as missing. airportCode, city, moment and localTime are the input's, so the
 * flight checks (localTime equals departTime or arriveTime, airportCode equals the flight's) hold as before.
 */
export function realWeatherReport(input: RealWeatherInput): WeatherReport | null;
/** The nearest row within PICK_WINDOW_MS of atMs whose tempC, windKts, cloudPct, visibilityMi and precipPct are all numbers (ties: the earlier). */
export function pickHour(weather: AirportWeather, atMs: number): WeatherHour | null;

/** What the calm vocabulary reads (shown values: wind and gust rounded, visibility as shown). */
export interface HourFigures {
  windKts: number;
  gustKts: number | null;
  visibilityMi: number;
  cloudPct: number;
  wx: WxEvent[];
  tempoGust: { kts: number; probability: number | null } | null;
}
export interface CalmWeather {
  condition: WeatherCondition;
  label: string;
  impact: WeatherReport["impact"];
  impactNote: string;
  headline: WxEvent | null;
  possible: WxEvent[];
  possibleGust: { kts: number; probability: number | null } | null;
}
/** The calm vocabulary for one moment (the tables below); localTime picks "Morning fog". */
export function describeHour(figures: HourFigures, moment: "departure" | "arrival", localTime: string): CalmWeather;
/** "" under 3 knots; "Variable" for a null direction; else the generator's eight points (N, NE … NW; 45° sectors centred on each). */
export function windDirFor(windKts: number, windDeg: number | null): string;
/** Whole miles from 3 up (at most 10), halves from 1 to 3, tenths below 1 (at least 0.1). */
export function shownVisibility(mi: number): number;
```

`realWeatherReport`, in order:

1. `weather.airport !== airport.code` → null. `atMs = localToUtc(date, localTime, airport.tz)`.
2. **Observation.** When `weather.observation` exists and `|atMs − Date.parse(observation.at)| ≤ OBSERVATION_WINDOW_MS`:
   `row = pickHour(weather, atMs)` (may be null). Each group comes from the observation, or from the row when the
   METAR lacks it: temperature; wind (`windKts`, `windDeg` and `gustKts` together); visibility (`visibilityMi` and
   `visibilityFloor` together); cloud. `wx` is always the observation's, `tempoGust` none, `precipPct` always the
   row's. With every required figure present: `kind: "observation"`, `at` = `observation.at`, `sources` =
   `["awc-metar", …row.from]` without repeats. Otherwise go on to 3.
3. **Forecast.** `row = pickHour(weather, atMs)`; null → return null. `kind` = `"forecast"` when `row.from` has
   `"nws"` or `"awc-taf"`, else `"model"`. `at` = for a forecast, the earliest `issuedAt` among those official
   sources in `weather.sources`; for a model, Open-Meteo's `issuedAt` (else `fetchedAt`). `sources` = `row.from`.
4. **Shown values.** `tempC = round(tempC)`, `tempF = round(tempC × 9 / 5 + 32)`, `windKts = round(windKts)`,
   `windDir = windDirFor(windKts, windDeg)`, `gustKts = round(gust)` when that is above `windKts`, else null,
   `visibilityMi = shownVisibility(visibilityMi)`, `precipPct = round(precipPct)` clamped to 0–100.
5. `describeHour(…)` gives `condition`, `label`, `impact`, `impactNote`, `headline`, `possible`, `possibleGust`;
   `atLabel = clockLabel(Date.parse(at), airport.tz)`; `visibilityFloor` as picked.
6. Return `{ airportCode: airport.code, city: airport.city, moment, localTime, condition, label, tempC, tempF,
   windKts, windDir, gustKts, visibilityMi, precipPct, impact, impactNote, source }`.

#### The calm vocabulary (`describeHour`)

**Headline.** The first event of `figures.wx` that is neither a TEMPO/PROB40 event (`tempo` set) nor `"slight"`, in
this order of phenomena: thunderstorm, hail, freezing_rain, freezing_drizzle, sleet, snow, snow_showers,
blowing_snow, rain_showers, rain, drizzle, freezing_fog, fog, mist, haze, smoke, dust; within one phenomenon the
likelier, then the heavier. Mist, haze, smoke and dust count only when `visibilityMi ≤ 3` (otherwise they are
dropped, clauses included). No headline and `visibilityMi < 1`: the label is "Low visibility" (condition fog).

| Headline | `condition` (icon) | Base label |
| --- | --- | --- |
| thunderstorm | showers | Thundery showers (light, moderate); Heavy thundery showers (heavy) |
| hail | showers | Showers with hail |
| freezing_rain / freezing_drizzle | light_rain | Freezing rain / Freezing drizzle |
| sleet | light_snow | Sleet |
| snow | light_snow | Light snow / Snow / Heavy snow |
| snow_showers | light_snow | Snow showers (light, moderate); Heavy snow showers |
| blowing_snow | light_snow | Blowing snow |
| rain_showers | showers | Light showers / Showers / Heavy showers |
| rain | light_rain | Light rain / Rain / Heavy rain |
| drizzle | light_rain | Drizzle |
| freezing_fog | fog | Freezing fog |
| fog | fog | Dense fog (visibility ≤ 0.25 mi); Morning fog (local hour 4–9, the generator's rule); else Fog |
| mist / haze / smoke / dust (visibility ≤ 3 mi) | fog | Mist / Haze / Smoke / Dust |
| none, visibility under 1 mi | fog | Low visibility |

Qualifiers, the first that applies: `where: "nearby"` → the moderate base label plus " nearby" ("Showers nearby",
"Thundery showers nearby", "Fog nearby"); `where: "patchy"` on fog, freezing fog, mist or drizzle → "Patchy fog",
"Patchy freezing fog", "Patchy mist", "Patchy drizzle"; `where: "scattered"` on showers → "Scattered showers",
"Scattered thundery showers", "Scattered snow showers" (the generator's word for its showers); chance `"likely"` →
base plus " likely"; chance `"chance"` → base plus " possible"; `"definite"` → the base label.

**No headline: the sky, then the wind.** NWS's sky-cover categories: cloud ≤ 5 % Clear (clear), ≤ 25 % Mostly
clear (mostly_clear), ≤ 50 % Partly cloudy (partly_cloudy), ≤ 87 % Mostly cloudy (cloudy), above that Cloudy
(cloudy). The saved NWS hourly icons agree (few 6–25 %, sct 26–48 %, bkn 51–84 %, ovc 88 %), except a few "skc"
hours at 6–8 %. Then the wind: `windKts ≥ 25` or `gustKts ≥ 35` is windy: a clear, mostly clear or partly cloudy sky
becomes condition breezy, label "Windy"; a mostly cloudy or cloudy sky keeps condition cloudy (the generator's
causes still see the cloud) with the label "Mostly cloudy and windy" or "Cloudy and windy". Otherwise
`windKts ≥ 15` on a clear, mostly clear or partly cloudy sky is breezy, "Breezy" (the generator's rule).

**Impact.** `"minor"` when there is a headline (Low visibility included), or `windKts ≥ 15`, or a shown gust; else
`"none"`. Nothing stronger exists: `env/weather.ts` maps the two values to the two calm tints.

**Notes.** `impactNote` = the base note + the wind clause (headline hours only) + the gust clause + up to two weather
clauses, joined by single spaces. Worded for any reader: no "your", no "!", none of the check scripts' FORBIDDEN or
DISCOURAGED words except the thundery phrases allowed below. Where the generator has a note for the same words it is
copied verbatim (marked G).

| Family (labels) | Departure | Arrival |
| --- | --- | --- |
| Clear | wind < 10: "Light winds — ideal for takeoff." (G); else "Clear skies with a steady breeze — a smooth, routine takeoff." (G) | "Clear skies for the arrival — a straightforward approach." (G) |
| Mostly clear | wind < 10: "Light winds and mostly clear skies — ideal for takeoff." (G); else "Mostly clear with a steady breeze — a routine takeoff." (G) | "Mostly clear skies for the arrival — a straightforward approach." (G) |
| Partly cloudy | "A few clouds — no effect on the departure." (G) | "A few clouds — no effect on the arrival." (G) |
| Mostly cloudy | "A cloud layer — a few light bumps are possible while climbing through it, with clear air above." | "A cloud layer — a few light bumps are possible on the way down through it." |
| Cloudy | "An overcast layer — a few light bumps are possible while climbing through it, with clear air above." (G) | "An overcast layer — a few light bumps are possible on the way down through it." (G) |
| Breezy | "A steady breeze down the runway — a few gentle nudges after liftoff are normal." (G) | "A breezy approach — a few gentle nudges before touchdown are normal." (G) |
| Windy, … and windy | "Windy — the crew takes off into the wind; a firm takeoff roll and a few firm nudges after liftoff are normal." | "Windy — the crew lands into the wind with a firm, controlled touchdown; a few firm nudges on the approach are normal." |
| Drizzle, Patchy drizzle | "Drizzle — routine for pilots; it can add a few minutes of taxi time." | "Drizzle — routine for pilots. The runway may be wet, so a firm touchdown is normal." |
| Light rain | "Light rain — routine for pilots; it can add a few minutes of taxi time." (G) | "Light rain — routine for pilots. The runway may be wet, so a firm touchdown is normal." (G) |
| Rain | "Rain — routine for pilots; the takeoff goes ahead as normal, with a few light bumps possible while climbing through the cloud." | "Rain — routine for pilots. The runway will be wet, so a firm touchdown is deliberate — it helps the brakes grip." |
| Heavy rain | "Heavy rain — pilots fly in it routinely; departures may be spaced out a little more, so a short wait before takeoff is possible." | "Heavy rain — the crew flies the instrument approach, which is routine; a firm touchdown on the wet runway is deliberate." |
| Freezing rain, Freezing drizzle | "{Label} in the forecast — de-icing before takeoff is routine, and departures may wait until it eases; checking the flight's status before leaving for the airport is sensible." | "{Label} in the forecast — runways are treated, and arrivals may wait until it eases; the airline tells passengers if times change." |
| Scattered showers | "Scattered showers — pilots routinely steer around the heavier cells, which can add a few minutes." (G, both moments) | same |
| Light showers, Showers (and likely, possible, nearby) | "Showers — pilots routinely steer around the heavier cells, which can add a few minutes." | same |
| Heavy showers | "Heavy showers — pilots route around the heavier cells, which can add a few minutes before takeoff." | "Heavy showers — pilots route around the heavier cells, which can add a few minutes on the approach." |
| Thundery showers (every qualifier), Heavy thundery showers | "Thundery showers in the forecast — departures wait until a shower has passed the airport, so a delay before takeoff is possible; the climb then goes around the showers, not through them." | "Thundery showers in the forecast — arrivals may wait or take a longer way in until a shower has passed; pilots keep well clear of them." |
| Showers with hail | "Showers with hail in the forecast — departures wait for them to pass, so a delay before takeoff is possible." | "Showers with hail in the forecast — arrivals may wait or take a longer way in until they have passed." |
| Light snow | "Light snow — the airport keeps runways clear, and de-icing before takeoff is routine (it can add 10–20 minutes)." (G) | "Light snow — the airport keeps runways clear, and a firm touchdown is normal." (G) |
| Snow, Snow showers, Blowing snow | "{Snow / Snow showers / Blowing snow} — de-icing before takeoff is routine and the airport keeps runways clear; allow extra time at the gate." | "{…} — the airport keeps runways clear and checks their grip; a short wait is possible while a runway is cleared, and a firm touchdown is normal." |
| Heavy snow, Heavy snow showers | "Heavy snow — de-icing is routine and the airport clears runways in turn, so departures can run late; checking the flight's status before leaving for the airport is sensible." | "Heavy snow — runways are cleared in turn and arrivals spaced out, so a wait is possible; a firm touchdown is normal." |
| Sleet | "Sleet — de-icing before takeoff is routine; allow extra time at the gate." | "Sleet — runways are treated and checked; a firm touchdown is normal." |
| Fog, Patchy fog, Fog nearby | "Fog — the airport and crew are equipped for low visibility; it can mean a short wait before takeoff." | "Fog near the airport — the crew flies the instrument approach, which is routine." (G) |
| Morning fog | "Morning fog — the airport and crew are equipped for low visibility; it can mean a short wait before takeoff." (G) | "Fog near the airport — the crew flies the instrument approach, which is routine." (G) |
| Dense fog | "Dense fog — the airport and crew are equipped for low visibility; departures are spaced further apart, so a wait before takeoff is likely." | "Dense fog — the crew flies the instrument approach, which is routine; arrivals are spaced further apart, so a wait before landing is possible." |
| Freezing fog, Patchy freezing fog | "Freezing fog — low visibility and de-icing are both routine for the crew and the airport; allow extra time at the gate." | "Freezing fog — the crew flies the instrument approach, which is routine, and the runway is treated." |
| Low visibility | "Low visibility — the airport and crew are equipped for it; it can mean a short wait before takeoff." | "Low visibility — the crew flies the instrument approach, which is routine." |
| Mist, Patchy mist | "Mist — visibility is a little reduced; the departure runs as normal." | "Mist — the crew flies the instrument approach, which is routine." |
| Haze, Smoke, Dust | "{Haze / Smoke / Dust} — visibility is reduced, but the departure runs as normal." | "{…} — the crew flies the instrument approach, which is routine." |

Clauses, in this order after the base note:

- **Wind** (headline hours only): `windKts ≥ 25` or `gustKts ≥ 35` → "Strong winds as well — firm nudges near the
  ground are normal."; else `windKts ≥ 15` or a shown gust → "A breeze as well — a few gentle nudges near the ground
  are normal."
- **Gust at times** (`tempoGust` above the shown gust, or above the wind when none is shown): probability null →
  "Gusts to {kts} knots at times."; else "Gusts to {kts} knots are possible at times (a {probability}% chance)."
- **Weather** (`possible`: TEMPO/PROB40 events first, then slight chances; one clause per family, at most two,
  families in this order; a family the headline belongs to gets none; haze, smoke and dust get none):

| Family | TEMPO (no probability) | PROB40 | Slight chance |
| --- | --- | --- | --- |
| thunder (thunderstorm, hail) | Thundery showers at times. | Thundery showers are possible at times (a 40% chance). | A thundery shower is possible. |
| freezing (freezing_rain, freezing_drizzle) | Freezing rain at times. | Freezing rain is possible at times (a 40% chance). | A little freezing rain is possible. |
| snow (sleet, snow, snow_showers, blowing_snow) | Snow at times. | Snow is possible at times (a 40% chance). | A little snow is possible. |
| showers (rain_showers) | Showers at times. | Showers are possible at times (a 40% chance). | A passing shower is possible. |
| rain (rain, drizzle) | Rain at times. | Rain is possible at times (a 40% chance). | A little rain is possible. |
| fog (fog, freezing_fog, mist) | Patches of fog at times. | Patches of fog are possible at times (a 40% chance). | Patches of fog are possible. |

**Thundery phrases.** "thunder…" is on the DISCOURAGED list (a warning, never a failure). Hiding thunder would
mislead, so these exact phrases are allowed, and only these: "Heavy thundery showers", "Scattered thundery showers",
"Thundery showers", "thundery showers", "A thundery shower". `check-weather.ts` removes each allowed phrase from a
string before testing DISCOURAGED, so any other "thunder…" or "storm…" still warns. The vocabulary never says
"thunderstorm", "storm", "lightning", "severe" or "warning".

**How the generator's consumers read these.** `rawCausesFor` (fakeFlight.ts 949-1016) reads only `condition` and
`windKts`: a "Heavy rain" hour (`light_rain`) makes the origin cloudy; "Windy" (`breezy`) a clear origin with the
breeze cause from 12 knots; "Cloudy and windy" (`cloudy`) keeps the cloud causes. `phaseNote` (1092-1163) reads
`windKts ≥ 15`, any `gustKts`, and rain, showers or snow at the destination: every precipitation label maps to one
of those three conditions, so the wet-runway landing line comes with all of them. `recause` (1073-1090) re-words
the block's windows for the flight's real card, which is its purpose.

#### `shared/src/weatherCredit.ts` (new, pure): the words for sources and times

```ts
export type CreditPart = string | { text: string; href: string };
export const OPEN_METEO_URL = "https://open-meteo.com/";
export const CC_BY_URL = "https://creativecommons.org/licenses/by/4.0/";
/** Open-Meteo's credit under CC BY 4.0: the linked name, the licence, and that the data were adapted. */
export const OPEN_METEO_CREDIT: readonly CreditPart[] =
  [{ text: "Open-Meteo.com", href: OPEN_METEO_URL }, " (", { text: "CC BY 4.0", href: CC_BY_URL }, ", adapted)"];
/** Plain names for the ratings: "NOAA" (nws, awc-taf, awc-metar), "Open-Meteo", or "NOAA and Open-Meteo". */
export function sourceWords(sources: readonly WeatherSourceName[]): string;
/** "forecast as of Wed 7:41 AM", "retrieved Wed 3:30 PM", "observed Wed 9:51 AM". */
export function timeWords(source: WeatherProvenance): string;
/** The line under one weather card (both ends, generated ones included). */
export function endCredit(report: WeatherReport): CreditPart[];
/** The weather part of a page's credit, for the reports the page uses; null when none of them is real. */
export function weatherCredit(reports: readonly WeatherReport[]): CreditPart[] | null;
/** The takeoff & landing sheet's footer and the results card's "Why?" note. */
export function ratingWeatherCredit(weather: { origin: WeatherReport; destination: WeatherReport }): CreditPart[];
```

"Names" below means "NOAA", or `OPEN_METEO_CREDIT`, or "NOAA and " followed by `OPEN_METEO_CREDIT`, from the
sources of the reports in question.

- `endCredit`, real: `{code} {departure|arrival} · {TimeWords} · {names}`, then " · visibility more than 6 miles"
  when `visibilityFloor`, then " · chance of rain from the forecast" for an observation. Generated:
  `{code} {departure|arrival} · Illustrative — no live forecast for this hour`.
  Examples: "JFK departure · Forecast as of Wed 7:41 AM · NOAA"; "JFK departure · Observed Wed 9:51 AM · NOAA ·
  chance of rain from the forecast"; "HNL arrival · Forecast as of Wed 4:01 AM · NOAA · visibility more than 6
  miles"; "LHR arrival · Retrieved Wed 3:30 PM · Open-Meteo.com (CC BY 4.0, adapted)".
- `weatherCredit`: "Weather: " + names (all real reports) + ", " + `timeWords` of the real report with the earliest
  `at` + " {its airport code} time"; then, for each airport (first-seen order) with generated reports among
  `reports`: " · illustrative at {code}" when all of its reports are generated, " · partly illustrative at {code}"
  when some are. Examples: "Weather: NOAA, forecast as of Wed 7:41 AM JFK time"; "Weather: NOAA and Open-Meteo.com
  (CC BY 4.0, adapted), forecast as of Wed 10:54 AM LHR time · illustrative at DEL".
- `ratingWeatherCredit`: "Wind and weather: {O} — {end}; {D} — {end}. The climb and descent lines are
  illustrative." where `{end}` is "{names}, {timeWords}" for a real report and "illustrative" for a generated one.
  Example: "Wind and weather: JFK — NOAA, forecast as of Wed 7:41 AM; LHR — Open-Meteo.com (CC BY 4.0, adapted),
  retrieved Wed 3:30 PM. The climb and descent lines are illustrative."

#### `shared/src/fakeFlight.ts`: the seam, and five wording branches only real weather reaches

```ts
export interface ScheduledFlightSpec {
  // …existing fields…
  /**
   * Real weather (version D, step 2; shared/src/weather.ts): the report for an airport at a local date and clock
   * time, or null when its record has no usable hour (the generated report then stands in for that end). Called
   * with this flight's own timing: the origin at the departure on the day, the destination at the arrival on its
   * own local date. The air block's draw keeps the generated weather (air.wx), so flights in one block still share
   * its bumps; a real report re-words this flight's causes (recause) and its takeoff and landing notes (phaseNote).
   */
  weatherAt?: (airport: Airport, moment: "departure" | "arrival", localTime: string, dateIso: string) => WeatherReport | null;
}
```

At line 2450, in place of `const weather = weatherFor(ctx, timing, norm.date);`:

```ts
  const generated = weatherFor(ctx, timing, norm.date);
  const weather: FlightWeather = spec.weatherAt
    ? {
        origin: spec.weatherAt(ctx.origin, "departure", timing.departTime, norm.date) ?? generated.origin,
        destination: spec.weatherAt(ctx.destination, "arrival", timing.arriveTime, timing.arriveDate) ?? generated.destination,
      }
    : generated;
```

Line 2455 (`air`) and the `buildTurbulence(createRng(spec.airKey), …, air)` call stay as they are.

The generator never produces wind above 18 knots, gusts above 28 knots or a `source`, so these five branches never
run for a generated report and the study's hash cannot move (check-weather proves both):

1. `rawCausesFor`, climb, the breeze cause: the adjective becomes `windKts ≥ 25 ? "strong" : windKts ≥ 15 ? "brisk" : "steady"`.
2. `rawCausesFor`, climb, the first cloud cause: when `wx.origin.source` exists and the origin's condition is
   light_rain, showers or light_snow, its text is "Climbing through the clouds — the air above them is usually
   smoother." (tag unchanged, so `recause` still matches it); otherwise "Climbing through a layer of fair-weather
   clouds." as today.
3. `rawCausesFor`, descent, the wind cause: text "A windy approach — strong wind near the ground." when the
   destination's `windKts ≥ 25` (tag unchanged); otherwise as today.
4. `phaseNote`, takeoff, before the 15-knot line: `windKts ≥ 25` → "A strong wind down the runway — a firm takeoff
   roll, and a few firm nudges in the first minutes of the climb are normal."
5. `phaseNote`, landing, before the 15-knot line: `windKts ≥ 25` or `gustKts ≥ 35` → "A strong wind near the ground
   — a few firm nudges on the approach are normal, and the crew lands into the wind with a firm, controlled
   touchdown."

Branches 4 and 5 return without drawing from the note stream, like the 15-knot lines they precede.

#### `shared/src/schedule.ts`

```ts
import { realWeatherReport, type AirportWeather } from "./weather";

/** The two airports' records for a route-day, as the browser has them (either may be missing: that end stays generated). */
export interface RouteDayWeather {
  origin?: AirportWeather | null;
  destination?: AirportWeather | null;
}

/** …existing doc…; with `weather`, each flight's reports at the airports the records cover are real where an hour allows. */
export function optionsFromSchedule(schedule: RouteDaySchedule, weather?: RouteDayWeather): SearchResults;
```

Inside, once per day, `const weatherAt = weatherAtFor(weather)`, passed on every spec. `weatherAtFor` returns
undefined when neither record is there; otherwise a callback that finds the record by `record.airport ===
airport.code` (the airport as flown, never by position) and returns `realWeatherReport({ airport, moment, date:
dateIso, localTime, weather: record })` inside a `try` that turns any throw into `null`. `generatedSchedule`,
`resolveAircraft`, `illustrativeFare` and the frozen `SearchResults` shape are unchanged.

#### `shared/src/ratings.ts` (version D only)

```ts
export interface Rating {
  // …existing fields…
  /**
   * Takeoff & landing on the forecast basis, when at least one end's report is real: the two reports, for the
   * sheet's footer and the results card's "Why?" (weatherCredit.ts ratingWeatherCredit). Absent otherwise.
   */
  weather?: { origin: WeatherReport; destination: WeatherReport };
}
```

`rateApproachForecast` adds `conditionPoints(origin) + conditionPoints(destination)` to its points, and
`windPoints` gains two tiers: `!detail` → 0; else (`windKts ≥ 25` 2, `≥ 15` 1.25, `≥ 12` 0.75, else 0) plus
(`gustKts ≥ 35` 1, any shown gust 0.5, else 0). A TEMPO/PROB40 gust never counts. The condition classes read
`source.headline` and `source.possible` (a generated report has none: 0 points):

| Class | When | Points | Words after the wind |
| --- | --- | --- | --- |
| thunder | headline thunderstorm or hail | 2 | ", with {headline} in the forecast — the air near the showers can be lively, so the crew waits for them to pass or steers around them" |
| heavy showers | headline rain_showers, heavy | 1 | ", with heavy showers in the forecast — the air under the heavier showers can be lively, so pilots steer around them" |
| freezing | headline freezing_rain, freezing_drizzle or sleet | 1 | ", with {headline} in the forecast — de-icing and treated runways are routine, a wait is possible, and a firm touchdown is normal" |
| heavy snow | headline snow or snow_showers, heavy; or blowing_snow | 1 | ", with {headline} in the forecast — runways are cleared in turn and de-icing is routine, so a wait is possible, and a firm touchdown is normal" |
| thunder possible | none of the above, and `possible` has a thunderstorm whose chance is not slight | 1 | ", with thundery showers possible at times — if one builds near the airport, the crew waits for it to pass or steers around it" |

`{headline}` is the headline's base label in lower case ("thundery showers", "heavy thundery showers", "showers with
hail", "freezing rain", "freezing drizzle", "sleet", "heavy snow", "heavy snow showers", "blowing snow").

`windFactor(w, moment, detail)`:

- title: `Weather at {code} · {moment}` when the end has a condition class, else `Wind at {code} · {moment}` as today.
- the wind: windDir `""` → "Calm"; `"Variable"` → `{kts} knots, variable direction`; else today's
  `{kts} knots from the {compass word}{, gusting to g}`.
- detail, no class: calm → "Calm — little or no wind near the ground"; else `{wind} — {word}`, where word is
  "a strong wind, so a few firm nudges near the ground are normal" from 25 knots, then today's three ("breezy, so
  a few nudges near the ground are normal", "a steady breeze", "light winds").
- detail, with a class: `{wind}{words after the wind}`, e.g. "8 knots from the south, with thundery showers in the
  forecast — the air near the showers can be lively, so the crew waits for them to pass or steers around them".
- effect: a class → "down"; calm → "up"; else today's rule.
- `!detail` stays "Wind forecast not available yet" (unreachable while both horizons are 2 days).

Numbers: `Wind at {code}` is "Calm" when calm and `{kts} knots, variable` when variable, else as today. When either
end is real, two rows follow "Weather": `Source at {O}` and `Source at {D}`, each `{sourceWords} · {timeWords}`
("NOAA · forecast as of Wed 7:41 AM", "Open-Meteo · retrieved Wed 3:30 PM", "NOAA · observed Wed 9:51 AM") or
"Illustrative".

`basisText`: both ends generated → today's "Based on this week's forecast for {O} and {D}". Both real forecasts or
models → "Based on this week's forecast for {O} ({sourceWords}) and {D} ({sourceWords})". Otherwise "Based on {o}
and {d}", each end worded "this week's forecast for {code} ({sourceWords})", "the latest observation at {code}
(NOAA)" or "illustrative weather at {code}". Examples: "Based on this week's forecast for JFK (NOAA) and LAX
(NOAA)"; "Based on this week's forecast for JFK (NOAA) and illustrative weather at LHR"; "Based on the latest
observation at JFK (NOAA) and this week's forecast for LAX (NOAA)". `meaning` keeps the five fixed forecast lines;
`weather` is set when either end is real. Every rule of `check-ratings.ts` holds (starts "Based on", names both
codes, sentence case, no "kt", 2–4 factors, at least two numbers); the history basis is untouched.

#### Checks: `shared/scripts/check-weather.ts` (new) and `shared/scripts/verify-icao.ts` (manual)

`check-weather.ts` joins the chain (`shared/package.json`: `… && tsx scripts/check-schedule.ts && tsx
scripts/check-weather.ts`). It reads no backend files: its records are built in the script by a helper
`record(airport, fetchedAt, rows, observation?)` whose rows default to complete calm figures, so each case sets only
what it tests. It mirrors `check-schedule.ts` (`check`, `warn`, the word lists, `stringsOf`) and exits non-zero on
any failure. It checks:

1. **Nothing else moves.** For a sample of route-days (JFK→LAX, LHR→JFK, DEL→BOM, HNL→LAX, LGA→LAX flown from JFK),
   `optionsFromSchedule(s)` deep-equals `optionsFromSchedule(s, undefined)` and `optionsFromSchedule(s, {})`; with
   records at both ends, every flight's id, key, fare, times, terminal, gate, aircraft, crew, seat map, sounds,
   points, phases' bounds and intensities, windows' phase, start, duration, intensity, labels and seatbelt sign,
   score, smoothness label, smooth share and maximum intensity are equal to the run without records; only
   `weather`, `windows[].cause`, `phases[].note` and `smoothness.summary` may differ.
2. **Each real report** has `localTime` equal to the flight's `departTime` or `arriveTime`, `airportCode` and `city`
   equal to the flight's airport, `tempF === round(tempC × 9/5 + 32)`, a gust that is null or above the wind,
   −60 ≤ tempC ≤ 60, 0 ≤ windKts ≤ 150, 0.1 ≤ visibilityMi ≤ 10, 0 ≤ precipPct ≤ 100, one of the nine conditions,
   impact `"none"` or `"minor"`, a note longer than 10 characters without "your", a `source` whose `at` parses,
   whose `atLabel` matches `^(Sun|Mon|Tue|Wed|Thu|Fri|Sat) \d{1,2}:\d{2} (AM|PM)$` and whose `sources` are among the
   record's.
3. **A cause never argues with the card:** no climb (descent) window cause matching `/cloud|shower/i` when the
   origin's (destination's) condition is clear, mostly_clear or breezy.
4. **Words:** FORBIDDEN fails, DISCOURAGED warns after the thundery phrases are removed, YOUR_FLIGHT fails, no "!",
   no `undefined|NaN|[object`, over every report, cause, phase note, every row of the label and note tables, every
   clause, `endCredit`, `weatherCredit` and `ratingWeatherCredit` text. The takeoff & landing ratings of
   real-weather flights at 0, 1, 2 and 10 days pass `check-ratings.ts`'s copy rules (BANNED, JARGON, sentence case,
   no "100%", "Based on", both codes), and at 10 days FORECAST_ONLY never appears.
5. **The vocabulary, case by case:** every label in the tables with both notes; heavy definite thunder → "Heavy
   thundery showers", showers, minor, and a takeoff & landing tier below Very smooth; freezing rain → light_rain;
   heavy snow → light_snow; visibility 0.2 → "Dense fog"; 30 knots under a clear sky → breezy, "Windy"; 30 knots
   under 95 % cloud → cloudy, "Cloudy and windy"; mist at 5 miles → no headline; no event at 0.6 miles → "Low
   visibility"; an EGLL-like hour (prevailing 13 knots, PROB40 TEMPO gust 27) → no gust shown and the clause
   "Gusts to 27 knots are possible at times (a 40% chance)."; a JFK-like hour (heavy definite showers with a slight
   chance of thunder) → "Heavy showers" and "A thundery shower is possible."; calm (0 knots) → windDir "", factor
   "Calm — little or no wind near the ground", number "Calm"; variable 3 knots → "Variable", "3 knots, variable".
6. **Time:** a next-day arrival reads the destination's row on the arrival's own local date; a departure at 09:00
   on 2027-03-14 in New York (the spring-forward day) picks the 13:00Z row; 01:30 on 2026-11-01 (fall-back) is its
   first occurrence, 05:30Z, and picks the 05:00Z row (a tie goes to the earlier); DEL at 14:10 IST (08:40Z)
   picks the 09:00Z row of a whole-hour record and the 08:30Z row of a record whose rows fall at :30; the observation (obsTime 14:51Z) serves a moment at 15:40Z (49 minutes later) and not one at 15:55Z or
   13:50Z; a row missing any required figure is skipped for the next complete one within 90 minutes; past 90
   minutes the end stays generated.
7. **Ratings of generated flights do not move:** `GENERATED_RATINGS_SNAPSHOT`, the sha256 of `rateFlight` over 12
   routes × 3 dates × days 0, 1, 2 and 10, computed on the contract commit before `ratings.ts` changes, still
   matches.
8. **The study and version C are untouched** after all of the above: `generateFlight` over the six A/B inputs
   `check-schedule.ts` uses (restated) hashes as before, and `searchFlights` for the sample days gives the same JSON
   as before.
9. **ICAO table:** 187 entries, exactly the catalogue's codes, each `^[A-Z]{4}$`, no repeats, US and PR codes
   starting with K, P or T, PBI → KDJT, `icaoFor("jfk") === "KJFK"`, `icaoFor("ZZZ") === null`.
10. **Determinism and purity:** the same day built twice is the same JSON; swapping `origin` and `destination` in
    `RouteDayWeather` changes nothing; `weather.ts`, `weatherCredit.ts` and `airportIcao.ts` contain none of
    `Date.now`, `new Date(`, `Math.random`, `fetch(`, `process.`, `require(`, `from "node:`, `window`, `document`;
    `tz.ts` none of them but `new Date(` (it feeds `formatToParts`).
11. **Speed:** a 30-flight day with records at both ends builds in at most twice the time without them, and in
    300 ms or less cold.

`verify-icao.ts` (manual, no network inside): `npx tsx shared/scripts/verify-icao.ts <airports.csv>` reads a
downloaded OurAirports file (`curl -s https://davidmegginson.github.io/ourairports-data/airports.csv -o …`), joins
`iata_code` → `icao_code` for the 187 codes, prints every difference from `ICAO_BY_IATA` (naming PBI's override as
expected) and exits non-zero on any other difference.

### Backend: `GET /weather/airport?code=JFK`

```ts
// backend/src/routes/weather.ts, mounted in app.ts as app.route("/weather", weather)
export const weather = new Hono();
/** Browsers and the web app's proxy may keep an airport's record for ten minutes; the server refreshes it hourly. */
export const WEATHER_CACHE_CONTROL = "public, max-age=600";
weather.get("/airport", rateLimit, async (c) => { /* off → 404; validate → 400; load → 200 | 502 | 503 */ });
```

The web app reaches it as `/api/weather/airport?code=JFK` through the existing `/api/:path*` rewrite. The provider
setting is read on every request (never at import), so the route is always mounted.

| Status | Body | When |
| --- | --- | --- |
| 200 | `{ ok: true, weather: AirportWeather, cached: boolean }` with `Cache-Control: public, max-age=600` | a forecast source answered now, or the cache had a record |
| 400 | `{ ok: false, error: "invalid_code" }` or `"unknown_airport"` (no-store) | `code` is not `^[A-Z]{3}$` (no trimming, no lower case), or not in `getAirport` |
| 404 | `{ ok: false, error: "not_found" }` | `WEATHER_PROVIDER=off`, checked first: the app behaves as before step 2 |
| 429 | `{ ok: false, storage, error: "rate_limited" }` with `Retry-After: 60` | the existing per-IP limit |
| 502 | `{ ok: false, error: "provider_error" }` | neither Open-Meteo nor NWS answered and nothing within 24 hours is cached |
| 503 | `{ ok: false, error: "provider_budget" }` with `Retry-After: 600` | the hourly airport budget is spent and nothing within 24 hours is cached |

#### Modules (`backend/src/lib/weather/`)

```ts
// types.ts
import type { AirportWeather, WeatherProviderName } from "@preflight/shared/weather";
export { ProviderError } from "../flights/types";            // the same class; reason "budget" → 503
export interface WeatherProvider {
  name: WeatherProviderName;
  /** The airport's record from whatever answered. Rejects with a ProviderError when neither forecast source did. */
  fetchAirport(code: string): Promise<AirportWeather>;
}
export interface AirportWeatherQuery { code: string }
export type AirportWeatherResponse = { ok: true; weather: AirportWeather; cached: boolean } | { ok: false; error: string };
/** An airport's record as the durable layer keeps it (Supabase `airport_weather`; airport_weather.json in development). */
export interface AirportWeatherRecord { airport: string; provider: WeatherProviderName; fetchedAt: string; expiresAt: string; payload: AirportWeather }
/** Both methods throw on a storage error. */
export interface AirportWeatherStore {
  getAirportWeather(airport: string, provider: WeatherProviderName): Promise<AirportWeatherRecord | null>;
  putAirportWeather(record: AirportWeatherRecord): Promise<void>;
}
export const AIRPORT_WEATHER_TTL_MS = 60 * 60 * 1000;          // forecasts refresh hourly
export const AIRPORT_WEATHER_SHORT_TTL_MS = 10 * 60 * 1000;    // a record with a missing source is retried sooner
export const AIRPORT_WEATHER_MAX_AGE_MS = 24 * 60 * 60 * 1000; // never served or kept past a day (a retention choice)
export const DEFAULT_WEATHER_AIRPORTS_PER_HOUR = 120;
/** "JFK|live". */
export function airportWeatherKey(airport: string, provider: string): string;
/** Milliseconds since fetchedAt; Infinity when unreadable (counts as too old). */
export function airportWeatherAgeMs(record: Pick<AirportWeatherRecord, "fetchedAt">, nowMs: number): number;

// http.ts
export const SOURCE_TIMEOUT_MS = 5_000;
export const RETRY_AFTER_DEFAULT_MS = 1_000;
export const RETRY_AFTER_MAX_MS = 2_000;
export const AWC_CALLS_PER_MINUTE = 50;
export interface SourceDeps { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void>; env?: NodeJS.ProcessEnv }
/** "preflight-clarity capstone prototype", plus " (WEATHER_CONTACT)" when that is set; no personal address is built in. */
export function userAgent(env?: NodeJS.ProcessEnv): string;
/**
 * One GET with the User-Agent and `headers`, aborted after `timeoutMs`; a 429 is retried once after Retry-After
 * (default 1 s, at most 2 s). Resolves { status, body } (body null for a 204 or an empty body; the caller judges
 * other statuses); rejects with a ProviderError on a network error, a timeout or a 200 whose body is not JSON.
 */
export function getJson(url: string, headers: Record<string, string>, timeoutMs: number, deps?: SourceDeps): Promise<{ status: number; body: unknown }>;
/** A rolling one-minute allowance of calls. */
export class MinuteAllowance {
  constructor(perMinute: number, now?: () => number);
  /** Takes `n` calls when they fit in the last 60 seconds; otherwise takes none and answers false. */
  take(n: number): boolean;
}

// openmeteo.ts
export const OPEN_METEO_FORECAST_DAYS = 10;
export const OPEN_METEO_HOURLY = "temperature_2m,precipitation_probability,weather_code,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m";
export function forecastUrl(lat: number, lon: number): string;
export interface OpenMeteoRow { atMs: number; tempC: number; precipPct: number | null; code: number | null; cloudPct: number | null; visibilityMi: number | null; windKts: number | null; windDeg: number | null; gustKts: number | null }
/** The parallel arrays → rows: time × 1000, metres → miles (at most 10), rows with a null temperature dropped. A ProviderError when hourly_units.time is not "unixtime" or the wind is not in "kn". */
export function openMeteoRows(body: unknown): OpenMeteoRow[];
export function wxFromWmo(code: number | null, precipPct: number | null): WxEvent[];
/** The gust when it is 25 knots or more and 15 or more over the mean; else null. */
export function openMeteoGust(windKts: number | null, gustKts: number | null): number | null;

// nws.ts
export interface NwsGrid { office: string; x: number; y: number }
export const NWS_POINTS_TTL_MS = 24 * 60 * 60 * 1000;
export function pointsUrl(lat: number, lon: number): string;  // four decimals
export function gridUrl(grid: NwsGrid): string;
export function parsePoints(body: unknown): NwsGrid | null;    // the 404 problem body → null
/** "PT1H" → 1, "P1DT17H" → 41, "P7DT19H" → 187 (hours; minutes round up). */
export function parseDuration(iso: string): number;
export interface NwsInterval { fromMs: number; toMs: number; value: unknown }
/** A gridpoint series ({ uom, values: [{ validTime: "start/duration", value }] }) → its intervals; [] for an empty series. */
export function nwsSeries(series: unknown): NwsInterval[];
/** The value whose interval holds atMs (fromMs ≤ atMs < toMs), else undefined. */
export function valueAt(intervals: readonly NwsInterval[], atMs: number): unknown;
/** One weather value (an array of { coverage, weather, intensity, visibility }) → events; the all-null element → []. */
export function wxFromNws(value: unknown): WxEvent[];
export type NwsSeriesName = "temperature" | "windSpeed" | "windGust" | "windDirection" | "skyCover" | "probabilityOfPrecipitation" | "visibility" | "weather";
export interface NwsForecast { issuedAt: string; validFromMs: number; validToMs: number; series: Record<NwsSeriesName, NwsInterval[]> }
/** The raw gridpoint body → issuedAt (updateTime as an ISO instant), validity (validTimes) and the eight series. */
export function nwsForecast(body: unknown): NwsForecast;
/** The gust when it is 10 knots or more over the mean; else null. */
export function nwsGust(windKts: number | null, gustKts: number | null): number | null;
/** Empties the per-process points cache (tests). */
export function clearNwsPoints(): void;

// nwsGrids.ts: generated by backend/scripts/nws-grids.ts
export const NWS_GRIDS: Readonly<Record<string, NwsGrid>>;

// awc.ts
export const OBSERVATION_MAX_AGE_MS = 90 * 60 * 1000;
export function tafUrl(icao: string): string;
export function metarUrl(icao: string): string;
/** Present-weather groups → events ("NSW" → [], and it clears a BECMG group's weather). */
export function wxFromString(wxString: string | null | undefined, chance?: WxChance): WxEvent[];
/** The densest layer as a percent; null when there is no cloud group. */
export function cloudPctFrom(clouds: unknown, cover?: unknown): number | null;
/** "10+" → 10; "6+" → { floor: 6 }; a number → at most 10; "" → "unchanged"; null or absent → null. */
export function visibilityFrom(visib: unknown): number | { floor: number } | "unchanged" | null;
export interface TafState { windKts: number; windDeg: number | null; gustKts: number | null; visibility: number | { floor: number } | null; cloudPct: number | null; wx: WxEvent[] }
export interface TafTimeline {
  icao: string;
  issuedAt: string;
  validFromMs: number;
  validToMs: number;
  prevailing: Array<{ fromMs: number; toMs: number; state: TafState }>;
  tempo: Array<{ fromMs: number; toMs: number; probability: number | null; gustKts: number | null; wx: WxEvent[] }>;
  slight: Array<{ fromMs: number; toMs: number; wx: WxEvent[] }>;
}
/** The TAF for `icao` (mostRecent, else the latest issueTime) → its timeline; null for [] or a 204. */
export function tafTimeline(body: unknown, icao: string): TafTimeline | null;
/** The latest METAR for `icao` by obsTime → an observation; null when there is none or it is over 90 minutes older than fetchedAtMs. */
export function metarObservation(body: unknown, icao: string, fetchedAtMs: number): WeatherObservation | null;

// compose.ts
export interface ComposeParts {
  airport: Airport;
  icao: string | null;
  provider: WeatherProviderName;
  fetchedAt: string;
  openMeteo: OpenMeteoRow[] | null;
  nws: NwsForecast | null;
  taf: TafTimeline | null;
  metar: WeatherObservation | null;
  missing: WeatherSourceName[];
}
/** The record. A ProviderError when neither openMeteo nor nws is there: a TAF and a METAR alone give no temperature and no chance of rain. */
export function composeAirportWeather(parts: ComposeParts): AirportWeather;

// live.ts
export const AIRPORT_DEADLINE_MS = 6_000;
export const AWC_GAP_MS = 250;
/** One per process. */
export const awcAllowance: MinuteAllowance;
export function createLiveWeatherProvider(deps?: SourceDeps & { allowance?: MinuteAllowance; grids?: Readonly<Record<string, NwsGrid>> }): WeatherProvider;

// fixture.ts
/** backend/fixtures/weather, whether the process runs from backend/ or from the repo root. */
export function defaultWeatherFixtureDir(cwd?: string): string;
export function createFixtureWeatherProvider(dir?: string, now?: () => number): WeatherProvider;

// cache.ts: AirportWeatherCache (below); index.ts
export type WeatherProviderSetting = WeatherProviderName | "off";
export const WEATHER_PROVIDER_NAMES: readonly WeatherProviderSetting[] = ["live", "fixture", "off"];
/** WEATHER_PROVIDER, case-insensitive, read per call; "live" unless it names another. */
export function weatherProviderName(env?: NodeJS.ProcessEnv): WeatherProviderSetting;
/** The provider for this request; null when off. */
export function currentWeatherProvider(env?: NodeJS.ProcessEnv): WeatherProvider | null;
export type AirportQueryCheck = { ok: true; query: AirportWeatherQuery } | { ok: false; error: "invalid_code" | "unknown_airport" };
export function validateAirportQuery(raw: { code?: string }): AirportQueryCheck;
/** WEATHER_AIRPORTS_PER_HOUR (a positive integer), else 120. */
export function weatherAirportsPerHour(env?: NodeJS.ProcessEnv): number;
/** One cache per process; the durable layer is whatever storage the environment names at call time. */
export const airportWeatherCache: AirportWeatherCache;   // new AirportWeatherCache({ store: airportWeatherStore, budgetPerHour: () => weatherAirportsPerHour() })
export function loadAirportWeather(query: AirportWeatherQuery, provider: WeatherProvider): Promise<{ weather: AirportWeather; cached: boolean }>;
```

#### Sources

All free, no key; every call carries `user-agent: userAgent()`.

| Source | Airports | Reach | Call (headers besides the User-Agent) |
| --- | --- | --- | --- |
| Open-Meteo forecast | all 187 | 10 days from 00:00Z today, whole UTC hours | `https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&hourly={OPEN_METEO_HOURLY}&wind_speed_unit=kn&timeformat=unixtime&timezone=UTC&forecast_days=10` (`accept: application/json`). Costs 1 of its 10,000 calls a day. |
| NWS raw gridpoint | country US or PR (86) | from 02–08Z today for 187–198 hours | `https://api.weather.gov/gridpoints/{office}/{x},{y}`, the grid from `NWS_GRIDS`, else the per-process points cache (24 h), else `https://api.weather.gov/points/{lat.toFixed(4)},{lon.toFixed(4)}` (`accept: application/geo+json`) |
| AWC TAF | every ICAO code | to `validTimeTo`, 9–30 hours | `https://aviationweather.gov/api/data/taf?ids={ICAO}&format=json` |
| AWC METAR | every ICAO code | the latest report | `https://aviationweather.gov/api/data/metar?ids={ICAO}&format=json` |

`fetchAirport(code)`: the airport (`getAirport`), its ICAO code (`icaoFor`), then three chains at once, all inside a
6-second deadline from the start: Open-Meteo; NWS for US and PR airports (a gridpoint 404 means the grid moved:
fetch `/points` once, cache it, ask the grid again; a points 404 means not covered); AWC for an airport with an ICAO
code, only when `allowance.take(2)` succeeds: the TAF, a 250 ms pause, then the METAR (otherwise both are skipped).
Each call's timeout is the smaller of 5 seconds and the time left. An answer is a 200 (AWC: also a 200 with `[]`
or a 204, meaning no report, which is not missing). Anything else (another status, a network error, a timeout, the
deadline, a body the parser rejects, a skipped AWC pair) puts that source in `missing`. Expected sources: Open-Meteo
everywhere, NWS in the US and PR, the TAF and the METAR wherever there is an ICAO code. Then
`composeAirportWeather`; when neither forecast source answered, a ProviderError such as "no forecast source
answered for JFK (open-meteo: status 503; nws: timeout)".

`NWS_GRIDS` (`backend/src/lib/weather/nwsGrids.ts`) is written by `backend/scripts/nws-grids.ts` (manual, network:
`/points` for each US and PR catalogue airport, one request a second, the User-Agent, entries sorted by code).
Verified so far: JFK OKX 42,40; LAX LOX 148,41; HNL HFO 152,145; SJU SJU 170,129; ANC AER 141,235. Until the script
has run for the other 81, they go through `/points` (cached 24 hours per process). The points answer is cacheable
for a day (its `cache-control` says so) and NWS says grids move occasionally, hence the 404 refetch.

#### Vocabulary maps (exact)

- **NWS `weather`** → phenomenon: blowing_dust, blowing_sand → dust; blowing_snow → blowing_snow; drizzle →
  drizzle; fog → fog; freezing_fog, ice_fog → freezing_fog; freezing_drizzle → freezing_drizzle; freezing_rain,
  freezing_spray → freezing_rain; hail → hail; haze, ice_crystals → haze; rain → rain; rain_showers → rain_showers;
  sleet → sleet; smoke, volcanic_ash → smoke; snow → snow; snow_showers → snow_showers; thunderstorms, water_spouts
  → thunderstorm; frost → nothing. Intensity: very_light, light → light; heavy → heavy; moderate or null →
  moderate. Coverage: slight_chance, isolated → slight; chance → chance; scattered → chance with `where:
  "scattered"`; likely, numerous, periods, intermittent, occasional, frequent, brief → likely; definite, widespread
  or null → definite; patchy, areas → definite with `where: "patchy"`.
- **WMO `weather_code`** (Open-Meteo): 0–3 nothing; 45 fog and 48 freezing_fog (definite); 51/53/55 drizzle
  light/moderate/heavy; 56/57 freezing_drizzle light/heavy; 61/63/65 rain light/moderate/heavy; 66/67 freezing_rain
  light/heavy; 71/73/75 snow light/moderate/heavy; 77 snow light; 80/81/82 rain_showers light/moderate/heavy; 85/86
  snow_showers light/heavy; 95 thunderstorm moderate; 96 thunderstorm moderate and hail light; 97 thunderstorm
  heavy; 99 thunderstorm heavy and hail heavy. The chance of a precipitation code comes from the hour's
  `precipitation_probability`: under 25 slight, under 55 chance, else likely; unknown → chance.
- **METAR/TAF present weather** (space-separated groups): `-` light, `+` heavy, none moderate; `VC` → light, chance
  "chance", `where: "nearby"`. RA → rain (SHRA → rain_showers; FZRA → freezing_rain; TSRA → thunderstorm and
  rain_showers); DZ → drizzle (FZDZ → freezing_drizzle); SN → snow (SHSN → snow_showers; BLSN, DRSN → blowing_snow);
  RA and SN in one group (RASN, SNRA, SHRASN) and PL → sleet; SG → snow, light; GR, GS → hail; TS alone →
  thunderstorm; BR → mist; FG → fog (FZFG → freezing_fog; MIFG, BCFG, PRFG → fog with `where: "patchy"`); HZ, IC →
  haze; FU, VA → smoke; DU, SA, DS, SS, PO → dust; FC → thunderstorm, heavy; UP → rain, light; SQ → nothing (the
  wind and gust carry it); NSW → none.
- **Cloud groups** (densest layer wins): SKC, CLR, NSC, NCD, CAVOK 0; FEW 20; SCT 45; BKN 75; OVC 100; OVX 100 plus
  `{ fog, moderate, definite }`. The values sit inside NWS's sky-cover categories (mostly clear, partly cloudy,
  mostly cloudy, cloudy), so a TAF hour and an NWS hour word the same sky the same way.
- **Units:** NWS km/h × 0.539957 → knots (12.964 → 7.0); metres ÷ 1609.344 → miles (16093.44 → 10); the `weather`
  entry's visibility is in km (÷ 1.609344). Every visibility is capped at 10 miles.

#### Composition (`composeAirportWeather`)

Rows are the instants of Open-Meteo's rows; without Open-Meteo, every whole hour of NWS's `validTimes`. Each figure
of a row comes from the first source that has a value at the row's instant (an NWS value applies when its interval
holds the instant; a TAF group when the instant is inside its interval and inside the TAF's validity):

| Figure | Sources, in order |
| --- | --- |
| temperature | NWS `temperature` → Open-Meteo |
| wind, direction and gust (one source sets all three) | TAF prevailing state (its gust as reported, null when the group has none) → NWS `windSpeed`, `windDirection`, `windGust` through `nwsGust` → Open-Meteo through `openMeteoGust` |
| visibility | TAF prevailing → NWS `visibility` → the NWS `weather` entry's visibility → Open-Meteo. A TAF floor gives way to the next source's figure when that figure is 6 miles or more (it agrees, and is finer); otherwise the floor stays, with `visibilityFloor: true` |
| cloud | TAF prevailing (densest layer) → NWS `skyCover` → Open-Meteo `cloud_cover` |
| chance of rain | NWS `probabilityOfPrecipitation` → Open-Meteo `precipitation_probability` |
| weather events | TAF (prevailing events, TEMPO/PROB40 events, PROB30 slight chances) → NWS `weather` → Open-Meteo `wxFromWmo(code, chance of rain)` |
| `tempoGust` | the largest gust among the TEMPO/PROB40 groups in force, with that group's probability |

Inside its validity the TAF always has a value for the wind and the weather events: an empty list means the
forecaster expects no weather at the airport, so NWS's and Open-Meteo's events are not used for that row.

`from` lists the sources that set at least one figure. `sources` lists each source that answered, with its
`issuedAt`: NWS `updateTime`, TAF `issueTime`, METAR `obsTime` (only when the observation is kept), Open-Meteo
`fetchedAt`. Numbers are rounded to one decimal; rows ascend.

**The TAF timeline.** Groups in `timeFrom` order. The base group (`fcstChange` null) starts the prevailing state.
An `FM` group replaces it whole from its `timeFrom`: nothing carries over (no `wgst`, no gust; no `wxString`, no
weather), so the PHNL base group's VCSH ends at FM042000. A `BECMG` group, from `timeBec` (else `timeTo`), replaces
the fields it gives: the wind as a unit (`wdir`, `wspd` and `wgst` together, only when `wspd` is given), the
visibility unless `""`, the clouds when its list is not empty, the weather when `wxString` is given ("NSW"
clears). A group with probability null and `fcstChange` "TEMPO", or with probability 40 (`fcstChange` "TEMPO" or
"PROB"), is a tempo segment over `[timeFrom, timeTo)`: its gust as reported, its events with `tempo` set to the
probability and chance "chance"; its wind, visibility and clouds never move a figure. A group with probability 30
gives only slight chances. `wdir` "VRB" → direction null; `timeFrom`, `timeTo`, `timeBec`, `validTimeFrom` and
`validTimeTo` are epoch seconds, `issueTime` ISO.

**The METAR.** The latest by `obsTime` for the ICAO code, kept when `fetchedAt − obsTime ≤ 90 minutes`. Optional keys
are omitted, not null: no `wspd` → the wind group is null (never 0); no `wgst` → no gust; no `wxString` → `[]`;
`wdir` "VRB" → direction null; `wdir` 0 with `wspd` 0 → calm (0 knots); `visib` "10+" → 10, "6+" → a floor of 6;
`clouds` and `cover` → `cloudPctFrom`.

#### Cache, store, schema, environment

- **`cache.ts`**: `AirportWeatherCache` is `RouteDayCache` with the names swapped: memory LRU of 256 records, the
  `pending` map, the `calls` list, options `{ store?, now?, capacity?, warn?, budgetPerHour? }`, `get(query,
  provider)`, `callsThisHour`, `size`, `clear()`, `recordOf(airport, provider, weather, nowMs)` (the TTL counts
  from the payload's `fetchedAt`: 10 minutes when `weather.missing` is not empty, else an hour), `isFresh`,
  `isPastCeiling` (24 hours). Only the fixture provider is outside the budget. Warnings, word for word: "weather
  cache: read failed, asking the sources (…)", "weather cache: the hourly weather budget is spent; JFK served as
  fetched {fetchedAt}", "weather cache: the sources failed (…); JFK served as fetched {fetchedAt}", "weather cache:
  write failed (…)". The budget error: `ProviderError("the hourly weather budget (120 airports) is spent",
  undefined, "budget")`. A twin rather than a generic class, so the 124 passing tests and the strings they assert
  stay untouched; the two files sit side by side for a later merge.
- **`store/types.ts`**: `ResponseStore extends RouteDayStore, AirportWeatherStore`. **`memory.ts`**:
  `createMemoryAirportWeatherStore()` (a Map keyed by `airportWeatherKey`, `size`, `clear()`). **`file.ts`**:
  `AIRPORT_WEATHER_FILE = "airport_weather.json"` next to DATA_FILE, `airportWeatherPath`, records keyed
  "airport|provider"; `getAirportWeather` drops a record past 24 hours on sight and rewrites the file;
  `putAirportWeather` sweeps every record past 24 hours, then upserts; the header comment names the file.
  **`supabase.ts`**: `AIRPORT_WEATHER_TABLE = "airport_weather"`, `AirportWeatherRow { airport, provider, fetched_at,
  expires_at, payload }`, `airportWeatherToRow`, `rowToAirportWeather` (the `text()` checks, `isoInstant`, a payload
  that arrives as a string parsed), `getAirportWeather` (select the five columns, `.eq("airport").eq("provider")
  .maybeSingle()`, delete on sight past 24 hours, warn when that delete fails), `putAirportWeather` (upsert with
  `onConflict: "airport,provider"`); the header comment lists the fourth table. **`db.ts`**:
  `airportWeatherStore(): AirportWeatherStore | null` (null when storage is "none").
- **`backend/supabase/schema.sql`**: the header's "Two tables" sentence becomes "Four tables: `responses` (study
  sessions, below), `signups` (product-interest sign-ups), `route_days` (version D's cached schedules) and
  `airport_weather` (version D's cached airport weather), at the end." A new section, idempotent, in the
  `route_days` shape:

```sql
-- Airport weather cache (docs/REAL_DATA.md, step 2)
create table if not exists public.airport_weather (
  airport     text not null,
  provider    text not null,
  fetched_at  timestamptz not null,
  expires_at  timestamptz not null,
  payload     jsonb not null,
  primary key (airport, provider)
);
comment on table  public.airport_weather is 'Cached airport weather for version D, one row per IATA code and provider. Written by the API; rows fetched over 1 day ago are dropped by a trigger.';
comment on column public.airport_weather.airport is 'IATA code, e.g. JFK.';
comment on column public.airport_weather.provider is 'live (NWS, AWC TAF and METAR, Open-Meteo) or fixture (tests).';
comment on column public.airport_weather.fetched_at is 'When the sources were asked.';
comment on column public.airport_weather.expires_at is 'fetched_at + 1 h (10 min when a source was missing): the API refreshes the row after this.';
comment on column public.airport_weather.payload is 'The AirportWeather as answered (shared/src/weather.ts): hourly rows at UTC instants, the latest observation, the sources and their issue times.';
create or replace function public.airport_weather_prune() returns trigger language plpgsql as $$
begin
  delete from public.airport_weather where fetched_at < now() - interval '1 day';
  return null;
end;
$$;
drop trigger if exists airport_weather_prune on public.airport_weather;
create trigger airport_weather_prune after insert or update on public.airport_weather
  for each statement execute function public.airport_weather_prune();
alter table public.airport_weather enable row level security;
-- then the anon / authenticated revokes, in the route_days do-block form
```

- **`backend/.env.example`** gains:

```
# Version D weather (docs/REAL_DATA.md, step 2). WEATHER_PROVIDER picks where GET /weather/airport gets an
# airport's weather: "live" (default: NOAA's NWS gridpoint forecast for US airports, the Aviation Weather
# Center's TAF and METAR for every airport, Open-Meteo for airports abroad and for what NWS leaves empty; all
# free, no key), "fixture" (the saved answers in fixtures/weather, for tests) or "off" (the route answers 404
# and the app shows the illustrative weather, as before step 2). An airport is kept 1 h (10 min when a source
# was missing), in memory and in the `airport_weather` table with Supabase, and never past 24 h.
# WEATHER_PROVIDER=live

# A contact for the User-Agent the sources ask for (NWS suggests "website, email"). The app's name is sent either way.
# WEATHER_CONTACT=

# Airports one API process may fetch per hour (each is one Open-Meteo call, one or two NWS calls in the US and a
# TAF and a METAR); past it a record within 24 h stands in, else the request answers 503. Default 120. AWC calls
# are also held to 50 a minute per process (AWC allows 100; Open-Meteo allows 10,000 a day, non-commercial).
# WEATHER_AIRPORTS_PER_HOUR=120
```

- **`README.md`** gains a "5. Real airport weather for version D" part after "4. Real schedules": the three
  variables, the schema re-run, the credits shown and Open-Meteo's non-commercial terms.

#### Fixtures (`backend/fixtures/weather/`)

Real answers from S, all fetched within 15:21–15:33Z on 2026-11-04; the tests pin one clock for all of them:
`WX_FETCHED_MS = Date.UTC(2026, 10, 4, 15, 30)` (`WX_FETCHED_AT = "2026-11-04T15:30:00.000Z"`). Nothing is fetched
again on a later day: the Open-Meteo files are converted from the saved ISO answers, which is exact because each
covers a stretch with one fixed offset (`utc_offset_seconds`).

| File | From S | How |
| --- | --- | --- |
| `openmeteo-LHR.json`, `openmeteo-HNL.json`, `openmeteo-DEL.json` | `openmeteo-lhr.json` (16 days), `openmeteo-hnl.json`, `openmeteo-del.json` (7 days) | `jq '.utc_offset_seconds as $o \| .hourly.time \|= map(strptime("%Y-%m-%dT%H:%M") \| mktime - $o) \| .hourly_units.time = "unixtime"'`. DEL's rows fall at :30 UTC (first 2026-11-03T18:30Z), which exercises instant-based overlays and picks |
| `nws-grid-JFK.json`, `nws-grid-LAX.json`, `nws-grid-HNL.json` | `nws-grid-jfk.json`, `-lax`, `-hnl` | trimmed to what the parser reads, values untouched: `jq '{properties: (.properties \| {updateTime, validTimes, gridId, gridX, gridY, temperature, windSpeed, windGust, windDirection, skyCover, probabilityOfPrecipitation, weather, visibility})}'` (about 34 KB each). LAX and HNL have an empty visibility series |
| `nws-points-JFK.json`, `nws-points-LHR.json` | `nws-points-jfk.json`, `nws-points-lhr.json` | verbatim (OKX 42,40; the 404 problem body) |
| `awc-taf-{KJFK,KLAX,PHNL,EGLL}.json`, `awc-metar-{KJFK,KLAX,PHNL,EGLL}.json` | `awc-taf.json`, `awc-metar.json` | split by `icaoId`, one-element arrays: `jq '[.[] \| select(.icaoId=="EGLL")]'` |
| `awc-taf-KDJT.json` | `awc-taf-pbi.json` | verbatim (VCTS and FM groups) |
| `awc-taf-KFRG.json` | `awc-taf-kfrg.json` | verbatim: `[]`, a station with no TAF |

`createFixtureWeatherProvider(dir, now)` (`WEATHER_PROVIDER=fixture`) reads `openmeteo-{IATA}.json`,
`nws-grid-{IATA}.json` (US and PR airports), `awc-taf-{ICAO}.json` and `awc-metar-{ICAO}.json`. A missing file is
that source missing, as if it had not answered; then the same parsers and `composeAirportWeather` as live, with
`fetchedAt` from `now`. No file at all → `ProviderError("no weather fixture for {code}")`; no forecast file → the
compose ProviderError. The points files are only for the `parsePoints` tests.

What the samples hold (the tests assert these):

- **KJFK** TAF issued 14:25Z, amended, valid 14Z Nov 4 to 18Z Nov 5: base 20010KT P6SM FEW250, FM groups at 04Z, 07Z
  and 13Z Nov 5, `PROB30 0513/0518 -SHRA`. METAR 14:51Z: 18.3 °C, 220° at 9 knots, "10+", FEW. NWS OKX grid updated
  12:41:18Z, valid from 06Z for P7DT19H (187 hours), with a visibility series.
- **EGLL** TAF issued 10:54Z, valid 12Z Nov 4 to 18Z Nov 5: base 07013KT 9999 SCT030 BKN045; `PROB40 TEMPO 0412/0418
  08015G27KT` (its visibility is `""`, unchanged); `PROB30 TEMPO 0420/0502 8000 -RA` (visibility 4.97 miles).
  METAR 14:50Z: 10 °C, 070° at 13 knots, "6+", BKN032 OVC040.
- **KLAX** TAF issued 14:15Z: VRB03KT then FM groups. METAR 14:53Z. NWS LOX grid updated 08:21:39Z, 191 hours from
  02Z, no visibility.
- **PHNL** TAF issued 14:40Z, valid from 15Z: base 06011KT VCSH, `FM042000 05015G25KT` (no weather), `FM050600
  05010G20KT`. METAR 14:53Z. NWS HFO grid updated 14:01:53Z, 198 hours from 08Z, no visibility.
- **KDJT** (PBI): `VCTS SCT025CB` in the base group.

#### Tests (`backend/scripts/test.ts`, about 46 new)

The step-1 helpers are reused as they are (`group`, `test`, `fetchDouble`, `answer`, `clockAt`, a sleep spy).
`main()` also sets `WEATHER_PROVIDER=fixture`, so no test reaches the network; the weather route tests use their own
address (`x-forwarded-for: 203.0.113.88`) and call `airportWeatherCache.clear()` first.

- **weather: validation (3)** `invalid_code` for "", "jfk", "JFKX", "LAX ", "J1K"; `unknown_airport` for "ZZZ";
  `{ ok: true, query: { code: "JFK" } }`.
- **weather: settings (3)** `weatherProviderName` (unset → live, "FIXTURE" → fixture, "off" → off, anything else →
  live); `weatherAirportsPerHour` ("5" → 5; unset, "0", "x" → 120); `userAgent` exactly "preflight-clarity capstone
  prototype", and with `WEATHER_CONTACT=ops@example.org` "preflight-clarity capstone prototype (ops@example.org)".
- **weather: open-meteo (3)** `forecastUrl(40.6413, -73.7781)` exactly as in the sources table; `openMeteoRows` on
  LHR (363 rows, the 21 with a null temperature dropped; 12:00Z: 10.5 °C, 13.2 knots from 74°, visibility 10 from
  20,620 m) and on DEL (first row 2026-11-03T18:30:00.000Z), and a ProviderError for an ISO-time body; `wxFromWmo`
  (0 and 3 → none; 45 fog definite; 48 freezing_fog; 61 at 20, 40, 80 and unknown → slight, chance, likely,
  chance; 96 → thunderstorm and hail; 99 → both heavy) and `openMeteoGust` (the 4 LHR hours on 14 November pass; no
  hour in the first 10 days does).
- **weather: nws (4)** URLs (four decimals) and `parsePoints` (JFK → OKX 42 40; the LHR 404 body → null);
  `parseDuration` (PT1H 1, PT13H 13, P1DT17H 41, P7DT19H 187, PT30M 1), `nwsSeries` run-length intervals and nulls,
  `valueAt` at both ends of an interval; `wxFromNws` (the all-null element → []; chance light rain_showers;
  scattered moderate rain_showers → `where: "scattered"`; slight_chance thunderstorms with intensity null →
  thunderstorm moderate slight; patchy fog → definite, patchy; frost → []); `nwsForecast` on JFK (issuedAt
  "2026-11-04T12:41:18.000Z", 187 hours from 06Z, 12.964 km/h → 7.0 knots, 16,093.44 m → 10) and `nwsGust` (6 of
  the 187 JFK hours keep a gust, all on 9 and 10 November).
- **weather: awc (5)** URLs; `wxFromString` ("-SHRA", "+TSRA", "FZFG", "VCSH", "VCTS", "BR", "BLSN", "MIFG", "RASN",
  "NSW", "UP", "FC", "SQ"); `cloudPctFrom` and `visibilityFrom` (every value in the tables); `tafTimeline` on KJFK
  (FM replaces the state: 6 knots from 190° at 05Z Nov 5, 10 knots and BKN at 13Z; PROB30 → slight light showers
  13–18Z only; issuedAt 14:25Z) and on EGLL (13 knots from 070° all through 12–18Z with no gust; tempo gust 27 at
  40 %; PROB30 TEMPO rain slight, visibility unchanged); on PHNL (VCSH gone after 20Z; gust 25 as reported) and
  KLAX (VRB03KT → direction null); KDJT (VCTS → thunderstorm, nearby, chance); KFRG `[]` → null;
  `metarObservation` (KJFK at WX_FETCHED_MS: at "2026-11-04T14:51:00.000Z", 18.3 °C, 220° at 9 knots, 10 miles, no
  floor, cloud 20, `[]`; EGLL: floor 6, cloud 100; a 00000KT report → 0 knots; a report with no wind keys → wind
  null; KJFK at 16:30Z (99 minutes later) → null).
- **weather: compose (6)** through `createFixtureWeatherProvider(…, clockAt(WX_FETCHED_MS))`:
  HNL (all four sources): 168 rows; 20:00Z Nov 4 from ["awc-taf", "nws"], 15 knots from 50° gusting 25, visibility
  6 with the floor (Open-Meteo's 5,820 m is below the TAF's floor), 25.6 °C and 14 % from NWS; 20:00Z Nov 6 from
  ["nws", "open-meteo"], 18.0 knots, no gust (NWS 23 is only 5 over), visibility 4.6 from Open-Meteo; `missing` [].
  JFK (no Open-Meteo file): 187 NWS rows; 15:00Z Nov 4 from ["awc-taf", "nws"], 10 knots from 200°, visibility 10
  (NWS agrees with the TAF's floor), cloud 20; 18:00Z Nov 6 heavy definite showers with a slight chance of thunder,
  visibility 1.5, 92 %; the observation kept; `missing` ["open-meteo"]. LHR: no "nws" anywhere; 12:00Z Nov 4 from
  ["awc-taf", "open-meteo"], 13 knots from 70°, gust null, `tempoGust` { 27, 40 }, visibility 10; `missing` [].
  DEL: rows at :30Z from ["open-meteo"], `missing` ["awc-taf", "awc-metar"]. LAX: 15:00Z Nov 4 direction null at 3
  knots, visibility 6 with the floor; 20:00Z Nov 6 visibility null. Neither forecast source → ProviderError;
  `sources` carry their issue times; rows ascend without repeats.
- **weather: live provider (6)** over `fetchDouble` with a sleep spy and a fake clock: the calls and their order
  (Open-Meteo; the JFK gridpoint straight from `NWS_GRIDS`, no `/points`; the TAF, a 250 ms sleep, the METAR); the
  User-Agent on every call, with and without `WEATHER_CONTACT`; the `accept` headers; a gridpoint 404 → `/points`
  once → the grid again, cached for the next airport (`clearNwsPoints` resets it); AWC `[]` and 204 → not missing;
  NWS 500 → `missing: ["nws"]` and a record; a 429 retried once after Retry-After (capped at 2 s), a second 429 →
  missing; a source past the 6-second deadline → missing, the rest composed; a 51st AWC call in a minute → that
  airport skips both AWC calls (`missing` has both, no AWC request made), and the next minute it does not; a 200
  that is not JSON → missing; nothing answered → ProviderError.
- **weather: cache (8)** a miss asks the provider, a hit does not, a second cache instance hits the durable layer;
  an hour's TTL, 10 minutes with a missing source; nothing past 24 hours, even when the sources fail; the budget
  (`budgetPerHour: () => 2`: a stale record stands in with the warning, else reason "budget"; the hour rolls; the
  fixture provider is never counted); the stale-if-error warning word for word; read and write failures warn and
  still answer; two requests in flight share one fetch; LRU capacity without storage.
- **supabase row mapping: airport weather (1)** and **file store: airport weather (1)**: round trips (Postgres
  timestamp forms, a string payload), drop on sight, sweep on write, the "airport|provider" key, a file of its own
  next to DATA_FILE.
- **routes: weather (5)** fixture provider: 200, `cache-control: public, max-age=600`, `cached` false then true, the
  record persisted as "JFK|fixture" in `airport_weather.json`; 400 for each code, `no-store`; `WEATHER_PROVIDER=off`
  → 404 `{ ok: false, error: "not_found" }` (set per request, then restored); BOS (no fixture) → 502
  `provider_error`; `WEATHER_AIRPORTS_PER_HOUR=1` → the second airport 503 `provider_budget` with Retry-After 600;
  429 on its own address.
- **routes: no storage (1)** `/weather/airport` answers from memory alone.

### Frontend (version D only; A, B and C keep the generator)

#### `frontend/lib/weather/fetch.ts` (new)

```ts
"use client";
/** How long the API gets before the day goes on without this airport's weather (under the schedule's 8 s). */
export const WEATHER_TIMEOUT_MS = 7_000;
/** A record is reused for an hour of the session; a failed ask is remembered for a minute. */
export const RECORD_TTL_MS = 60 * 60 * 1000;
export const FAILURE_TTL_MS = 60 * 1000;
/**
 * GET /api/weather/airport?code=XXX, once per airport per hour (shared by every route-day touching it); null on
 * any failure. A 404 (no backend, or WEATHER_PROVIDER=off) is remembered: no later airport of the session asks.
 */
export function fetchAirportWeather(code: string): Promise<AirportWeather | null>;
/** `{ ok: true, weather }` with the record's header fields in place (airport, tz, provider "live" or "fixture", fetchedAt, the sources, missing and hours arrays, observation null or an object); the rows are checked as reports are built. */
export function isAirportWeatherResponse(body: unknown): body is { ok: true; weather: AirportWeather };
```

A record whose `airport` is not the code asked for is null. Module state: the records by code (with when they were
asked and whether they failed) and `weatherMissing`. Called only from the day store's loader, never in render.

#### `frontend/lib/flights/store.ts`

- `load(key, day)`: `const [schedule, weather] = await Promise.all([fetchSchedule(day), fetchDayWeather(day)])`, then
  `settle(key, day, schedule, weather)`: one settle, one `notify()`, as today.
- `fetchDayWeather(day): Promise<RouteDayWeather>`: the airports as flown, `routeDay(day).origin` and `.destination`
  (a throw → `{}`; an airport with `known: false` → `{}`); `ahead = daysUntil(day.date, new Date())`, the loader's
  clock, never render; outside −1 to `WEATHER_FORECAST_DAYS` → `{}` with no request; else both
  `fetchAirportWeather` calls at once → `{ origin, destination }`.
- `settle(key, day, schedule, weather)`: with a schedule → `optionsFromSchedule(schedule, weather)`, the rest as
  today. The generator's stand-in: `optionsFromSchedule(generatedSchedule(day, fetchedAt), weather)` when either
  record is there (it reproduces `searchFlights(day)` field for field, `check-schedule.ts`, and carries the real
  reports), else `searchFlights(day)` as today; `provider: "generator"` and `served` as today. Real weather cannot
  make `settle` throw (`weatherAtFor` turns any throw into the generated report).
- Unchanged: `RouteDayState`, `ensureRouteDay`, the 48-day eviction, `useRouteDay`, `readRouteDay`, the 8 s
  schedule timeout, `apiMissing`, `isDayResponse`; `source.ts` and `ToolContext.tsx` are untouched. The mascot shows
  until both have settled (at most 8 s); a weather failure or timeout leaves that end generated, and labelled.

#### Credits (`frontend/components/d/brand/`)

```ts
// attribution.ts
export type { CreditPart } from "@preflight/shared/weatherCredit";
export function scheduleAttribution(provider: DayProvider | null): string;                    // unchanged
export function scheduleAttributionFor(providers: ReadonlyArray<DayProvider | null>): string; // unchanged
/** Both ends' reports of each option, in order. */
export function reportsOf(options: readonly FlightOption[]): WeatherReport[];
/** A page's credit: the schedule's, then the weather's when the page uses weather. */
export function dataAttribution(provider: DayProvider | null, reports: readonly WeatherReport[] | null): CreditPart[];

// Attribution.tsx
/** One quiet line of parts: text, and links that open in a new tab (rel "license noreferrer" for the licence link, "noreferrer" otherwise; class "underline decoration-1 underline-offset-2"). */
export function Attribution({ parts, className }: { parts: readonly CreditPart[]; className?: string }): ReactNode;
```

| `reports` | `weatherCredit(reports)` | AeroDataBox day | Generator day |
| --- | --- | --- | --- |
| null or empty (the page uses no weather) | — | Schedules: AeroDataBox · fares are illustrative | Illustrative schedule |
| at least one real | the parts | Schedules: AeroDataBox · {parts} · fares are illustrative | Illustrative schedule · {parts} |
| none real | null | Schedules: AeroDataBox · weather and fares are illustrative | Illustrative schedule and weather |

Example: "Schedules: AeroDataBox · Weather: NOAA and Open-Meteo.com (CC BY 4.0, adapted), forecast as of Wed 12:21 AM
LAX time · fares are illustrative".

#### Pages

- **Results** (`DResults.tsx`): the line under the count becomes `<Attribution className="mt-0.5 text-xs leading-snug
  text-ink-500" parts={dataAttribution(provider, scores ? reportsOf(options) : null)} />`, where `scores` is
  `avail.turbulence` and `options` the flights still to leave. The page uses weather only through the takeoff &
  landing rating within 2 days; 3–7 days out it shows none and names none.
- **Result card** (`DResultCard.tsx`): in the "Why?" panel, after the factors, when `w = lead.weather ??
  second?.weather` is set: `<Attribution className="mt-2 text-ink-mute" parts={ratingWeatherCredit(w)} />`.
- **Flight page** (`DFlightDetail.tsx`): under the header, `<Attribution className="mt-2 px-1 text-xs leading-snug
  text-ink-mute" parts={dataAttribution(provider, availability.weather ? [flight.weather.origin,
  flight.weather.destination] : null)} />`. `SECTION_OVERRIDES` gains `weather: { Body: DWeatherBody }`. The More
  detail intro stays "The full sections for this flight. Open as much or as little as you like." (a sentence calling
  the rest illustrative would be false on AeroDataBox days).
- **`DWeatherBody.tsx`** (new, `frontend/components/d/flight/`): the untouched `WeatherSection`, then, when
  `availabilityFor(ctx.daysUntil).weather`, two lines in `px-1 text-xs leading-snug text-ink-500`:
  `endCredit(flight.weather.origin)` and `endCredit(flight.weather.destination)`, each an `<Attribution>`. This puts
  the source, the time and Open-Meteo's link next to the cards that show the figures.
- **`FlightSections.tsx`** (`frontend/components/c/flight/`, the one C file step 2 touches): `SectionOverride` gains
  `Body?: ComponentType<SectionProps>`, and a section renders `overrides?.[section.id]?.Body ?? section.Body`. C
  passes no `Body`, so its output is unchanged (the capture below checks it). It is the only way to put the line
  beside the cards without copying `WeatherSection`.
- **Rating sheet** (`RatingSheet.tsx`): the footer is `["Prototype. ", …ratingWeatherCredit(rating.weather)]` when
  `rating.weather` exists, else today's sentence.
- **Compare** (`DCompareTable.tsx`): the line under the table is `dataAttribution("aerodatabox" when any column's day
  is AeroDataBox's, else "generator", the columns with avail.turbulence ? reportsOf(their options) : null)`. The
  table has no weather rows; its takeoff & landing pills within 2 days use the weather.

What D shows, by distance: beyond 7 days nothing is fetched, the cards are pending, the ratings use history and the
lines are step 1's. From 3 to 7 days the flight page's cards show condition, label and temperature (real when
fetched) with the wind and visibility marker, the end lines and a header credit that names the weather; results and
compare show no weather and keep step 1's lines. Within 2 days every figure, the note and the tint are real where a
source had them, the takeoff & landing rating uses the real wind and weather, and the three pages, the sheet and the
"Why?" panel credit them.

### Order of work, verification and limits

**Order of work** (three builders who cannot talk to each other):

1. **The contract commit (Shared, first and short).** `types.ts` additions; `tz.ts` and `airportIcao.ts` complete;
   `weather.ts` and `weatherCredit.ts` with every export, the bodies stubbed to "nothing real" (`realWeatherReport`
   and `pickHour` → null, `weatherCredit` → null, `endCredit` → the illustrative line, `ratingWeatherCredit` → [];
   `windDirFor`, `shownVisibility` and `clockLabel` real); the `fakeFlight.ts` seam and `schedule.ts` complete (they
   only reach the stubs); `Rating.weather` declared; `GENERATED_RATINGS_SNAPSHOT` computed on this commit, before
   `ratings.ts` changes; `check-weather.ts` in the chain with the ICAO, purity and unchanged-output checks.
   `npm run check` green. The app works exactly as before on this commit.
2. **The three bodies, in parallel on top of it.** Shared: the vocabulary, the builder, the credits, the ratings, the
   five `fakeFlight.ts` branches, the whole of `check-weather.ts`, `verify-icao.ts`. Backend: the fixtures copied
   from S; `types` → `http` → `openmeteo`, `nws`, `awc` with their tests → `compose` → `live` and `fixture` →
   `cache` → the stores, `db.ts`, the schema, `.env.example`, README → `index`, the route, `app.ts` → the route
   tests; `nws-grids.ts`, run where there is network. Frontend: `fetch.ts` → `store.ts` → `attribution.ts` and
   `Attribution.tsx` → `DWeatherBody.tsx` and the `FlightSections` field → the five D components →
   `npm run typecheck -w frontend`, `npm run lint`, `npm run build -w frontend`.
3. **Merge** shared → backend → frontend, run the verification, then add a step 2 status note to this document.

**Verification:**

1. `npm run check`: typecheck of all three, lint, `check-fake-flight`, `check-search` (`AB_SNAPSHOT` unchanged),
   `check-ratings`, `check-schedule`, `check-weather`, and the backend's 124 tests plus the new ones.
2. `npm run build`.
3. A, B and C frozen: the 14-page capture of step 1 repeated (the same URLs on `main` and on the branch,
   `node frontend/scripts/shot.mjs <url> <png>` at 390 px and with `--desktop`, taken within the same few minutes
   with the same `date` values, `cmp` byte-identical); `git diff data/real-schedules --stat` shows nothing under
   `frontend/components/dashboard`, `frontend/app/c` or the study routes, and under `frontend/components/c` only
   `FlightSections.tsx`.
4. Backend smoke with `WEATHER_PROVIDER=live`: `curl -s 'localhost:8787/weather/airport?code=JFK' | jq '.weather.sources,
   .weather.missing, .weather.hours[20], .weather.observation'` (four sources, nothing missing); `code=LHR` (no
   nws); `code=DEL` (rows on whole UTC hours); `code=zzz` → 400; `WEATHER_AIRPORTS_PER_HOUR=1` → the second airport
   503 with Retry-After; `WEATHER_PROVIDER=off` → 404; `/health` unchanged.
5. The D walk (`npm run dev`, `/d?test=1`), at 390 and 1280 px: JFK→LAX and JFK→LHR tomorrow: the results credit, a
   card's "Why?" with its note, the line under the flight header, a rating row's basis, the sheet's "Source at"
   rows and footer, More detail's two cards with their lines, the compare table's line. Then a day 5 days out
   (real condition and temperature on the flight page; no weather in the results and compare lines) and one 12 days
   out (no `/api/weather` request in the network panel; pending cards). With the backend stopped, every page as
   before step 2.
6. Production: re-run `backend/supabase/schema.sql` (idempotent: it creates `airport_weather`, and `route_days` if
   step 1's run is still pending). Nothing needs to be set for live weather; `WEATHER_CONTACT` is optional.

**Limits that stay, and how they are worded:**

- Real and illustrative side by side: within 2 days the takeoff & landing rating combines the real wind and weather
  with the generator's climb and descent bumps. The sheet's footer and the "Why?" note say the climb and descent
  lines are illustrative; the turbulence section keeps its forecast wording until the turbulence step (the GTG
  grids) makes it real.
- Open-Meteo's best-match blend changes model and resolution along the series and publishes no run time (hence
  "retrieved"); its chance of rain is an ensemble product at about 27 km. Its free API is non-commercial, and it
  warns that shared hosts such as Vercel may be limited earlier than its published limits. If it does not answer,
  airports abroad go illustrative (labelled), and US airports lose only the visibility past the TAF at offices that
  publish none and the hours past the NWS grid (about day 8).
- Severe weather is named, never coloured: `impact` can only be "minor", so the label and the note carry the truth.
- A PROB30 group or a slight chance never makes the label; it is one clause in the note.
- A visibility floor shows as "6 mi" on the A/B/C card (it prints the number); the line under it says "visibility
  more than 6 miles".
- Calm wind prints no direction, and a variable one prints "Variable" (plain words rather than the code VRB).
- A settled day keeps its weather for the session, with its as-of labels; there is no refresh in this step.
- The budget and the AWC allowance are per process: several Vercel instances in one burst could exceed AWC's 100
  calls a minute. The cost is a 429, so a missing source, never a wrong figure.
- The observation reaches only flights within an hour of the latest METAR: in practice, flights leaving soon.
- PBI's override (KDJT) is hand-kept; `verify-icao.ts` names it so a future difference is not a surprise.
