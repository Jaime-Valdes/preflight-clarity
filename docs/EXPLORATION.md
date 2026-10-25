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
  other flights you looked at?" — Yes / No / Not sure / I didn't look at other flights. (Asked until
  2026-10-24; replaced by the booking question, `post.bookLikelihood`, in both variants. The
  `wouldSwitch` field stays in the record for the sessions that answered it.)

Research framing: everything here is the brief's **control** dimension ("comparing flights,
choosing a smoother time"). Nothing may nudge: no "better choice" language, no praise for
switching; "I'd prefer this one" is recorded, never acted on.

## What the participant can do (variant A)

1. **Flight strip** at the top of the dashboard (below the preview banner, above the header): one chip
   per explored flight — `LAX → JFK · Oct 31 · 87` — the active chip highlighted, the first one
   labelled "Example flight" (the study never asks which flight the participant is on — docs/FEASIBILITY.md). Tapping switches the whole dashboard to that flight (header, summary,
   sections). Each flight keeps its own open/closed sections (also across a reload) and what its
   sections hold (held options and expanded rows, the chosen seat, the alert options). Switching
   scrolls to the top.
   A trailing **"+ Another flight"** chip opens the what-if sheet. When ≥ 2 flights exist a
   **"Compare"** chip appears.
2. **What-if sheet** ("Try a different flight") with four calm options, each generating a new
   deterministic flight and adding it to the strip (max 6 flights; then the add chip says "Up to 6"):
   - *Same route, another day* — date picker (today … today + 330, when schedules are published).
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
- `DashboardHeader.tsx`: a small "Example flight" / "Option 2" label.
- Resume after reload: the flow passes `initialMetrics`; the dashboard rebuilds the strip from
  `initialMetrics.exploration.flights`, reactivates `endedOnFlightId`/the last active id and
  restores every flight's open sections (`tracker.openSectionsByFlight()`). Held options and the
  chosen seat are not restored.

### Polish of 2026-10-24 (both variants unless noted)

- **Section order**: `shared/src/sections.ts` — Turbulence, Aircraft, Best seat, Airline safety &
  comfort, then Who flies your plane, Weather, Sounds, Compare, Alerts (B: turbulence only). The
  dashboard renders `VARIANT_SECTIONS[variant]`; each record keeps the order it showed.
- **Laptop layout**: `Screen` has a `wide` prop (the column widens to ~1000 px from `lg`, 1024 px,
  and starts a little higher; the footer's content stays centred at the phone width). Inside it the
  dashboard is two columns from `lg` (`LAYOUT` in `Dashboard.tsx`): left, sticky — the preview
  banner, the flight strip, the header and the summary card; right — the sections (the intro line
  is phone-only there), the sign-up card and the prototype footnote. The left column is padded by
  the page gutter and pulled left by as much, so the strip's edge-to-edge scroller and the header's
  notches stay inside it. It is sized to the space above the done footer (`100dvh − 7rem −
  var(--page-top)`; a page with a bar above the dashboard, like `/preview`, sets `--page-top` to
  the bar's height) and scrolls on its own if it is taller; while the score factors are open it
  stops sticking (`lg:static`) and the page scrolls instead, so the factor list is never clipped.
  The section list is tighter on laptops (`LAYOUT.list`: no top margin, 6 px gap, collapsed headers
  at `py-2.5` through an arbitrary variant — `SectionCard`'s own padding is phone-first and shared
  with version C), so variant A's nine headers and the factors toggle fit above the footer from
  1024×768 and 1366×768 up. Phones are unchanged; the skeleton and `/preview` use the same layout;
  the sheets (what-if, compare, sign-up) stay a centred 440 px column.
- **"What goes into this score"** (`SummaryCard`, `showFactors`): a disclosure whose toggle sits in
  the score row's text block (under "Higher is smoother", so it costs no height and is in view on a
  laptop before the column would need scrolling) and whose list opens under the row, collapsed by
  default, listing the factors the illustrative model uses — route history for the month, expected
  bumpy stretches, aircraft size, time of day, weather at both ends, forecast confidence — each
  with a calm up / down / neutral marker (`summary/scoreFactors.ts`, pure) and a 13 px explanation.
  Honest wording: it describes the model, nothing more. Every open logs `score_factors_open` in the
  tracker and in PostHog (`{ variant }`); `/preview` registers `is_test: true` (and the variant)
  first, so team demos fall out of the study's filters. Version C's flight page keeps the plain card
  (prop off).
- **Analytics**: `track("dashboard_section_open", { section, variant })` from the participant's own
  toggle only — never from a flight switch or a reload restore, which go through `viaSwitch`.
- **Sign-up card**: `DashboardProps.signup?: { signedUp, onSubmit }`. When present (the study;
  `/preview` passes none) the dashboard renders version C's `InterestCard` after the last section,
  before the "I'm done exploring" footer, with placement `"dashboard"` and the same copy in A and B
  (docs/INTEREST.md). The card and sheet are generalized with a `study` prop: the sheet validates and
  hands `{ email, firstName, interview }` to `onSubmit` (the flow saves it to the record and the
  sign-ups list, marks `pfc.interest.v1` and tracks `interest_signup`); the card tracks
  `interest_cta_view { source: "study", placement: "dashboard" }` once per mount, only while the form
  is offered and with the debrief card's definition of a view (40 % of the card on screen, so the
  two placements compare; version C keeps counting from the first pixel), and shows "You're on the
  list." when `signedUp` or after its own submit. The debrief then shows the done state instead of
  the form. The sheet's Done button sits where "I'm done exploring" is on a phone, so the card
  reports every close through `StudySignup.onSheetClose` and the dashboard applies the same
  `OVERLAY_SETTLE_MS` double-tap guard it uses for the what-if and compare sheets. The tracker and
  the record are unchanged.

## Flow contract (frontend/components/flow/)

- Post-survey ratings screen: a neutral chip "Your flight · LAX → JFK · Sat, Oct 31" above the
  questions; wording of the three questions unchanged. Shown in **both** variants on purpose, so the
  post-survey is the same instrument in A and B (only B sessions saved before 2026-10-14 lack it).
- Post-survey habits screen (variant A only, until 2026-10-24): "If you could, would you switch to
  one of the other flights you looked at?" — Yes / No / Not sure / I didn't look at other flights
  (optional). Variant B stored `null`. No longer asked; old sessions keep their answer.
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
