# Analytics (PostHog)

Product analytics for the study (A/B) and version C: funnels, user paths and session replay.
Implemented in `frontend/lib/analytics.ts` (+ `AnalyticsProvider` in the root layout). It is **off
unless `NEXT_PUBLIC_POSTHOG_KEY` is set**, so local runs and forks send nothing. Events go through
the same-origin `/ingest` proxy (`next.config.ts`), so ad blockers don't drop them.

## What is and isn't sent

- Sent: pageviews (every URL change), clicks (autocapture), the events below, and session recordings
  (replays). Visitors are anonymous: one random id per browser, no person profiles.
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
| `c_search` | a version C search is submitted | `origin`, `destination`, `date` |
| `c_results_view` | sort or filters change on results | `sort`, `dep_from`, `dep_to` (departure window, HHMM), `max_price`, `airlines`, `wide`, `min_score` |
| `c_score_sheet` | the "How the smoothness score works" sheet is opened from a result card | `from`, `key`, `score` |
| `c_flight_view` | a flight page is shown | `key`, `origin`, `destination`, `days_until`, `has_scores`, `smoothness_score` (null until the forecast is out), `price` (the illustrative fare at that lead time), `is_cheapest` / `is_smoothest` (among that day's results; `is_smoothest` null without scores), `position` (1-based place in the results list it was opened from via `?pos=`; null from other-flights, compare or a shared link) |
| `c_compare_toggle` | a flight is added to / removed from compare | `from` (results, flight, other_flights), `added`, `key`, `has_scores` |
| `c_compare_view` | the compare page is shown | `flights`, `from_link` |
| `dashboard_section_open` | a participant expands a dashboard section (not a section that only comes back into view on a flight switch or a reload) | `section` (turbulence, aircraft, seat, airline, pilot, weather, sounds, compare, alerts), `variant` |
| `score_factors_open` | the "What goes into this score" panel under the smoothness score is expanded | `variant` |
| `interest_cta_view` | the "notify me when it's live" card scrolls into view (once per page view; study placements count a view when 40% of the card is on screen, version C from its first visible pixel) | `source` (study, c), `placement` (dashboard, debrief, c_home, c_results, c_flight, c_compare) |
| `interest_signup` | a sign-up is submitted successfully | `source`, `placement`, `interview` (ticked the interview box) |

`placement = dashboard` is the sign-up card at the end of the study's briefing (after every section, before
the "I'm done exploring" footer; identical in A and B, added 2026-10-24). `debrief` is the form on the
debrief screen; a participant who already signed up on the briefing sees "You're on the list" there instead.

Context on every study event once a session exists: `variant` (A/B), `is_test` (`?test=1`),
`participant` (`?p=` label or null). Filter `is_test = false` for real participants.
Every event sent from a /c page (custom events, pageviews, autocapture) carries `variant` "C" and
`is_test` (the tab was opened with `?test=1`). These are stamped by URL in `before_send`, not
registered as super properties, so the study's and version C's context never bleed into each other
when one browser visits both.

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
