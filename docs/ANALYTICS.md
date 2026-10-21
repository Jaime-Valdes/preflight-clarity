# Analytics (PostHog)

Product analytics for the study (A/B) and version C: funnels, user paths and session replay.
Implemented in `frontend/lib/analytics.ts` (+ `AnalyticsProvider` in the root layout). It is **off
unless `NEXT_PUBLIC_POSTHOG_KEY` is set**, so local runs and forks send nothing. Events go through
the same-origin `/ingest` proxy (`next.config.ts`), so ad blockers don't drop them.

## What is and isn't sent

- Sent: pageviews (every URL change), clicks (autocapture), the events below, and session recordings
  (replays). Visitors are anonymous: one random id per browser, no person profiles.
- **Never sent**: names, emails, survey answers (the rating sliders are masked in replays, and every
  input is masked), or anything from the session record. The research data stays in Supabase.

## Events

| Event | When | Properties |
| --- | --- | --- |
| `study_step` | each study screen reached (incl. on reload) | `step` (welcome, pre, preDetails, setup, preparing, dashboard, post, postParts, postHabits, debrief), `step_index` |
| `c_search` | a version C search is submitted | `origin`, `destination`, `date` |
| `c_results_view` | sort or filters change on results | `sort`, `times`, `airlines`, `wide`, `min_score` |
| `c_flight_view` | a flight page is shown | `key`, `origin`, `destination`, `days_until`, `has_scores` |
| `c_compare_toggle` | a flight is added to / removed from compare | `from` (results, flight, other_flights), `added`, `key`, `has_scores` |
| `c_compare_view` | the compare page is shown | `flights`, `from_link` |

Context on every study event once a session exists: `variant` (A/B), `is_test` (`?test=1`),
`participant` (`?p=` label or null). Filter `is_test = false` for real participants.

## Funnels to build in PostHog

- **Study completion**: `study_step` step=pre → setup → dashboard → post → debrief, broken down by
  `variant`. Drop-off between `dashboard` and `post` is the key number.
- **Version C**: `$pageview` /c → `c_search` → `c_flight_view` → `c_compare_toggle` → `c_compare_view`.
- **Paths**: Product analytics → Paths, start at `$pageview` on `/` or `/c`.

## Setup

1. PostHog → Project settings → copy the **Project API key** (`phc_…`). Note the region (US or EU).
2. Vercel, frontend project → Environment Variables: `NEXT_PUBLIC_POSTHOG_KEY`, and
   `NEXT_PUBLIC_POSTHOG_HOST=https://eu.posthog.com` only for an EU project. Redeploy (fresh build).
3. Session replay: PostHog → Settings → Session replay → enable recording (masking is already set
   in the code).
