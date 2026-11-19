# Analytics (PostHog)

Product analytics for the study (A/B) and version C: funnels, user paths and session replay.
Implemented in `frontend/lib/analytics.ts` (+ `AnalyticsProvider` in the root layout). It is **off
unless `NEXT_PUBLIC_POSTHOG_KEY` is set**, so local runs and forks send nothing. Events go through
the same-origin `/ingest` proxy (`next.config.ts`), so ad blockers don't drop them.

## What is and isn't sent

- Sent: pageviews (every URL change), clicks (autocapture), the events below, and session recordings
  (replays). Visitors are anonymous: one random id per browser, no person profiles.
- Team tests are flagged, never recorded: a study session opened with `?test=1`, and any browser in
  the tools' test mode (`frontend/lib/testMode.ts`: `?test=1` on a /c or /d page, kept while the
  tester keeps going and ended after 30 idle minutes, PostHog's own session timeout), sends its
  events with `is_test = true` and no replay (`disable_session_recording`, or the recording is
  stopped the moment the flag is seen). Until 2026-11-07 the tools' flag was per tab, so a link
  opened in a new tab lost it, and test runs were recorded like anyone else's.
- **Never sent**: names, emails (the sign-up form included), survey answers (the rating sliders are masked in replays, and every
  input is masked), or anything from the session record. The research data stays in Supabase.
- The team results page (`/results`) prints names, emails and answers as plain text, and PostHog starts
  there too (the provider is in the root layout). Its root carries PostHog's `ph-no-capture` class, so
  the whole page is blanked in replays and its clicks are left out of autocapture; only the pageview is
  sent. Keep that class on `ResultsDashboard`'s root if the page is restructured.

## Events

| Event | When | Properties |
| --- | --- | --- |
| `study_step` | each study screen reached (incl. on reload) | `step` (welcome, pre, preFlying, setup, preparing, dashboard, post, postParts, postHabits, debrief; `preDetails` until 2026-10-24, when its screen was folded into `setup`), `step_index` |
| `c_search` | a version C search is submitted, or a popular route is tapped on the home | `origin`, `destination`, `date`, `from` (form, popular; absent before 2026-10-28) |
| `c_results_view` | sort or filters change on results | `sort`, `dep_from`, `dep_to` (departure window as local minutes after midnight, e.g. 390 = 6:30 AM; null when not set), `max_price`, `airlines` (comma list), `wide`, `min_score` |
| `c_score_sheet` | the "How the smoothness score works" sheet is opened from a result card | `from`, `key`, `score` |
| `c_flight_view` | a flight page is shown | `key`, `origin`, `destination`, `days_until`, `has_scores`, `smoothness_score` (null until the forecast is out), `price` (the illustrative fare at that lead time), `is_cheapest` / `is_smoothest` (among that day's results; `is_smoothest` null without scores), `position` (1-based place in the results list it was opened from via `?pos=`; null from other-flights, compare or a shared link) |
| `c_compare_toggle` | a flight is added to / removed from compare | `from` (results, flight, other_flights), `added`, `key`, `has_scores` |
| `c_compare_view` | the compare page is shown | `flights`, `from_link` |
| `dashboard_section_open` | a participant expands a dashboard section (not a section that only comes back into view on a flight switch or a reload) | `section` (turbulence, aircraft, seat, airline, pilot, weather, sounds, compare, alerts), `variant` |
| `score_factors_open` | the "What goes into this score" panel under the smoothness score is expanded | `variant` |
| `interest_cta_view` | the "notify me when it's live" card scrolls into view (once per page view; study placements count a view when 40% of the card is on screen, versions C and D from the first visible pixel) | `source` (study, c, d), `placement` (dashboard, debrief, c_home, c_results, c_flight, c_compare, d_home, d_results, d_flight, d_compare) |
| `interest_signup` | a sign-up is submitted successfully | `source`, `placement`, `interview` (ticked the interview box), `is_test` |
| `d_setup` | the "What matters to you" setup on /d is answered | `completed` (false = skipped), `order` ("cruise,takeoff_landing,aircraft,space" — the four categories, most important first), `changed` (an earlier answer was replaced) |
| `d_search`, `d_results_view`, `d_compare_toggle`, `d_compare_view` | version D's counterparts of the `c_*` events above (same properties; `d_results_view` has no `min_score`, D has no score filter) | |
| `d_sort` | a sort tab is picked on /d/search | `sort` (foryou, cheapest, fastest, departure), `from` |
| `d_rating_open` | a rating's detail sheet is opened (the numbers and "how this is worked out") | `category` (cruise, takeoff_landing, aircraft, space), `tier`, `basis` (history, forecast, aircraft, cabin), `from` (results, flight, compare) |
| `d_flight_view` | a /d flight page is shown | `key`, `origin`, `destination`, `days_until`, `has_scores`, `price`, `is_cheapest`, `position`, `price_rank`, `dollars_over_cheapest`, `cruise_tier`, `takeoff_landing_tier`, `aircraft_tier`, `space_tier` |
| `d_flight_chosen` | "I'd pick this flight" on a /d flight or compare page (recorded only; nothing is booked) | `key`, `origin`, `destination`, `date`, `days_until`, `cruise_tier`, `takeoff_landing_tier`, `aircraft_tier`, `space_tier`, `price`, `price_rank` (1 = cheapest that day), `dollars_over_cheapest`, `position` (place in the results list it was opened from, null elsewhere), `from` (flight, compare), `priorities` (the visitor's order), `chosen` (false when the pick is withdrawn), `replaced_key` (the pick this one replaced on the same route and day, else null — count one pick per route and day by taking the last event per browser). The question the team is asking: do people pick a smoother flight over a cheaper one? Compare `price_rank` / `dollars_over_cheapest` against the tiers, broken down by `priorities`. |
| `d_addon_view` | the Flight Day Pack offer card (docs/FLIGHT_DAY_PACK.md) is at least half on screen, once per placement per tab session, never while a page transition covers it | `placement` (after_pick, results), `price_arm`, `variant`, `is_test` (+ `arm_forced` when forced, on every event of the test) |
| `d_addon_click` | "Add for $X" on the offer card | `placement`, `price_arm`, `variant`, `is_test` |
| `d_addon_waitlist` | the "not ready yet" form is submitted with an email (the `d_addon` sign-up is saved) | `placement`, `price_arm`, `variant`, `is_test` |
| `d_addon_dismiss` | "No thanks", when its reason is sent ("Done"), or when the visitor leaves the page without answering | `placement`, `price_arm`, `variant`, `is_test`, `reason` (too_expensive, wouldnt_use, not_sure, something_else, prefer_not, none_given) |
| `d_addon_items` | "Which of these would you actually use?" is sent with at least one box ticked | `placement`, `price_arm`, `variant`, `is_test`, `items` (comma list of walkthrough, airline, landed_text, none) |
| `d_pricing_answered` | the pricing questions are sent (once per browser) | `placement`, `price_arm`, `variant`, `is_test`, `questions_answered` (0–5; no amounts, no plan answer) |
| `d_feedback_open` | "Tell us what you think" is opened on a /d flight or compare page | `placement` (flight, compare), `price_arm`, `variant`, `is_test` |
| `d_feedback_submitted` | that feedback is sent | `placement`, `price_arm`, `variant`, `is_test` (no answers) |
| `study_share` | "Share with a friend" on the debrief is used | `method` (native = the phone's share sheet, copy), `outcome` (shared, cancelled, copied, shown = the link was displayed because copying wasn't allowed). The shared link is the plain study link tagged `utm_source=share&utm_medium=friend`, so arrivals from a share carry those on their `$pageview`; the sharer's `?v=`, `?p=` and `?test=` never travel with it. |

`placement = dashboard` is the sign-up card at the end of the study's briefing (after every section, before
the "I'm done exploring" footer; identical in A and B, added 2026-10-24). `debrief` is the form on the
debrief screen; a participant who already signed up on the briefing sees "You're on the list" there instead.

Context on every study event once a session exists: `variant` (A/B), `is_test` (`?test=1`),
`participant` (`?p=` label or null). Filter `is_test = false` for real participants.
Every event sent from a /c page (custom events, pageviews, autocapture) carries `variant` "C" and
`is_test` (the browser is in test mode, or the URL carries `?test=1`); every event from a /d page
carries `variant` "D" the same way (`frontend/lib/tool.ts`). These are stamped by URL in `before_send`, not registered as super
properties, so the study's and the tools' context never bleed into each other when one browser visits
them all.

**Version D's Flight Day Pack pricing test** (docs/FLIGHT_DAY_PACK.md, from 2026-11-18). Every visitor's first /d page
draws a price arm, 50/50 and kept in the browser: `p499` ($4.99 per trip) or `p1499` ($14.99). From then on every
event sent from a /d page (pageviews, autocapture, `interest_*`, every `d_*` event) carries `price_arm`, stamped
by URL in `before_send` like `variant`, so the study's and version C's events never get it. A team preview opened
with `?arm=p499` or `?arm=p1499` forces that arm for the tab's session and adds `arm_forced: true` to every event
(and row): filter `arm_forced` is not set, and `is_test = false`, before reading any number.

- **Revenue per offer view**, per arm: count of `d_addon_waitlist` × the arm's price ÷ count of `d_addon_view`.
  A waitlist join stands in for a purchase: nothing is charged, so this is intent at a price, not revenue.
- **Revenue per visitor**, per arm: count of `d_addon_waitlist` × price ÷ unique visitors (distinct ids) with a
  `$pageview` on /d, broken down by `price_arm`. Count unique users rather than events for both, since a
  visitor can see the card in two tab sessions.
- **Why not**: `d_addon_dismiss` by `reason`; **what they'd use**: `d_addon_items` by `items`. The amounts, the
  plan answer and every typed answer are only in Supabase (`d_feedback`, `signups`), never in PostHog.

Version D (docs/ITERATION_2.md) funnel: `$pageview` /d → `d_setup` → `d_search` → `d_flight_view` →
`d_flight_chosen`, broken down by `priorities`; `d_rating_open` by `category` shows which ratings
people look into; `interest_signup` with placement `d_flight` is the concrete ask on the flight page.

**Version D's "Window Seat" look** (built on the branch `ui/d-cinematic`, `docs/ui-d-cinematic.md`)
changes no event, property or route, but it shifts some measurements. It reached production on the
morning of 2026-11-11, New York time; the PostHog annotation "Version D: Window Seat look live" marks
the minute. Don't pool D's numbers from before and after that point:

- **View events fire a little later.** A page move is now a 760 ms plane wipe. The new page commits
  15–45 ms later than before (up to about 300 ms on a slow phone), so `d_flight_view`,
  `d_compare_view` and the sign-up card's `interest_cta_view` observer run later too. On a route
  that wasn't prefetched, they wait until the wipe ends (0.8–1.0 s). `$pageview` still comes first.
- **Time on page includes the wipe**, about 0.8 s per page move that version C doesn't have. When
  comparing C and D, measure from the end of the wipe or leave raw time-on-page out.
- **The sign-up cards moved.** Their distance from the top of the page changed (phone: results
  +98 px, flight +44, compare +202; laptop: home −261, results +155, flight −29, compare +94), so
  `interest_cta_view` rates before and after the switch aren't comparable.
- **Generated ids shifted.** React's `useId` values on the sort radios and the sign-up fields
  changed (for example `_r_1_` to `_r_3_`), and they reach autocapture as `attr__id`, `attr__name`
  and `attr__for`. Don't filter insights or actions on those generated ids. (There are no saved
  actions in the project today.)

**Version D's day-and-night sky, cloud pass and cloud faces** (branch `ui/d-cinematic-2`,
`docs/ui-d-cinematic.md`) change no event, property, route or form. They reached production at
5:55 pm New York time on 2026-11-18 (22:55:56 UTC); the PostHog annotation "Version D: pass 4 live"
marks the minute. Don't pool D's numbers across it, and split D by look:

- **Two looks, by the real sky.**
  - **When it is night:** when the sun is more than 6° below the horizon at the principal place of
    the visitor's browser time zone (civil twilight). That is about 13 h of night in New York in
    November and about 8 h in June, so night's share changes with the season.
  - **What changes:** at night only the sky and what sits directly on it change (navy, stars,
    tonight's moon, light text). Cards, ratings, prices, chips and controls are the same; unchosen
    date tiles are 90 % paper so their contrast matches day's.
  - **When it changes:** at each load and, at dusk or dawn, live (a 4-second fade within about a
    minute of the threshold). So an event's own timestamp gives its look; use the expression below.
  - **Cross-check:** clicks inside D also carry `attr__data-d-time` (and `attr__data-d-time-fade`
    during a fade) in `elements_chain`.
  - **Exceptions:** a device whose clock is wrong shows its own clock's sky, and a browser reporting
    UTC (privacy modes) always shows day.
- **Page moves take longer.**
  - A move is a 1.6 s cloud pass (it was a 0.76 s plane wipe): the clouds drift in, rest for a
    moment while the page changes under them, and drift out. `$pageview` fires when it did.
  - On a route already loaded, `d_flight_view`, `d_compare_view` and the sign-up card's
    `interest_cta_view` observer fire about 20–27 ms after it, as before (16–19 ms on the
    previous build in the same session; measured on battery).
  - On a route seen for the first time they no longer wait. In a first-visit test (prefetch
    blocked, 250 ms added to every server response; Chrome, on battery) the new page arrived with
    its content and they fired 21–25 ms after `$pageview`, where the previous build showed a
    loader and waited for its wipe, about 0.8 s after `$pageview`. `$pageview` itself still came
    about 0.3 s after the tap there, on both builds.
  - The new page first shows about 1.15 s after the tap (was about 0.3 s) and is fully shown when
    the pass ends, about 1.7 s after the tap (was 0.87 s; on battery, interleaved, 1.69–1.72 s
    against 0.85–0.87 s, and about 1.95 s on a first visit). Time on page now includes about
    1.7 s per forward move (was 0.8 s; version C none): subtract it when comparing C and D.
  - Back and Forward stay instant; reduced motion gets a 150 ms fade.
  - `interest_cta_view` can fire up to about 1.6 s before the card is uncovered.
- **Taps during a pass count as clicks.** `clicks_on_page` / `clicks_on_previous_page` count taps
  that land on the pass (autocapture ignores them), so D's clicks per page rise a little for no
  reason on the page.
- **The cloud reacts more visibly.**
  - "Noted" (happy eyes, a wide smile and a nod) on compare add and remove and on the priority
    tiles, the same in both directions and for every flight.
  - A brief brighter smile on other controls (a sort, a date tile), at most every 1.2 s, and a
    small greeting when a page settles.
  - The pick keeps its plain nod; the sign-up, the footer and sheets get nothing; the cloud is
    still not tappable.
  - `d_compare_toggle` per visitor may rise in both directions.

Version D's look at an event, as the browser decided it (`frontend/components/d/sky/time.ts`).
Replace the two `transform(zone, …)` calls with the two lines that
`node frontend/scripts/d-sky-zones.mjs --hogql` prints (the full zone lists; they read
`properties.$timezone`, the same as `zone`):

```sql
SELECT event, timestamp,
  properties.$timezone AS zone,
  coalesce(transform(zone, ['America/New_York', /* … */], [40.7, /* … */], NULL),
           toFloat(properties.$geoip_latitude)) AS lat,
  coalesce(transform(zone, ['America/New_York', /* … */], [-74.0, /* … */], NULL),
           toFloat(properties.$geoip_longitude), -toFloat(properties.$timezone_offset) / 4) AS lon,
  toHour(timestamp) * 60 + toMinute(timestamp) + toSecond(timestamp) / 60 AS utc_min,
  2 * pi() / if((toYear(timestamp) % 4 = 0 AND toYear(timestamp) % 100 != 0) OR toYear(timestamp) % 400 = 0, 366, 365)
    * (toDayOfYear(timestamp) - 1 + (utc_min / 60 - 12) / 24) AS g,
  229.18 * (0.000075 + 0.001868 * cos(g) - 0.032077 * sin(g) - 0.014615 * cos(2 * g) - 0.040849 * sin(2 * g)) AS eqtime,
  0.006918 - 0.399912 * cos(g) + 0.070257 * sin(g) - 0.006758 * cos(2 * g) + 0.000907 * sin(2 * g)
    - 0.002697 * cos(3 * g) + 0.00148 * sin(3 * g) AS decl,
  ((utc_min + eqtime + 4 * lon) / 4 - 180) * pi() / 180 AS ha,
  90 - acos(greatest(-1, least(1, sin(lat * pi() / 180) * sin(decl) + cos(lat * pi() / 180) * cos(decl) * cos(ha))))
    * 180 / pi() AS sun_alt,
  multiIf(zone = '' OR match(zone, '^(Etc/)?(UTC|UCT|GMT|GMT[+-]?0|Greenwich|Universal|Zulu|Unknown|Factory)$') OR lat IS NULL,
          'day', sun_alt < -6, 'night', 'day') AS d_look
FROM events
WHERE properties.variant = 'D' AND timestamp >= toDateTime('2026-11-18 22:55:56')
```

- Zones outside the table use the browser's own fallback (the offset gives the longitude), so the
  expression's geoip and offset fallback is approximate there. Nearly all of D's traffic so far
  reports `America/New_York` (769 of 771 events from 2026-11-11 to 2026-11-18; two reported UTC).
- The local hour, `toHour(timestamp - toIntervalMinute(toInt(properties.$timezone_offset)))`, stays
  useful as a sanity check.
- Events before the ship were all day.
- Checked read-only on 2026-11-18 over D's events since 2026-11-11: the expression ran in
  PostHog, and 10 of them (New York by day, near sunset and at night, and the two reporting UTC)
  gave the same look, and the same sun altitude to 0.01°, as `skyTimeAt` in Node.

## Funnels to build in PostHog

- **Study completion**: `study_step` step=pre → setup → dashboard → post → debrief, broken down by
  `variant`. Drop-off between `dashboard` and `post` is the key number.
- **Version C**: `$pageview` /c → `c_search` → `c_flight_view` → `c_compare_toggle` → `c_compare_view`.
- **Study interest**: `study_step` step=dashboard → `interest_signup`, broken down by `variant`
  (the card is on the briefing and on the debrief, so start at the dashboard, not the debrief; break
  `interest_signup` down by `placement` to see which of the two converts). Filter `is_test = false`.
  The sign-up rate per variant is also on the results page (`/results`), computed from session
  records — prefer that number: PostHog has no session ids, so it can't tell one person signing up
  twice from two people.
- **Version C interest**: `c_compare_view` → `interest_signup`; compare `interest_cta_view` →
  `interest_signup` by `placement` to see which page's card converts.
- **Paths**: Product analytics → Paths, start at `$pageview` on `/` or `/c`.

## Which sections relate to sign-ups

The team wants to know which parts of the briefing people open most, and whether opening them goes
with signing up. Two views, each honest about what it can and cannot say:

1. **PostHog — what gets opened.** Trends on `dashboard_section_open`, broken down by `section`
   (and by `variant`; filter `is_test = false`). "Unique users" rather than total count, so one
   person re-opening a section many times does not dominate. `score_factors_open` sits beside it
   for the smoothness-score panel.
2. **PostHog — opens → sign-up.** Funnel `dashboard_section_open` → `interest_signup`, broken down
   by `section` of the first step. Then open the funnel's **Correlation analysis** tab: PostHog lists
   the events and properties that converting users had more often than non-converting ones (e.g.
   "`dashboard_section_open` where `section = seat` — 2.1× more common among those who signed up").
   Both are within one anonymous browser id, so a sign-up on the debrief still counts; a
   participant who finished on another device does not.
3. **Results page — the per-session view.** The Interest block's **Sign-ups by section opened**
   table uses the session records: per section, the real completed sessions that were shown it,
   split into "opened it" and "didn't", with each half's sign-up count and rate (signed up = the
   record's `waitlist`, from either the briefing card or the debrief). PostHog cannot join a
   section open to a later sign-up by session (it has no session ids and no record of what each
   session was shown), so prefer the table for the rates and use PostHog for the ordering and the
   correlation hints.

Read all of it as "what went together", not "what caused what": someone curious enough to open a
section is also more likely to leave an email, and the cells are small. The booking-intent question
(`post.bookLikelihood`, "Would having this pre-flight information make you more likely to book a
flight?") is in the records only, as a distribution in the results page's "If this existed for real"
block.

## Setup

1. PostHog → Project settings → copy the **Project API key** (`phc_…`). Note the region (US or EU).
2. Vercel, frontend project → Environment Variables: `NEXT_PUBLIC_POSTHOG_KEY`, and
   `NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com` only for an EU project. Redeploy (fresh build).
3. Session replay: PostHog → Settings → Session replay → enable recording (masking is already set
   in the code).
