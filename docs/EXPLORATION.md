# Free exploration — design contract

Feedback from the team after testing: once participants reach the dashboard there is
"not much exploring to do — pick one flight, browse, tap done". This document specifies the
richer exploring phase. Decisions already made with the team (2026-10-14):

- **Variant A only.** Variant B stays exactly as the brief defines it (summary card + turbulence
  timeline, one flight), so A-vs-B still tests "full dashboard vs minimal".
- **The post-survey refers to the first flight the participant set up** ("your flight"). Other
  flights are "options they explored". A small reminder chip on the post-survey ratings screen
  names that flight.
- **One optional post-survey question is added**: "If you could, would you switch to one of the
  other flights you looked at?" — Yes / No / Not sure / I didn't look at other flights.

Research framing: everything here is the brief's **control** dimension ("comparing flights,
choosing a smoother time"). Nothing may nudge: no "better choice" language, no praise for
switching; "I'd prefer this one" is recorded, never acted on.

## What the participant can do (variant A)

1. **Flight strip** at the top of the dashboard (below the preview banner, above the header): one chip
   per explored flight — `LAX → JFK · Oct 31 · 87` — the active chip highlighted, the first one
   labelled "Your flight". Tapping switches the whole dashboard to that flight (header, summary,
   sections). Each flight keeps its own open/closed section state. Switching scrolls to the top.
   A trailing **"+ Another flight"** chip opens the what-if sheet. When ≥ 2 flights exist a
   **"Compare"** chip appears.
2. **What-if sheet** ("Try a different flight") with four calm options, each generating a new
   deterministic flight and adding it to the strip (max 6 flights; then the add chip says "Up to 6"):
   - *Same route, another day* — date picker (today … today + 365).
   - *A different time of day* — Morning (06–11) / Afternoon (11–17) / Evening (17–23) departure.
   - *A larger plane* — a wide-body option on the same route and day, where plausible.
   - *A different route* — origin / destination / date fields (reuse the setup fields).
3. **Alternatives become real flights.** In "Compare smoother options" every alternative gets an
   **"Open this flight"** button that adds it to the strip and switches to it. The alternative's
   summary row (score, times, aircraft) is exactly what its full dashboard shows.
4. **Compare view** (full-screen sheet over the dashboard): pick any two explored flights (defaults:
   "your flight" vs the most recently added). Side by side: smoothness rings, the two turbulence
   timelines overlaid on one chart (x = minutes after takeoff), bumpy minutes and max intensity,
   aircraft + body type, airline on-time %, departure/arrival times, duration, days away, forecast
   confidence. Two neutral **"I'd prefer this one"** buttons (toggle; recorded only; copy says
   "Noted — nothing is booked"). "Back to the dashboard" closes it.
5. **"I'm done exploring"** stays as the single exit, on whichever flight is active.

Tone and layout follow the design system (calm, soft, never red, mobile-first, 44 px targets).

## Data model (additions — all backward compatible)

```ts
// shared/src/types.ts
export type DepartWindow = "morning" | "afternoon" | "evening";

/** Knobs the participant can turn. Part of the seed, so the same prefs always give the same flight. */
export interface FlightPrefs {
  departWindow?: DepartWindow;
  bodyType?: "wide";        // ask for a wide-body
  airline?: string;         // IATA code, used when opening an alternative
}

export type AddedVia = "setup" | "alternative" | "whatif_day" | "whatif_time" | "whatif_wide" | "whatif_route";

export interface ExploredFlight {
  id: string;               // Flight.id
  input: FlightInput;
  prefs: FlightPrefs;       // {} for the reference flight
  summary: FlightSummary;
  addedVia: AddedVia;
  addedAtMs: number;        // ms after the dashboard started
}

export interface ExplorationMetrics {
  flights: ExploredFlight[];              // first = the reference flight
  switches: number;                       // chip taps that changed the active flight
  flightMs: Record<string, number>;       // visible time per flight id
  compares: number;                       // times the compare view was opened
  compareMs: number;                      // visible time in the compare view
  comparePairs: string[];                 // "idA|idB" per open, in order
  alternativesOpened: number;
  whatIfs: number;
  endedOnFlightId: string;                // active flight when "done" was tapped
  preferredFlightId: string | null;       // last "I'd prefer this one" (null if none)
}

// DashboardMetrics gains:  exploration: ExplorationMetrics | null   (null in variant B)
// AlternativeFlight gains: input: FlightInput; prefs: FlightPrefs   (what opens it as a full flight)
// Flight gains:            prefs: FlightPrefs                        (what produced it)
// PostSurvey gains:        wouldSwitch: "yes" | "no" | "not_sure" | "didnt_look" | null
// SessionRecord: flightInput / flight stay the REFERENCE flight (unchanged meaning).
```

Tracker events (type · section · detail): `flight_added · undefined · "<addedVia>:<id>"`,
`flight_switched · undefined · "<id>"`, `compare_open · compare · "<idA>|<idB>"`, `compare_close`,
`flight_preferred · compare · "<id>"`, `alternative_opened · compare · "<alt id>"`, `whatif_opened`.

## Generator contract (shared/src/fakeFlight.ts)

```ts
export function generateFlight(input: FlightInput, prefs?: FlightPrefs): Flight;
```

- Seed = `${origin}|${destination}|${date}` plus a stable suffix for non-empty prefs
  (e.g. `|w=morning|b=wide|a=DL`), so `generateFlight(input)` is unchanged for existing sessions.
- `departWindow` constrains the departure time to that window. **Causality must be real**: morning
  departures get a lower chance of convective ("afternoon heating") windows and a slightly higher
  base smoothness; evening flights the reverse in summer; the `history.bestDepartureWindow` sentence
  must agree with how the generator actually behaves. `bodyType: "wide"` picks a wide-body model
  (from the airline's fleet, else another plausible carrier with one) — wide-bodies feel bumps less,
  so their series gets a small attenuation. `airline` fixes the carrier.
- Alternatives are generated **as full flights** with their own prefs/inputs (same day other
  window, day before/after, wide-body, another carrier), then summarized — so opening one shows
  exactly the numbers the row promised. Generate 4–5 candidates and keep the 2–3 with the highest
  scores, sorted desc; honest deltas (can be ≤ 0). Alternatives of an alternative are not
  generated recursively beyond one level (internal flag).
- `AlternativeFlight.reason` is derived from its prefs ("Morning departure — before afternoon
  heating builds clouds.", "Wide-body jet — larger planes feel bumps less.", "Leaves the day
  before — a calmer pattern is expected.").
- `shared/scripts/check-fake-flight.ts` adds: prefs determinism, departure-window causality over
  many seeds (mean morning score ≥ mean afternoon score in summer months), wide-body honoured,
  alternative rows equal their full flights, no recursion blow-up.

## Tracker contract (frontend/lib/tracking.ts)

```ts
new DashboardTracker(sectionOrder, initialMetrics, exploration?: { reference: ExploredFlight })
tracker.addFlight(f: ExploredFlight): void          // records flight_added
tracker.setActiveFlight(id: string, viaUser: boolean): void   // accrues flightMs; counts switches when viaUser
tracker.compareOpened(idA: string, idB: string): void
tracker.compareClosed(): void
tracker.preferFlight(id: string | null): void
tracker.explorationState(): ExplorationMetrics | null  // for restoring UI after a reload
```

Visible-time accrual for the active flight and the compare view follows the same
visibility rules as sections. `snapshot()`/`finish()` include `exploration`.

## UI contract (frontend/components/dashboard/)

- `Dashboard.tsx`: for variant A, owns `explored: ExploredFlight[]`, the active id, section state
  per flight, the what-if sheet and the compare view; regenerates `Flight` objects with
  `generateFlight(f.input, f.prefs)` (memoized by id). Provides `ExploreContext`
  (`components/dashboard/explore/context.ts`): `{ openAlternative(alt), openWhatIf(), switchTo(id), compare() }`.
  Variant B: unchanged.
- New: `explore/FlightStrip.tsx`, `explore/WhatIfSheet.tsx`, `explore/CompareView.tsx`,
  `explore/CompareChart.tsx` (two series overlaid, calm + breeze colours).
- `CompareSection.tsx`: "Open this flight" per alternative (`useExplore()?.openAlternative(alt)`), shown only when the context exists (variant A).
- `DashboardHeader.tsx`: a small "Your flight" / "Option 2" label.
- Resume after reload: the flow passes `initialMetrics`; the dashboard rebuilds the strip from
  `initialMetrics.exploration.flights` and reactivates `endedOnFlightId`/the last active id.

## Flow contract (frontend/components/flow/)

- Post-survey ratings screen: a neutral chip "Your flight · LAX → JFK · Sat, Oct 31" above the
  questions; wording of the three questions unchanged.
- Post-survey habits screen (variant A only): "If you could, would you switch to one of the other
  flights you looked at?" — Yes / No / Not sure / I didn't look at other flights (optional).
  Variant B stores `null`.
- Saves unchanged; the record's `dashboard.exploration` comes from the tracker.

## Backend, stats, CSV, results

- `parseSessionRecord` validates the new optional fields (unknown → null/[]), including
  `exploration.flights[*]` shapes and the `wouldSwitch` enum.
- `stats.ts`: flights explored (mean, median, % who added ≥ 1), % who opened compare, % with a
  preferred flight ≠ reference, median time per flight, `wouldSwitch` distribution — overall and
  for variant A.
- `csv.ts`: `flights_explored`, `switches`, `compares`, `alternatives_opened`, `what_ifs`,
  `preferred_flight`, `ended_on_flight`, `would_switch` columns.
- `/results`: an "Exploring" block with those numbers (variant A), honest wording.

## Implementation notes (contract as landed)

- The new fields are **optional** in `shared/src/types.ts` so old records and code keep compiling:
  `DashboardMetrics.exploration?`, `PostSurvey.wouldSwitch?`, `AlternativeFlight.input?/prefs?`,
  `Flight.prefs?`. The generator must always fill `Flight.prefs` and every alternative's `input`/`prefs`.
- The tracker API is in place in `frontend/lib/tracking.ts`:
  `new DashboardTracker(order, initialMetrics, { reference })`, `explorationState()`, `activeFlight()`,
  `addFlight(f) → boolean` (false if duplicate or 6 already), `setActiveFlight(id, viaUser)`,
  `compareOpened(a, b)`, `compareClosed()`, `preferFlight(id | null)`; `MAX_EXPLORED_FLIGHTS = 6`.
  `addFlight` counts alternativesOpened / whatIfs from `addedVia`.

## Participant label (`?p=`)

`SessionRecord.participant?: string` — set from `?p=<label>` on the study link (trimmed, ≤ 40 chars,
letters/digits/space/`-_.@` only; "" if absent), so the team can send a specific version to a specific
person (`/?v=A&p=sarah`) and find that session later. Shown in the results table and CSV; validated in
`parseSessionRecord` (old records → "").
