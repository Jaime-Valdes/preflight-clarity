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
| 5 | Airline record: on-time across the network and on this route, last 12 months | **BTS On-Time Performance** (reporting-carrier monthly files, about 30 MB each; built 2026-11-20, see "Status: airline on-time from BTS") and UK CAA punctuality CSVs for UK routes | Free, public domain; 2–3 months behind. | US domestic and UK routes only; other carriers get a network figure from annual reports or "not available". |
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
4. Airline on-time from BTS (free, monthly job; built on branch `data/bts-ontime`, 2026-11-20) and the factual
   safety basis; drop the invented scores.
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

## Status (2026-11-27): route history from MADIS (cruise, US routes)

Order of work item 3, the cruise half (the source map's row 4, with a better source than PIREPs):
version D's booking-time cruise rating is measured. A, B and C keep the generator's history.

- **Source**: NOAA MADIS public archive, ACARS hourly NetCDF files
  (`madis-data.ncep.noaa.gov/madisPublic1/data/archive/YYYY/MM/DD/point/acars/netcdf/`), the eddy
  dissipation rate (EDR) many US airliners report automatically several times a minute. "Archived data
  is available without restriction"; real-time redistribution is not allowed, and we only publish
  monthly counts from the archive. PIREPs were tried first and dropped: pilots report bumps, rarely
  smooth air, so "% smooth" can't be read from them.
- **Method** (`backend/scripts/route-history/analyze.ts`): readings → flights (encrypted tail + truncated
  airport codes, split on 90-minute gaps; cruise = within 15% of the flight's top, above 3,000 m) → for
  each US route pair, its own identified trips plus any flight that cruised along at least half of its
  great circle within 50 nm. Smooth = no cruise reading above EDR 0.10 (ICAO "nil"); calm = none at
  0.20 or above. Also counted: flights by local time of day per direction, and where along the route
  the strongest bump of each non-smooth flight was. Checked on January 2026 against 132 routes' own
  trips: within about 3 points on average, close to sampling noise.
- **Coverage** (Nov 2025–Oct 2026): 1,330–1,380 of 1,492 flown US pairs have 30+ flights in a month,
  91–94% of scheduled US flights. Thin pairs (Hawaii hops, PDX–SEA) pool the neighbouring months, and
  below 30 they get the route-and-season rating, labelled "no measured history for this route".
- **Pipeline**: `.github/workflows/route-history.yml` runs on the 3rd of each month for the month
  before (one job per month, about 1.1 GB downloaded each), writes `backend/route-history/months/YYYY-MM.json`,
  rebuilds `backend/src/lib/routeHistory/route-history.json` (summed by calendar month) and opens a PR.
  Run it by hand with `months: YYYY-MM..YYYY-MM` to backfill or rebuild.
- **App**: GET /flights/day attaches `routeHistory` (the day's routes for its month, shared/src/routeHistory.ts);
  the day store keeps it; `rateFlight({ option, today, history })` rates the cruise from it (the route's
  share, moved toward this departure's window when it has 30+ flights); the rating sheet and the
  turbulence section under "More detail" show the figures and the source.
- **Not yet**: the within-2-days forecast is still the generator's (step 6, GTG); international routes.
  Takeoff and landing: see the next section.

## Status (2026-11-28): takeoff and landing from MADIS and METAR (US airports)

Order of work item 3, the other half: version D's booking-time takeoff & landing rating is measured
too. A, B and C keep the generator's.

- **Source**: the same NOAA MADIS ACARS readings, in the first and last few minutes of flights; and each
  airport's routine hourly weather reports (METAR) from the Iowa Environmental Mesonet's ASOS archive
  (`mesonet.agron.iastate.edu/cgi-bin/request/asos.py`, free; one airport every few seconds, it answers
  429 to bursts).
- **Method** (`analyze.ts` analyzeEnds): the readings grouped into flights as for the cruise, whether or not
  the flight has one. A departure is the group's first readings while they stay within 30 nm of the
  airport and below 4,500 m (the first reading must be there; the airport is the catalogue airport nearest
  to it that the truncated origin code could be); an arrival the same from the last reading back. At
  least 3 readings. Smooth and calm as at cruise (EDR 0.10, 0.20). Counted per airport by local time of
  day (the takeoff's first reading, the landing's last). Reports usually start a few hundred metres up on
  departure (median first reading about 950 m above sea level) and run to a few hundred metres on arrival.
  Weather (`weather.ts`): per airport and window, hours reported, with a gust, with 15 kt or more, with a
  thunderstorm.
- **Checks** (January 2026): airports differ for real (the spread between airports, about 13 points, is
  well above the gap between a month's odd and even days, about 7); 20 nm instead of 30 changes nothing;
  the time of day matters a lot (arrivals at noon–3 PM about 25% smooth, mornings about 68%); gusty
  hours go with bumpy ends in every season (correlation −0.63 to −0.73 across airport × window cells;
  wind of 15 kt or more about −0.3, thunderstorms about −0.1). In summer, departures were 77% smooth
  where gusts came in under 8% of hours and 24% where they came in a quarter or more; arrivals 60% and 16%.
- **Coverage**: about 70 of the 86 catalogue US airports have readings in a month, about 60 with 30+
  departures and 30+ arrivals; weather for nearly all. Airlines report at low altitude very unevenly (the
  tails are encrypted, so which ones can't be told), so some hubs (ATL, MSP, DTW, SLC) are rich and
  others (DEN, IAH, ORD) much thinner than their traffic. Thin airports pool the
  neighbouring months; below 30 an end takes US airports' share for its window, and says so.
- **Rating** (`ratings.ts` rateApproachMeasured): the origin's smooth share for departures and the
  destination's for arrivals, each moved toward the flight's time-of-day window there when it has 30+
  flights, then multiplied: the chance both ends were smooth, so a rough landing is never made up for by
  a smooth takeoff. Tiers at 40 / 23 / 9 / 2.5, the Nov 2025–Oct 2026 quantiles that split US flights
  (every flown pair both ways, the 15th of each month, the generator's times) about 20 / 30 / 31 / 14 /
  6%; by season, from 0–1% Bumpy in December–February to about 10% in April–June, when the air near
  the ground is liveliest (arrivals about 36% smooth, against 52–55% in winter). The sheet shows both shares, light-bumps-at-most, the
  calmest time at each end and how often gusts were reported at those hours; the turbulence section
  under "More detail" shows the two airports beside the route. A day without airport figures (an older
  table) keeps the traits model.

## Status (2026-11-20): airline on-time from BTS (live)

Order of work item 4, first half (the source map's row 5): version D's airline on-time numbers are the US DOT's,
not the generator's. Live in production since 2026-11-20 (commit d1f61b3); Next.js 16.4.6 followed (55cad1f).

- **Source**: the US DOT Bureau of Transportation Statistics, TranStats "Reporting Carrier On-Time Performance
  (1987-present)", the monthly PREZIP files
  (`https://transtats.bts.gov/PREZIP/On_Time_Reporting_Carrier_On_Time_Performance_1987_present_YYYY_M.zip`, about
  30 MB each, a 275 MB CSV inside). Public domain, free, no key. US domestic flights of the reporting carriers only.
- **Why the Reporting Carrier file, not the Marketing Carrier file** (the source map said marketing): AeroDataBox's
  rows name the *operating* carrier (the JFK fixture lists "YX 4512, Republic Airways" for an American Eagle
  flight), and so does the generator. The Reporting Carrier file is keyed by the operating carrier
  (`IATA_CODE_Reporting_Airline`), so a schedule row's code finds its figure directly, and the network figures are
  the ones DOT's Air Travel Consumer Report ranks. With the Marketing file a Republic row would have found no
  figure, and "American" would have mixed in Envoy, PSA, Piedmont, Republic and SkyWest flights.
- **Definition** (DOT's, as the Air Travel Consumer Report applies it): on time is arriving less than 15 minutes
  after the scheduled arrival (`ArrDel15 = 0`). Every scheduled flight in the file counts; a cancelled or diverted
  flight counts as not on time. (A flown flight without an arrival indicator would also count as not on time; the
  current period has none.)
- **Period**: October 2025 to September 2026 (`2025-10` to `2026-09`), the latest twelve months published on 2026-11-20 (September 2026
  was posted on 19 November; BTS runs about two months behind). 7,057,696 scheduled flights.
- **Industry figure** (every reporting carrier together, the benchmark line in D): **75.1%** (shown as
  75%). It replaces the hard-coded 78% ("DOT ATCR 2024") in D only; A, B and C keep 78%
  (`BENCHMARKS.onTimePct` is unchanged; D passes the measured figure through `BenchmarkLine`'s `against`).
- **Sample floors**: a carrier's network figure needs flights in every month of the period and 1,000 scheduled
  flights (every reporting carrier has far more). Two carriers reported in only part of it and are left out, so no
  figure claims months it does not cover: Hawaiian (HA, October to December 2025; its flights are reported under
  Alaska from January 2026) and Spirit (NK, October 2025 to May 2026). Their flights still count in the industry
  figure. A Hawaiian or Spirit row shows "not available". A carrier's figure on one route (origin → destination,
  one direction) needs **200** flights, about four a week for a year: at an on-time share near 80% the standard error is then under 3 points, and no single
  day's flights move it by more than a point or two. Below that the route line is left out and the network figure
  stays.
- **The table**: `backend/src/lib/onTime/bts-ontime.json`, 177,068 bytes (52,878 gzipped): the period, the
  industry figure, 12 carriers and 4,765 routes with 7,399 carrier-route figures, each as
  `[on-time %, flights]`. It is bundled into the API only. `GET /flights/day` adds `onTime` beside `schedule`
  (`{ source: "bts", from, to, industry, carriers, routes }`: every network figure and the day's own routes, about
  640 bytes for JFK→LAX), computed on the way out and never stored with the cached day, so a refreshed table
  shows at once; a client that predates it ignores the field, and the type is `RouteOnTime` in
  `shared/src/onTime.ts`. D's first load does not grow (the client bundle carries no table). The CDN keeps a
  `/flights/day` answer for 10 minutes, figures included.
- **What D shows** (`frontend/lib/d/onTime.ts`, the flight page's Airline record card, More detail → Airline, the
  compare table's On time row): the network figure ("79% on time" for Delta), "Across the airline’s flights · 72% on
  this route" (the route part only with a route figure), the line against the industry figure for the same months, and
  the credit "On-time: US DOT, BTS · Oct 2025–Sep 2026" (under the figure on the flight page and in the airline section,
  under the compare table). The definition replaces "within 15 minutes" in the card's footnote. The figures are
  about the airline and the route, not the schedule, so the illustrative (generator) flights get them too when
  their carrier is a US reporting carrier. Where there is no figure: "On-time record not available · The US DOT
  has no on-time figure covering the last 12 months for this airline" (non-US carriers, carriers too small to report,
  and carriers that did not report every month, such as Hawaiian, whose flights report under Alaska from January
  2026, and Spirit); the compare cell says "Not available · The US DOT has no figure for this airline". When a day
  came without figures (the browser's own illustrative day, when the API cannot be reached) the line says "The US
  DOT figures did not load this time". The generator's invented `airlineStats.onTimePct` and `onTimeRoutePct` are
  never shown in D; A, B and C still show them, unchanged.
- **Refresh monthly, automated**: the GitHub Action `.github/workflows/bts-refresh.yml` ("BTS on-time refresh")
  runs on the 20th of each month at 09:17 UTC and again on the 27th (in case BTS posted late). It never pushes to
  main; it opens a pull request, and **merging that pull request is what deploys the new figures to production**.
  - What a run does: `backend/scripts/bts-download.ts` probes the PREZIP files backwards from the current month
    (a ranged GET of each file's first bytes: 404 is "not yet", a ZIP is "published", anything else fails the run
    rather than pass for "nothing new") to find the latest published month. If that is the committed table's `to`,
    the run ends green with the notice "No new month". Otherwise it downloads the twelve months ending there, one
    at a time, into the runner's temp folder (`bts-YYYY-MM.zip`; four attempts each, a 20-minute cap and a
    90-second stall cap per attempt, a 200 MB size cap; each checked to be a ZIP holding one CSV); then the
    precompute rebuilds the table, `npm run test -w backend` and `shared/scripts/check-on-time.ts` check it,
    `backend/scripts/bts-summary.ts` writes the summary (the period, the industry figure old → new, each carrier's
    network figure old → new, the number of routes, the merge-deploys-to-production reminder), and the run commits
    only the table to the branch `data/bts-refresh-YYYY-MM` and opens the pull request with the summary as its body.
    A failed download, precompute or check fails the job (GitHub emails the owner) and opens nothing. An open pull
    request for the same month (the 27th after a successful 20th) means nothing to do. A rebuilt table that is
    byte-identical to the committed one opens nothing.
  - **Tested on 2026-11-20** (branch `ci/bts-refresh`, a dry run with `end_month` 2026-09,
    [run 44789424904](https://github.com/Jaime-Valdes/preflight-clarity/actions/runs/44789424904)): the runner
    downloads from transtats.bts.gov without trouble (twelve months in 221 s, 14–20 s each), and the whole job takes
    about 4½ minutes; the rebuilt table was byte-identical to the committed one (sha256 `c47f4cd8…`), as it was
    locally. The install step runs `npm ci` with npm 11.6.1 (the version that wrote `package-lock.json`): npm 10
    and the runner's npm 11.19.1 refuse the lockfile ("Missing: @emnapi/core@1.11.3 from lock file"), so the first
    two test runs stopped there. Once the lockfile is rewritten by a current npm, plain `npm ci` will do.
  - **The repository setting it needs**: Settings → Actions → General → Workflow permissions → "Allow GitHub
    Actions to create and approve pull requests" (off as of 2026-11-20). While it is off, the run pushes the
    branch, then fails with an error saying so and a compare link to open the pull request by hand; after turning
    it on, re-run the job. The workflow asks only for `contents: write` and `pull-requests: write`, uses the run's
    own `GITHUB_TOKEN` (no secrets), and pins every action to a commit SHA. A pull request opened by
    `GITHUB_TOKEN` does not start other workflows, but Vercel still builds its preview.
  - **The schedule is active only once the workflow file is on main** (GitHub runs `schedule` and offers
    "Run workflow" only for the default branch's workflows).
  - **By hand from the Actions tab**: Actions → "BTS on-time refresh" → "Run workflow". `dry_run` builds and checks
    the table, prints the summary on the run's page and uploads the table and the summary as an artifact
    (`bts-ontime-YYYY-MM`, kept 14 days), without a branch or pull request. `end_month` (`YYYY-MM`) builds the
    twelve months ending there even when the table already ends there (to rebuild a period after BTS revises a
    month, or to test: `2026-09` reproduces the committed Oct 2025–Sep 2026 table byte for byte).
  - **Locally, the fallback** (if TranStats ever turns the runner away): from the repo root, with a new, empty
    folder for the downloads (they are untrusted data; never commit them):

    ```sh
    npx tsx backend/scripts/bts-download.ts --dir /tmp/bts-raw   # add --end YYYY-MM to pick the last month
    npx tsx backend/scripts/bts-ontime.ts --out backend/src/lib/onTime/bts-ontime.json /tmp/bts-raw/bts-*.zip
    npm run test -w backend && npx tsx shared/scripts/check-on-time.ts
    git show HEAD:backend/src/lib/onTime/bts-ontime.json > /tmp/bts-old.json
    npx tsx backend/scripts/bts-summary.ts --old /tmp/bts-old.json --new backend/src/lib/onTime/bts-ontime.json
    ```

    then commit only the JSON on a branch and open the pull request with the summary. TranStats can be slow from
    home (about three minutes a month on 2026-11-20, 35 minutes for the twelve, against 16 s a month on the runner).
  - The precompute streams each CSV out of its zip (no unzip, no new dependency; about 2 s a month), reads the
    months from the rows, refuses a repeated or missing month, and prints the period, the industry figure, every
    carrier and the size. The bundled-table test checks twelve consecutive months. The example figures below and
    the period named in this section describe the table as first built; the automation does not edit this file.
- **Tests**: `backend/scripts/test.ts` counts a tiny fixture (`backend/fixtures/bts/tiny.csv` and the same file
  zipped beside a readme) and checks the definition, the floors, direction, the ZIP reader, the bundled table, the
  lookup and `GET /flights/day`'s `onTime`; `shared/scripts/check-on-time.ts` checks the copy (no banned words) and
  the lookup's edge cases.

Example figures (Oct 2025–Sep 2026): network: DL 79.0%, AS 78.4%, MQ 78.7%, UA 77.2%, OO 76.7%, WN 74.0%, YX 73.8%, G4 72.9%,
AA 72.5%, F9 70.8%, OH 69.2%, B6 68.1%. JFK→LAX: AA 75.6% (3,335 flights), DL 72.4% (3,375), B6 69.5% (3,482);
LAX→JFK: DL 76.0%, B6 73.8%, AA 71.6%. LGA→ORD: AA 64.7%, YX 61.6%, UA 60.3%, DL 59.2%. The route figures run from
200 to several thousand flights (median 643).

Not done in this step: the factual safety basis (the other half of item 4: IOSA, FAA IASA, the EU list) and
dropping the invented safety score and cabin-crew rating, which the airline section under More detail still shows;
UK CAA punctuality for UK routes.

## Status (2026-11-20): step 1 is live in production

Step 1 (real schedules, `ec2d358`) went to production on 2026-11-20 at 06:29:43 UTC (the GitHub deployment
"Production – preflight-clarity", status success). `GET /flights/day` answers with `Cache-Control: public,
max-age=600`, so Vercel's CDN keeps a route-day for 10 minutes; the server's own route-day cache (memory, then
Supabase `route_days`, 24 hours) was verified live: a CDN miss came back with `cached: true`.

## Status (2026-11-19): step 1 is brought onto main

Branch `data/real-schedules-2` merges `data/real-schedules` into main as of 2026-11-19 (version D pass 4, the
Flight Day Pack test with its tracking, the privacy page). Step 1 now runs on D's current results, flight and
compare pages, by day and by night: the real nonstops, the attribution line under the results count, under the
boarding pass and under the compare table, and the date strip loading no other day. The Flight Day Pack behaves
as on main (the price arm, the results pop-in 5 s after the first scroll of a loaded day, the after-pick dialog,
the waitlist dialog, every event with `offer_version` and `via`, and the saved rows). A provider's day with no
flights in it (a 204) now falls back to the illustrative day, like a provider failure, and says so. Versions A, B
and C are pixel-identical to main by day and by night, and `generateFlight` is unchanged.

What production needs before `FLIGHT_PROVIDER=aerodatabox` is switched on:

1. **Backend env vars** on the backend's Vercel project (then redeploy): `FLIGHT_PROVIDER=aerodatabox`,
   `AERODATABOX_API_KEY=<the key>`, `AERODATABOX_HOST=rapidapi` (the key is a RapidAPI marketplace key).
   Without them the API answers from the generator and every page says "Illustrative schedule".
2. **The `route_days` table**: run `backend/supabase/migrations/2026-11-19_route_days.sql` once in the Supabase
   SQL editor (`schema.sql` carries the same statements). Until it runs the API still answers, but logs a failed
   read and write on each new day and keeps days in each server instance's memory only, so instances fetch the
   same day separately.
3. **The AeroDataBox plan**: the key is on the free Basic plan, 400 units a month, non-commercial, with the
   attribution line. A fresh route-day costs 4 units (two 12-hour FIDS windows), so about 100 fresh route-days a
   month; a cached day costs nothing for 24 hours. `FLIGHT_PROVIDER_ROUTE_DAYS_PER_HOUR` (default 60, per
   server process) is the only brake on a busy hour: on the free plan set it low (for example 4) or move to Pro
   ($8/month, 5,000 units) before the public sees it.


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
