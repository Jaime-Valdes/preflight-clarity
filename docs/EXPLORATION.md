# Free exploration — design contract

Feedback from the team after testing: once participants reach the dashboard there is
"not much exploring to do — pick one flight, browse, tap done". This document specifies the
richer exploring phase. Decisions already made with the team (2026-10-14):

- **Variant A only.** Variant B stays exactly as the brief defines it (summary card + turbulence
  timeline, one flight), so A-vs-B still tests "full dashboard vs minimal".
- **The post-survey refers to the first flight the participant set up** ("your flight"). Other
  flights are "options they explored". A small reminder chip on the post-survey ratings screen
  names that flight — in **both** arms, on purpose, so the post-survey instrument is identical
  across A and B (B sessions saved before 2026-10-14 had no chip).
- **Forecast alerts are about the participant's own flight.** There is one alert setting
  (`dashboard.alert`); on an explored option the switch shows it but can't change it.
- **One optional post-survey question is added**: "If you could, would you switch to one of the
  other flights you looked at?" — Yes / No / Not sure / I didn't look at other flights.

Research framing: everything here is the brief's **control** dimension ("comparing flights,
choosing a smoother time"). Nothing may nudge: no "better choice" language, no praise for
switching; "I'd prefer this one" is recorded, never acted on.

## What the participant can do (variant A)

1. **Flight strip** at the top of the dashboard (below the preview banner, above the header): one chip
   per explored flight — `LAX → JFK · Oct 31 · 87` — the active chip highlighted, the first one
   labelled "Your flight". Tapping switches the whole dashboard to that flight (header, summary,
   sections). Each flight keeps its own open/closed sections (also across a reload) and what its
   sections hold (held options and expanded rows, the chosen seat, the alert options). Switching
   scrolls to the top.
   A trailing **"+ Another flight"** chip opens the what-if sheet. When ≥ 2 flights exist a
   **"Compare"** chip appears.
2. **What-if sheet** ("Try a different flight") with four calm options, each generating a new
   deterministic flight and adding it to the strip (max 6 flights; then the add chip says "Up to 6"):
   - *Same route, another day* — date picker (today … today + 365).
   - *A different time of day* — Morning (06–11) / Afternoon (11–17) / Evening (17–23) departure.
   - *A larger plane* — a wide-body option on the same route and day, where plausible.
   - *A different route* — origin / destination / date fields (reuse the setup fields).

   A choice that gives back the flight on screen (e.g. *A different route* left as prefilled) says
   "That’s the flight on screen now — …" and keeps "Show this flight" off; one that gives a flight
   already in the strip switches to it instead of adding it.
3. **Alternatives become real flights.** In "Compare smoother options" every alternative gets an
   **"Open this flight"** button that adds it to the strip and switches to it. The alternative's
   summary row (score, times, aircraft) is exactly what its full dashboard shows. With 6 flights in
   the strip, "Open this flight" is disabled for an alternative that isn't one of them, with a quiet
   "You can look at up to 6 flights."; one already in the strip still opens (switches to it).
   After "Open this flight" or a what-if, focus moves to the new flight's strip chip and a polite
   status line says "Showing Option 2: …" (a chip tap keeps focus on the chip).
4. **Compare view** (full-screen sheet over the dashboard): pick any two explored flights (defaults:
   "your flight" vs the most recently added). Side by side: smoothness rings, the two turbulence
   timelines overlaid on one chart (x = minutes after takeoff), bumpy minutes and max intensity,
   aircraft + body type, airline on-time %, departure/arrival times, duration, days away, forecast
   confidence. Two neutral **"I'd prefer this one"** buttons (toggle; recorded only; copy says
   "Noted — nothing is booked"). "Back to the dashboard" closes it.
5. **"I'm done exploring"** stays as the single exit, on whichever flight is active. A sheet's footer
   button sits in the same spot, so a tap on it within 600 ms of a sheet closing is ignored (the
   tail of a double tap), never the end of the dashboard.
6. **Forecast alerts** follow the participant's own flight: on an option the switch is shown,
   disabled, in its current state, with "Alerts are set on your own flight."

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
  flightMs: Record<string, number>;       // visible time per flight id (no overlay open)
  compares: number;                       // times the compare view was opened
  compareMs: number;                      // visible time in the compare view
  comparePairs: string[];                 // "idA|idB" per open plus each pair change, in order (≤ 50)
  whatIfMs?: number;                      // visible time in the what-if sheet (absent → 0 in older records)
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

Tracker events (type · section · detail):

- `flight_added · — · "<addedVia>:<id>"` — added to the strip (always followed by its `flight_shown`).
- `flight_switched · — · "<id>"` — a strip chip tap showed that flight (counted in `switches`).
- `flight_shown · — · "<id>"` — the dashboard showed that flight after "Open this flight" or a
  what-if (not a switch). Every change of the flight on screen logs exactly one of these two.
- `section_open` / `section_close · <section> · "switch"` — a section came into or went out of view
  because the flight changed (each flight keeps its own open sections). Not counted in `opens`.
  Logged in screen order: the leaving flight's closes, then `flight_switched`/`flight_shown`, then
  the arriving flight's opens.
- `compare_open · compare · "<idA>|<idB>"` (counted in `compares`), `compare_pair · compare ·
  "<idA>|<idB>"` (another pair while open), `compare_close · compare` (detail `"reload"` when a
  reload ended it).
- `whatif_opened`, `whatif_close` (detail `"reload"` when a reload ended it).
- `flight_preferred · compare · "<id>"` (`"none"` when cleared).
- `alternative_opened · compare · "<alt id>:<flight id>:<added|existing>"` — logged after the
  outcome, only when a flight was added or shown; `count(…:added) == alternativesOpened`.

`flight_added`, `flight_switched`, `flight_shown`, `compare_open/close` and `whatif_opened/close`
are lifecycle events: once the log is full they evict detail events, like section opens/closes.

## Generator contract (shared/src/fakeFlight.ts)

```ts
export function generateFlight(input: FlightInput, prefs?: FlightPrefs): Flight;
```

- Seed = `${origin}|${destination}|${date}` plus a stable suffix for non-empty prefs
  (e.g. `|w=morning|b=wide|a=DL`). Same input + prefs → the same flight, always. (Reference
  flights regenerated differently after the QA pass of 2026-10-14; only test sessions existed then.)
- **Shared facts stay shared**, so flights shown side by side never contradict each other:
  - Route history (% smooth, typical bumpy phase, flights analysed, best window) is one per
    route + month — every flight on that route and month shows the same history, whatever the day
    or prefs.
  - Weather is one per airport + date + clock hour.
  - Same-day options take the reference flight's airborne time. Options leaving within 60 min of
    the same-day reference share its bump draw; a wide-body feels it a little less (never bumpier).
  - Reasons credit the time of day only when departures are more than 60 min apart, and say
    "at a similar time" only within 60 min.
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
- `AlternativeFlight.id` is the id of the flight it opens (`generateFlight(input, prefs).id`), so
  `alternative_viewed` / `alternative_hold` / `alternative_opened` and `flight_added` share ids.
- `shared/scripts/check-fake-flight.ts` adds: prefs determinism, departure-window causality over
  many seeds (mean morning score ≥ mean afternoon score in summer months), wide-body honoured,
  alternative rows equal their full flights, no recursion blow-up, and the shared-facts rules above
  (history, weather, shared air, reason wording, alternative ids).

## Tracker contract (frontend/lib/tracking.ts)

```ts
new DashboardTracker(sectionOrder, initialMetrics, exploration?: { reference: ExploredFlight })
tracker.addFlight(f: ExploredFlight): void          // records flight_added
tracker.setActiveFlight(id: string, viaUser: boolean): void   // flight_switched (+1 switch) or flight_shown
tracker.setSectionOpen(id, open, viaSwitch?: boolean): void   // viaSwitch: logged with detail "switch", no open counted
tracker.compareOpened(idA: string, idB: string): void         // first call opens; while open, a pair change
tracker.compareClosed(): void
tracker.whatIfOpened(): void                         // the what-if sheet is up
tracker.whatIfClosed(): void
tracker.preferFlight(id: string | null): void
tracker.explorationState(): ExplorationMetrics | null  // for restoring UI after a reload
tracker.openSectionsByFlight(): Record<string, SectionId[]>  // open sections per flight, rebuilt from the log
```

Visible time goes to exactly one place, under the same visibility rules as sections: the compare
view (`compareMs`), else the what-if sheet (`whatIfMs`), else the flight on screen (`flightMs`) and
its open sections (`openMs`). So section time and flight time **pause while either overlay is
open**, and `sum(flightMs) + compareMs + whatIfMs ≈ activeMs`. Switching flights is not opening:
`opens` and `firstOpenAtMs` count only the participant's own taps, and
`count(section_open without detail "switch") == opens`. On resume, an overlay that was open at the
checkpoint gets its close logged (detail `"reload"`); the sheet itself starts closed.
`snapshot()`/`finish()` include `exploration` (`finish()` closes an open overlay).

## UI contract (frontend/components/dashboard/)

- `Dashboard.tsx`: for variant A, owns `explored: ExploredFlight[]`, the active id, section state
  per flight, the what-if sheet and the compare view; regenerates `Flight` objects with
  `generateFlight(f.input, f.prefs)` (memoized by id). Provides `ExploreContext`
  (`components/dashboard/explore/context.ts`):
  - `openAlternative(alt)`, `canOpen(alt)` (false only when the strip is full and the alternative
    isn't in it), `openWhatIf()`, `switchTo(id)`, `compare()`;
  - `showingOwnFlight` — true when the flight on screen is the participant's own (set-up) flight.
    Section bodies use it so that "your flight" always means that flight (an option is "this
    flight"), and the alerts switch can only be changed then;
  - `flightState(key)` / `setFlightState(key, value)` — per-flight memory for section bodies, used
    through `useFlightState(key, initial)` (a `useState` that, in variant A, belongs to the flight
    on screen and survives switching away and back; plain local state without the context).

  A flight shown by anything but its chip moves focus to that chip after the commit; switching
  replays the sections' visibility to the tracker with `viaSwitch`. Variant B: unchanged.
- New: `explore/FlightStrip.tsx`, `explore/WhatIfSheet.tsx`, `explore/CompareView.tsx`,
  `explore/CompareChart.tsx` (two series overlaid, calm + breeze colours).
- `CompareSection.tsx`: "Open this flight" per alternative (`useExplore()?.openAlternative(alt)`), shown only when the context exists (variant A).
- `AlertsSection.tsx`: on an option (`showingOwnFlight === false`) the switch is disabled in its
  current state with "Alerts are set on your own flight.", so every `alert_toggle` is about the
  participant's own flight.
- `DashboardHeader.tsx`: a small "Your flight" / "Option 2" label.
- Resume after reload: the flow passes `initialMetrics`; the dashboard rebuilds the strip from
  `initialMetrics.exploration.flights`, reactivates `endedOnFlightId`/the last active id and
  restores every flight's open sections (`tracker.openSectionsByFlight()`). Held options and the
  chosen seat are not restored.

## Flow contract (frontend/components/flow/)

- Post-survey ratings screen: a neutral chip "Your flight · LAX → JFK · Sat, Oct 31" above the
  questions; wording of the three questions unchanged. Shown in **both** variants on purpose, so the
  post-survey is the same instrument in A and B (only B sessions saved before 2026-10-14 lack it).
- Post-survey habits screen (variant A only): "If you could, would you switch to one of the other
  flights you looked at?" — Yes / No / Not sure / I didn't look at other flights (optional).
  Variant B stores `null`.
- Saves unchanged; the record's `dashboard.exploration` comes from the tracker.

## Backend, stats, CSV, results

- `parseSessionRecord` validates the new optional fields (unknown → null/[]), including
  `exploration.flights[*]` shapes and the `wouldSwitch` enum; `exploration.whatIfMs` → 0 when absent.
- `stats.ts`: flights explored (mean, median, % who added ≥ 1), % who opened compare, % with a
  preferred flight ≠ reference, median time per flight, `wouldSwitch` distribution — overall and
  for variant A.
- `csv.ts`: `flights_explored`, `switches`, `compares`, `alternatives_opened`, `what_ifs`,
  `what_if_s` (seconds in the what-if sheet), `preferred_flight`, `ended_on_flight`, `would_switch` columns.
- `/results`: an "Exploring" block with those numbers (variant A), honest wording.

## Implementation notes (contract as landed)

- The new fields are **optional** in `shared/src/types.ts` so old records and code keep compiling:
  `DashboardMetrics.exploration?`, `PostSurvey.wouldSwitch?`, `AlternativeFlight.input?/prefs?`,
  `Flight.prefs?`. The generator must always fill `Flight.prefs` and every alternative's `input`/`prefs`.
- The tracker API is in place in `frontend/lib/tracking.ts`:
  `new DashboardTracker(order, initialMetrics, { reference })`, `explorationState()`, `activeFlight()`,
  `addFlight(f) → boolean` (false if duplicate or 6 already), `setActiveFlight(id, viaUser)`,
  `setSectionOpen(id, open, viaSwitch?)`, `compareOpened(a, b)`, `compareClosed()`, `whatIfOpened()`,
  `whatIfClosed()`, `preferFlight(id | null)`, `openSectionsByFlight()`; `MAX_EXPLORED_FLIGHTS = 6`.
  `addFlight` counts alternativesOpened / whatIfs from `addedVia`.
- Records saved before the QA fixes of 2026-10-14 (test sessions only) differ: switch-driven section
  events had no `"switch"` detail and counted as opens, section and flight time kept running under
  the compare view and the what-if sheet (no `whatIfMs`), pair changes were logged as `compare_open`,
  non-chip activations logged no flight event, and `alternative_opened` was logged before the
  outcome with the alternative's id only.

## Participant label (`?p=`)

`SessionRecord.participant?: string` — set from `?p=<label>` on the study link (trimmed, ≤ 40 chars,
letters/digits/space/`-_.@` only; "" if absent), so the team can send a specific version to a specific
person (`/?v=A&p=sarah`) and find that session later. Shown in the results table and CSV; validated in
`parseSessionRecord` (old records → "").
