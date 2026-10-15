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
  (e.g. on-time %, captain's hours on type); fare. Actions: **Compare** (toggle, max 3) and **Details**
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
  **Aircraft** (model, body type, age, seat layout), **Airline** (on-time %, safety notes as the
  AirlineSection shows them), **Crew** (captain/first officer hours), **Weather** (departure/arrival
  condition + temperature), **Best seat** (the seat map's recommended zone/seat).
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

The first version is a stand-in built on `generateFlight` so the UI can start; the generator replaces
the internals with a **coherent day schedule** (exports unchanged):

1. **Schedule** per route + date (seed `sched|ORIGIN|DEST|DATE`): busy markets (hub/popular pairs) 8–14
   flights, ordinary ones 4–8, long-haul/oceanic 2–5; carriers from `candidateAirlines` (hub carriers can
   run several frequencies); flight numbers unique within the day and never retired numbers; departure
   times spread over the operating day (5-minute grid, same-carrier departures ≥ 45 min apart, long-haul
   timed with the existing overnight/arrival rules); aircraft from each carrier's fleet for the distance.
2. **Shared facts, so side-by-side flights never contradict each other**: one airborne time for the day
   (block time may differ a few minutes by aircraft); route history = the A/B one (route + month);
   weather per airport + date + clock hour (as A/B); **turbulence by air block** — flights in the same
   2-hour block share one bump draw (identical series for the same body type; a wide-body is attenuated,
   never bumpier), and blocks differ through the existing time-of-day model so the history's "best
   departure window" sentence stays true. The schedule never puts two departures < 30 min apart across a
   block boundary.
3. **Fares**: by distance, carrier (low-cost carriers lower, premium long-haul carriers higher), weekday,
   departure time (early/late a little lower, peaks a little higher), ±10% seeded jitter; ≥ $39; never
   correlated with the smoothness score by construction; independent of "today".
4. **Determinism and A/B safety**: `generateFlight` output for A/B must stay byte-identical (snapshot-
   hash several hundred inputs before and after). C flight ids are unique (`hashId("c|…")`).
5. **Speed**: one day (≤ 14 flights, no alternatives) ≤ 15 ms cold on a laptop; 7-day overview ≤ 100 ms
   cold; results cached (bounded LRU).
6. `shared/scripts/check-search.ts` (run by `npm run test -w shared`) checks all of the above.

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
