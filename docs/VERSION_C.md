# Version C — flight comparison tool (contract)

The team's third concept (2026-10-15): an Expedia-like tool for **comparing one flight against
another with the pre-flight safety information in hand**. No onboarding, no surveys, no study
flow, nothing saved to the backend — a tool people can play with. Variants A and B (the study at
`/`) stay exactly as they are; version C lives under **`/c`** in the same Next.js app and reuses
the generator, the design system and the dashboard's section components.

Decisions taken by the lead (change only with the team):

- **Separate tool, own URL**: `/c`. Not part of A/B assignment, not linked from the study.
- **No tracking, no backend calls.** Only the visitor's compare list is kept, in `localStorage`.
- **Nonstop flights only**, economy, one-way, one traveller. Every route in the airport catalogue.
- **Illustrative prices** (whole US dollars) next to the safety information. Nothing can be booked:
  there is no "Book"/"Select" step, and the copy says so quietly where it matters.
- **Responsive**: phone first (390 px design width, works at 340 px) *and* a proper laptop layout
  (filters sidebar, wider results, compare table). Same calm design system as A/B.
- **Default sort: Smoothest first** (tabs for Cheapest, Fastest, Departure time). Honest labels only;
  no "best deal", no urgency ("only 2 seats left"), no fake scarcity, no alarm words.

## Time-aware data (docs/FEASIBILITY.md)

Version C only shows what is knowable at the flight's real distance from today (constants and
`availabilityFor(daysUntil)` in `shared/src/forecast.ts`). Where an item isn't available yet, a calm
marker replaces it — never a made-up value:

| Item | Shown when | Before that |
| --- | --- | --- |
| Flight-specific turbulence (score ring, sparkline, bump stretches, timeline, phase strip, compare overlay, Smoothest sort, minimum-smoothness filter, date-strip score) | ≤ 2 days (`TURBULENCE_FORECAST_DAYS`) | Marker "Turbulence forecast from Tue, Nov 24 · 2 days before departure". Route-level history ("About 89% of December flights on this route are smooth") may appear, labelled typical. The Smoothest sort and the smoothness filter are unavailable (with the same note); the default sort is then Departure time. |
| Weather condition + temperature | ≤ 7 days (`WEATHER_FORECAST_DAYS`) | Marker "Weather forecast from Thu, Nov 19 · 7 days before departure". |
| Wind, gusts, visibility | ≤ 2 days (`WEATHER_DETAIL_DAYS`) | Hidden. |
| Gate | day of travel (`GATE_DAYS`) | Terminal + "Gate posted on the day". |
| Tail number, this airframe's age/delivery year | ≤ 1 day (`AIRFRAME_DAYS`) | "Scheduled aircraft" + the airline's fleet-average age for the type (`aircraft.fleetAvgAgeYears`, `fleetAgeRange`). |
| Pilots | never personal | "Who flies your plane": `flight.crew` (`pilots` 2–4, `regime`, `regulator`) + the rules every airline pilot meets. No names, hours or ratings anywhere. |
| Dates | ≤ 330 days (`SCHEDULE_DAYS`) | Date pickers and the date strip stop there (`dateStatus` / `clampDate` in `frontend/lib/c/model.ts`). |

Routes no airline would plausibly fly nonstop show "No nonstop flights on this route" instead of
invented flights.

## Pages

| Route | What |
| --- | --- |
| `/c` | Home: one search form (From, To, Date) + popular routes + three short "what you can compare" tiles + quiet "illustrative data, nothing can be booked" note. |
| `/c/search?from=JFK&to=LAX&date=2026-11-26[&sort=…][filters]` | Results for one route and day. Search summary (editable), date strip (±3 days: lowest fare + best score per day), sort tabs, filters, result cards, compare tray. |
| `/c/flight?from=JFK&to=LAX&date=2026-11-26&f=DL1423` | One flight in full: the dashboard header + smoothness summary + the safety sections, fare, "Add to compare", and "Other flights this day" (from the same results). |
| `/c/compare?f=JFK.LAX.2026-11-26.DL1423,JFK.LAX.2026-11-27.AA914` | 2–3 flights side by side (any routes/dates). Without `f`, it shows the visitor's compare list. |

All four pages are static shells; the client reads the query string with **`useSearchParams()` inside
a `<Suspense>` boundary** (Next 16 + Cache Components — see "Rules" below), generates the data with
the shared generator, and renders. Today's date comes from `useTodayISO()`; dates before today or more
than 365 days ahead get a calm message with a way to pick another date. Airports: catalogue codes only
(`getAirport(code)`); the search form only accepts a picked suggestion.

### Results page (`/c/search`)

- **Search summary** at the top: `New York (JFK) → Los Angeles (LAX) · Thu, Nov 26 · 1 traveller` with
  "Change" (opens the search form inline / as a sheet on phones). Swap button for origin/destination.
- **Date strip**: 7 days centred on the searched date (clamped to today … today+365): weekday + date,
  lowest fare, best smoothness score that day. Tapping a day navigates (`router.push`). Computed after
  the day's results so the first paint isn't blocked.
- **Sort tabs**: Smoothest (default) · Cheapest · Fastest · Departure time. In the URL as `sort=`.
- **Filters** (in the URL; sidebar ≥ 1024 px, "Filters" sheet on phones, with an active-filter count and
  "Clear all"): departure time (Morning 5–11:59 · Afternoon 12–5:59 · Evening 6–11:59 · Night 12–4:59,
  only buckets that have flights), airlines (with each airline's lowest fare), aircraft size (any /
  wide-body only), minimum smoothness (any / 75+ / 85+). Filtering to nothing shows a calm empty state
  with "Clear filters".
- **Result card** (one per flight): airline mark + name + flight number; depart → arrive times (+1 day),
  duration, "Nonstop"; aircraft model + "Wide-body" pill when wide; **smoothness score** (ring/badge +
  label) and a **mini turbulence timeline** (sparkline of `turbulence.points`); one or two quiet facts
  (e.g. on-time % on this route, aircraft size); fare. Actions: **Compare** (toggle, max 3) and **Details**
  (link). The whole card is not one giant link (nested interactive elements are not allowed).
- **Compare tray**: sticky at the bottom when ≥ 1 flight is picked (on every C page): the picked flights
  as small chips with remove buttons, "Compare (n)" (enabled at ≥ 2), "Clear". At 3 picked, other Compare
  toggles are disabled with a short note ("Up to 3 flights").
- Count line: "9 nonstop flights · prices are illustrative".

### Flight page (`/c/flight`)

- Back link to the results ("← All flights JFK → LAX, Nov 26") — rebuilt from the query, not history.
- `DashboardHeader` (label "Flight details" or none — copy must not say "your flight") + `SummaryCard`
  + fare block with **Add to compare** / **In compare ✓ (remove)**.
- Sections from the dashboard, reused as-is (collapsible `SectionCard`s, first one open on desktop is
  fine): Turbulence, Pilots, Aircraft, Airline, Weather, Seat, Sounds. **Not** Alerts and **not**
  "Compare smoother options" (A/B only). Instead: **Other flights this day** — the other options from the
  same results, smoothest first (time, airline, score, fare, Details/Compare).
- Wrap the sections in an `ExploreContext` provider with `showingOwnFlight: false` so their copy says
  "this flight" (never "your flight"); its other methods are no-ops/navigation (see
  `frontend/components/dashboard/explore/context.ts`). Don't provide a `TrackerContext` (sections accept
  `useTracker() === null`). `SectionContext.variant` is `"A"` (full section content).
- Desktop: two columns (sections left, a sticky summary/fare/compare card right). Phone: one column.

### Compare page (`/c/compare`)

- Up to 3 columns (2 on phones fit side by side at 390 px; the 3rd scrolls horizontally inside the table
  with the row labels sticky — or a flight switcher; no page-level horizontal scroll).
- Column header: airline mark, flight number, route, date, depart → arrive, fare, score ring + label,
  "Details" and "Remove".
- Rows, grouped: **Smoothness** (score, label, bumpy stretches = sum of `turbulence.windows` durations with
  their count, strongest expected bumps, smooth share, forecast confidence from `getForecastStatus`),
  **Turbulence timeline** (one chart, all flights overlaid on minutes after takeoff — calm/breeze/dusk
  colours + distinct dash patterns + legend), **Schedule** (depart, arrive, duration, days away),
  **Aircraft** (scheduled type, body type, the airline's fleet-average age — this airframe's age only within a day — seat layout), **Airline** (on-time %, safety notes as the
  AirlineSection shows them), **Who flies it** (pilots on board and the rules they meet — never names or hours), **Weather** (departure/arrival
  condition + temperature, within 7 days; otherwise the marker), **Best seat** (the seat map's recommended zone/seat).
- A quiet marker for the smoothest / cheapest / fastest per row group is fine ("Smoothest" pill) — facts,
  not advice. Ties marked for all tied flights.
- Empty state (0–1 flights): explain and link back to search.

## Data contract — `shared/src/search.ts` (generator owns the internals)

```ts
export interface FlightOption {
  /** Unique within route + date, stable: airline code + number, no space — "DL1423". */
  key: string;
  /** Full flight (dashboard shape). `alternatives` is [] — C shows other options from the same results. */
  flight: Flight;
  /** Illustrative one-way economy fare, whole US dollars. */
  fareUsd: number;
}
export interface SearchResults { query: FlightInput; options: FlightOption[] }   // options by departure time
export interface DayOverview { date: string; count: number; lowestFareUsd: number; bestScore: number }

export function optionKey(flight: Pick<Flight, "flightNumber">): string;
export function searchFlights(query: FlightInput): SearchResults;          // cached, deterministic
export function findOption(query: FlightInput, key: string): FlightOption | null;
export function dayOverview(query: FlightInput, date: string): DayOverview;
```

As implemented (`shared/src/search.ts` + `routeDay` / `buildScheduledFlight` in `fakeFlight.ts`):

1. **Timetable** per route and IATA season (seed `sched|ROUTE|SEASON`; summer from the last Sunday of
   March, winter from the last Sunday of October): busy markets (a candidate carrier has a hub at both
   ends) 8–14 flights, ordinary 4–8, long-haul (oceanic, international > 2,600 mi, domestic > 3,000 mi)
   2–5; carriers from `candidateAirlines` (hub carriers fly several frequencies; carriers without a
   wide-body are left out where the route needs one); flight numbers unique per day, never retired,
   even eastbound / odd westbound; departures 05:30–23:30 local (long-haul from 06:00) on a 5-minute
   grid, ≥ 15 min apart, same carrier ≥ 45 min, ≥ 30 min across an air-block edge. Like a real
   timetable it repeats: the same flight number leaves at the same time every day of the season.
2. **The day** (seed `sched|ROUTE|DATE`): the frequencies flying that weekday (a few skip Saturdays),
   ~8% equipment swaps, every arrival re-checked against that date's time zones and curfews.
3. **Shared facts**: one airborne time per day (= A/B's), the A/B route history (route + month), weather
   per airport + date + clock hour (A/B's model), and one bump draw per 2-hour air block on odd hours
   (`air|ROUTE|DATE|HH:MM`) — the same body type gets the identical timeline, a wide-body never a
   bumpier one; blocks differ through the time-of-day model, so the history's best window holds.
4. **Fares** (`fare|ROUTE|DATE|KEY`): distance, oceanic, region, carrier tier (`fareTier` in
   airlines.ts), weekday, departure hour, ±10% jitter; whole dollars ≥ $39; never look at turbulence
   (within-day correlation with the score ≈ 0).
5. **Determinism and A/B safety**: `check-search.ts` holds a permanent hash guard over 329
   `generateFlight` outputs — a deliberate A/B change must update it. C flight ids are
   `hashId("c|ORIGIN|DEST|DATE|KEY")`. Cached results are frozen: copy before sorting.
6. **Speed**: a cold day ~3–6 ms, a cold 7-day overview ~9–13 ms, cache hits ~2 µs.

## Frontend layout (ownership)

| Owner | Files |
| --- | --- |
| Lead (done first; ask for changes in your report) | `docs/VERSION_C.md`, `frontend/lib/c/model.ts` (types, URL helpers, parsing), `frontend/lib/c/compare-store.ts` (`useCompareList()`), `frontend/lib/c/format.ts`, `frontend/components/c/common/{AirlineMark,ScoreBadge,Sparkline}.tsx` (starter versions) |
| Generator | `shared/src/search.ts` (internals), `shared/src/fakeFlight.ts` (new exported entry points only — A/B output unchanged), `shared/src/airlines.ts` (optional fare tier data), `shared/scripts/check-search.ts` |
| Search UI | `frontend/app/c/layout.tsx`, `frontend/app/c/page.tsx`, `frontend/app/c/search/page.tsx`, `frontend/components/c/shell/*` (header, footer, compare tray), `frontend/components/c/search/*`, and polishing `frontend/components/c/common/*` |
| Flight + compare UI | `frontend/app/c/flight/page.tsx`, `frontend/app/c/compare/page.tsx`, `frontend/components/c/flight/*`, `frontend/components/c/compare/*` |

Everything outside these files is read-only for version C work (A/B code, `components/dashboard/*`,
`components/ui/*`, `lib/hooks.ts`, `lib/tracking.ts`, configs). Reuse dashboard components by importing
them; if one needs a change, ask in your report.

## Rules (in addition to docs/ARCHITECTURE.md)

- Next 16 + Cache Components: no clock/randomness during render; no route segment config; pages are
  server components that render client components; **C client components read the query with
  `useSearchParams()` inside a page-level `<Suspense fallback={…skeleton…}>`** — not `useQueryParam`,
  which doesn't see client-side navigations. Navigate with `<Link>` / `router.push` / `router.replace`.
- React Compiler lint rules (no setState in effects, no ref reads in render, pure render).
- Generate data with `useMemo` from the query (deterministic and cached); never in effects.
- Design system: calm palette (never red/orange/amber; `sand` for gentle caution), Manrope, cards
  `rounded-3xl`, pills, 44 px targets, `tabular-nums` for numbers and prices, reduced motion respected.
- Laptop layout: content max-width ~1120 px with 24–32 px gutters; phone: 16–20 px gutters, no page-level
  horizontal scroll at 340 px.
- Accessibility: real buttons/links, visible focus, labelled form controls, `aria-pressed` on toggles,
  sheets modal (focus trap + Escape), charts with a text alternative, live region for result counts.
- Copy: plain, calm, sentence case. "Illustrative" where numbers might be taken as real. No "book",
  "deal", "hurry", "only n left", "safest", "danger", "risk".
