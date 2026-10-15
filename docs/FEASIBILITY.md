# Real-world feasibility of the flight data (contract)

Team rule (2026-10-15): every piece of flight information in versions A, B and C must be data a real
product could obtain — it may be hard, and ML-engineered data is fine, but never impossible. An audit
of 151 displayed items (with an adversarial second pass and sources) found items that can never be
obtained, and many that only exist close to departure but were shown weeks ahead. Decisions taken
with the team:

1. **Study (A/B) — day-before preview.** The briefing is shown as it would look **the day before the
   flight**, and says so in a quiet banner. Everything in it must be obtainable by then. The header
   countdown stays true ("44 days until your flight").
2. **Version C — time-aware.** Show only what is knowable at the flight's real distance from today.
   Where a flight-specific item isn't available yet, show a calm marker instead, e.g.
   "Turbulence forecast from Tue, Nov 24 · 2 days before departure".
3. **Study flow unchanged** (route + date only). Because the participant never says which flight they
   are on, the briefing is labelled **"An example flight on your route"**.

## Availability horizons (one source of truth: `shared/src/forecast.ts`)

| Constant | Days before departure | Unlocks |
| --- | --- | --- |
| `TURBULENCE_FORECAST_DAYS = 2` | ≤ 2 | Flight-specific turbulence: smoothness score, timeline, bump stretches with times, phase strip, causes, seatbelt notes, smoother-option deltas, compare overlays, smoothest sort / minimum-smoothness filter. Confidence: day 0 → High (5/5, "hourly forecasts and recent pilot reports"); days 1–2 → Good (4/5, "the latest turbulence forecasts along the usual path"). |
| `WEATHER_FORECAST_DAYS = 7` | ≤ 7 | Departure/arrival condition and temperature. Wind, gusts and visibility only at ≤ `WEATHER_DETAIL_DAYS = 2`. |
| `GATE_DAYS = 0` | day of travel | Gate number ("can change"). Terminal is known any time. |
| `AIRFRAME_DAYS = 1` | ≤ 1 | Tail number, this airframe's age and delivery year ("assigned aircraft · can change"). Before that: the scheduled type and the airline's fleet-average age for that type. |
| `SCHEDULE_DAYS = 330` | ≤ 330 | Schedules and fares are published about 330 days ahead: every date picker stops there. |

The A/B day-before preview builds its section context with `daysUntil = 1` (so everything above except
the gate is available; the gate shows "posted on the day"). Version C uses the real `daysUntil`.

## Impossible → removed everywhere

- **Pilot identity and personal data**: names, initials avatars, home base, star ratings and rating
  counts, total hours, hours on type, years flying, times on this route, backgrounds, "passengers
  mention" badges, and the footnote claiming passenger feedback. Airlines don't publish crew rosters,
  pilot records are protected (FAA Pilot Records Database is hiring-only), and the crew isn't fixed
  weeks ahead. **Replacement — "Who flies your plane"**: role cards without names (Captain, First
  Officer; on long flights relief pilots: block time ≥ ~8.5 h → 3 pilots, ≥ ~12 h → 4) listing what the
  rules guarantee for every airline pilot — US carriers: Airline Transport Pilot certificate (1,500+
  flight hours), at least 1,000 hours of airline flying before commanding (14 CFR 121.436), a type
  rating for this model, recurrent simulator checks (every 6–12 months), regular medicals, rest rules
  (Part 117); other carriers: the EASA/ICAO equivalents (ATPL, type rating, operator proficiency checks
  every 6 months, flight-time limits). Teaser: "2 pilots · licensed and type-rated on the A321neo".
  Footnote: "Airlines don't publish who will fly a given flight — these are the rules every airline
  pilot meets." Section id stays `pilot`; its title becomes "Who flies your plane" (and the post-survey
  part label with it).
- **Airframe maintenance records**: "last full inspection N days ago", check type, "next A-check in N
  days". Not public. **Replacement**: "By law, an airliner can only fly when every required inspection
  is complete and signed off" + an accurate A-check explainer (roughly every 600–1,000 flight hours,
  i.e. every few months depending on the model, plus a walk-around before every flight).
- **Version C crew hours** (result-card fact, compare "Crew" row, home-tile copy) → removed; the row
  becomes "Pilots: 2 (3–4 on long flights) · licensed and type-rated", built from the same rules.
- **Made-up airports**: the study turned unrecognised text into synthetic airports. The study now
  accepts catalogue airports only (pick a suggestion; hint "Can't find it? Pick the nearest major
  airport").
- **Nonstops nobody flies** (version C searches every catalogue pair): a route only gets nonstop
  flights when it is plausible (a carrier with a hub/focus city at one end flies that distance);
  otherwise a calm "No nonstop flights on this route" state with a suggestion to try a nearby hub.

## Feasible, reworded (the copy overstated precision or certainty)

- Confidence tiers and notes as in the table (no more "High confidence" days out; the old 10/30-day
  forecast/outlook tiers are gone).
- Seat map: "Taken" → "Unavailable"; "free" → "open right now" (+ "as of today — seats change until
  check-in").
- Fare deltas: "vs. your fare" → "vs. this flight's fare" (we never know what anyone paid).
- Aircraft: "Scheduled aircraft" wherever the airframe isn't assigned yet; cabin noise as a relative
  band ("Quieter than most airliners") with an approximate range, not one exact dB number.
- Airline: the safety score keeps its ring, with its basis stated (IOSA audit status, regulator
  oversight, accident record, fleet age); cabin-crew rating labelled as the airline's average from
  passenger reviews; on-time figures labelled "last 12 months".
- Route history: "based on about N past flights with turbulence reports".
- Sounds: timings rounded to 5 minutes.
- Study copy: loading lines ("Building your day-before briefing…"), debrief ("who flies your plane"
  instead of "the pilots").

## Residual (known, accepted)

- The study's example flight can be a nonstop on a route people usually fly with a connection; it is
  labelled as an example.
- Version C fares are fixed, illustrative numbers (a real product would show the fare when checked).
