# Iteration 2 — version D, the smooth-flight finder (`/d`)

Built 2026-10-28 from the Sprint 2 findings (15 study sessions, ~12 version C visitors, 7 interviews).
Version C (`/c`) and the A/B study (`/`) are unchanged, so the Sprint 2 data stays comparable; D is a
new version in the same app that reuses C's shell, search, compare list and sign-up.

## What we learned, and what each change answers

| Finding | What changed in D |
| --- | --- |
| More information did not lower anxiety (the full briefing −0.4 vs the minimal one −0.8), even though it raised predictability. Reassurance calmed people; prediction didn't. | The flight page leads with four reassurance cards in plain words — who flies the plane, the aircraft explained, the best seat, the airline's record against the industry average — and puts every detail section (turbulence, weather, sounds…) under "More detail", collapsed. |
| Any score below 100 reads as unsafe ("Why is it only a 93?"); plain words calmed people more than the number. | No 0–100 score anywhere above the detail layer. Each flight carries plain-language ratings — Very smooth / Smooth / Moderate / Slightly bumpy / Bumpy for cruise and for takeoff & landing; Large / Mid-size / Smaller jet; Roomy and quiet / Typical cabin / Fuller and livelier — each with a one-line "what this means for you". The numbers and "how this is worked out" are one tap away in a sheet. |
| Knowing WHEN turbulence will hit creates dread; people don't want the timeline by default. | The timeline lives inside the collapsed Turbulence section only. The cruise rating says what to expect without a clock. |
| People care about different things (turbulence, takeoff/landing, aircraft size, crowding/noise); one person would take a lower overall score for a smoother takeoff and landing. | "What matters to you" before the results: the four categories tapped in order of importance (skippable, remembered per browser). The ratings on every card follow that order, and the default sort "For you" weighs them 4/3/2/1. |
| The decision happens at booking, often months out; flight-specific forecasts only exist ~2 days before departure. | Booking-time ratings come from past flights on the route in that month, the departure time of day, the scheduled aircraft, the airports' usual patterns and the airline's cabin — each rating says "Based on past flights on this route in November". From 2 days out the day's forecast takes over and the basis line says so. Nothing a real product couldn't obtain (docs/FEASIBILITY.md). |
| 4 of 9 version C visitors sorted by Smoothest, 3 of them by Cheapest first; nobody used the minimum-score filter. | "For you" is the default sort; Cheapest, Fastest and Departure time stay. The score filter is gone. Every card shows the price difference to the cheapest flight ("+$42 vs cheapest"), so the trade-off is visible on the card. |
| Everyone saw the sign-up card; nobody signed up. | The flight page's card asks for something concrete: "Get smoothness ratings for your real trip — we'll let you know when it can rate a real flight". Same form, same storage (docs/INTEREST.md). |
| "Fear of flying" is a label people reject; "I want to prioritise smooth flights" lands. | Every line is framed as a preference ("What matters most to you on a flight?"); the words fear, risk, danger, warning, severe, scared, unsafe and safe-as-a-rating appear nowhere (enforced by `shared/scripts/check-ratings.ts`). |
| People skimmed: median 24 s on the briefing. | A card is one glance: airline, times, the top one or two ratings as pills, the price and its difference to the cheapest. |

And the question this iteration is built to answer — **do people choose a smoother flight over a cheaper
one?** — gets a signal: **I'd pick this flight** on the flight and compare pages (recorded only; nothing is
booked), logged with the flight's tiers, its price rank that day and the dollars over the cheapest.

## Pages

| Route | What |
| --- | --- |
| `/d` | "Find a smooth flight": the priorities setup (tap the four categories in order; Skip for now; "Change" later), then the search form. |
| `/d/search?from=JFK&to=LAX&date=2026-12-12[&sort=cheapest][&dep_from=…&dep_to=…&max_price=…&airline=…&wide=1]` | Results for one route and day: your priorities, the date strip, sort tabs (For you · Cheapest · Fastest · Departure time), the hard filters (departure window, highest fare, airlines, wide-body), one card per flight with its top ratings and the price difference to the cheapest, Compare and Details. |
| `/d/flight?from=…&to=…&date=…&f=DL1423[&pos=2]` | One flight: reassurance first, then the four ratings in your order, "I'd pick this flight", the fare and "Add to compare", the sign-up ask, "More detail" (the dashboard sections, collapsed) and the other flights that day. |
| `/d/compare?f=JFK.LAX.2026-12-12.DL1423,…` | 2–3 flights side by side: the four ratings in your order, price and difference, schedule, aircraft, airline, who flies it, best seat, and "I'd pick this flight" per column. |

`?test=1` on any /d page marks that tab's events and sign-ups as team tests; `utm_*` tags on a link travel
through the search, results and details links (PostHog records them on the first pageview as well).

## Data model

`shared/src/ratings.ts` (pure, deterministic, ~11 µs a call): `rateFlight({ option, today })` → four
`Rating`s in the fixed order cruise, takeoff_landing, aircraft, space:

```ts
interface Rating {
  category: "cruise" | "takeoff_landing" | "aircraft" | "space";
  tier: "very_smooth" | "smooth" | "moderate" | "slightly_bumpy" | "bumpy"   // cruise, takeoff_landing
      | "large" | "mid" | "smaller"                                           // aircraft
      | "roomy_quiet" | "typical" | "fuller";                                 // space
  label: string;      // the tier in words
  value: 0 | 1 | 2 | 3 | 4;   // for sorting (3-tier categories use 0 / 2 / 4)
  meaning: string;    // one line: what to expect and why it is normal
  basis: "history" | "forecast" | "aircraft" | "cabin";
  basisText: string;  // "Based on past flights on this route in November" …
  factors: { title; detail; effect: "up" | "down" | "neutral" }[];   // "how this is worked out"
  numbers: { label; value }[];                                        // the figures, for the sheet
}
```

| Category | At booking time (`basis: "history"` / `"aircraft"` / `"cabin"`) | Within 2 days (`"forecast"`) |
| --- | --- | --- |
| Smooth cruise | Past flights on the route in that month (`turbulence.history`), the departure window (mornings calmer, summer afternoons livelier, as in the generator's own model), wide-body vs single-aisle, route patterns recomputed from the airports (jet-stream season by latitude and direction, mountain crossings, tropics). | The flight's own cruise forecast (cruise-phase levels and bump stretches), kept in step with its smoothness score. |
| Smooth takeoff & landing | A small trait table of ~70 airports (`shared/src/airportTraits.ts`: coastal, high terrain, hot afternoons, exposed) with season and time of day at each end. | Climb and descent stretches from the forecast plus the wind at both ends (the wind only exists from 2 days out). |
| Aircraft size | The scheduled type: wide-body → Large jet; stretched single-aisle (≥ 185 seats) → Mid-size; else Smaller. The exact airframe only a day out. | same |
| Space & quiet | Seat pitch and width vs the industry benchmarks, the cabin-noise band, and a typical fullness for that weekday, hour, holiday and route (a band, never a seat count). | same |

Sorting and the choice signal: `forYouScore(ratings, order)` = Σ weight × value with weights 4/3/2/1 by rank;
`priceRank(prices, price)`; the priorities live in `localStorage` (`pfc.d.priorities.v1`), the pick in
`pfc.d.choice.v1`, the compare list in `pfc.d.compare.v1` (separate from C's).

Checks: `npm run test -w shared` runs `check-ratings.ts` — determinism, the horizons (nothing forecast-only
before 2 days), tier distribution at booking time, wide-body never bumpier than a single-aisle in the same
air, mornings never bumpier than summer afternoons, every string against the banned-word list, speed.

## Analytics (docs/ANALYTICS.md)

New events: `d_setup`, `d_sort`, `d_rating_open`, `d_flight_chosen`, plus D's counterparts of C's funnel
events (`d_search`, `d_results_view`, `d_flight_view`, `d_compare_toggle`, `d_compare_view`) and the
sign-up events with `d_*` placements. Every event from a /d page carries `variant: "D"` and `is_test`.

Funnel to build: `$pageview` /d → `d_setup` → `d_search` → `d_flight_view` → `d_flight_chosen`, broken
down by `priorities`. The headline question: among `d_flight_chosen` events, how often is `price_rank` > 1
(a dearer flight) and what do `dollars_over_cheapest` and the tiers look like — do people pay for
"Very smooth"?

## Links to test

| Link | What |
| --- | --- |
| `https://preflight-clarity.vercel.app/d?test=1` | The finder, in test mode for the tab. |
| `…/d/search?from=JFK&to=LAX&date=<today + 45 days>&test=1` | Booking-time ratings ("Based on past flights…"). |
| `…/d/search?from=DEN&to=SFO&date=<today + 2 days>&test=1` | Forecast-based ratings ("Based on this week's forecast"). |
| `…/d/compare?test=1` | The compare page with the tab's picks. |

Before sharing with real visitors: re-run `backend/supabase/schema.sql` in Supabase (new sign-up source `d`
and the `d_*` placements), then share the plain `/d` link.

## How it was built

Commit by commit: the scaffold (`/d` mirroring `/c` under a tool context), the ratings model with its
checks, the priorities setup and results view-model, the rating UI primitives, the results page, the flight
and compare pages with the choice signal and the sign-up ask, then this document. Each step was checked
with lint, typecheck, the shared and backend test suites, phone (390 px) and laptop (1280 px) screenshots,
and a browser run reading PostHog's own event log.
