# Product interest — the sign-up call to action (contract)

Besides testing whether pre-flight information lowers anxiety, the team wants a **business signal**:
would people use a product like this? Decision (2026-10-21): one honest "notify me when it's live"
sign-up, shown at the same point to everyone, measured as a rate.

## Where it appears, and why there

| Prototype | Placement | Rule |
| --- | --- | --- |
| Study (A and B) | The **debrief** screen, after the illustrative-data reminder — never on the dashboard or before the post-survey. | The post-survey measures anxiety after the dashboard; a sign-up prompt before it would change what participants react to, and would have to differ between arms. On the debrief it is identical in A and B, so sign-up rate by variant is a clean extra signal ("does the full dashboard create more interest?"). |
| Version C | A card at the **bottom of every page** (home, results, flight, compare) and a "Get early access" link in the footer; tapping opens a sign-up sheet. | Interest peaks right after comparing flights; the card never covers content (the compare tray stays sticky). |

The study's existing "open to a 15-minute chat" email form becomes part of this: one form, the product
sign-up as the primary action, the interview as an optional checkbox.

## The form (same copy everywhere, calm, honest)

- Title: **Want this for your real flights?**
- Body: *Pre-Flight Clarity is a prototype today. We're building it into a free app. Leave your email and
  we'll let you know when it's live — one email, no spam.*
- Fields: **First name** (optional, ≤ 60) · **Email** (required, validated) · checkbox *I'm also open to
  a 15-minute chat about what I'd want from this* (study: *…about my experience*).
- Button: **Notify me when it's live**.
- After: **You're on the list.** *We'll email you once when it launches.* (study adds: *We'll only use
  your name and email for this.*)
- Never: claims that it reduces anxiety or makes flying safer, "limited spots", countdowns, pre-ticked
  boxes, or a sign-up requirement to continue. Everything stays optional and skippable.

Once someone has signed up in a browser, every C page shows the "You're on the list" state instead of
the form (`localStorage` `pfc.interest.v1`).

## Data

- `Signup` (shared/src/types.ts): `id` (browser UUID), `createdAt`, `source` (`study` | `c`),
  `placement` (`debrief` | `c_home` | `c_results` | `c_flight` | `c_compare`), `email`, `firstName`,
  `waitlist` (true), `interview`, `sessionId` + `variant` + `isTest` + `participant` (study), `context`
  (what they were looking at, e.g. `JFK → LAX · Nov 26 · 2 flights in compare`), `page`.
- `shared/src/signup.ts`: `parseSignup` (validation), `signupsToCsv`, `signupStats` (total, unique
  emails, by source/placement, study sign-up rate = sign-ups ÷ real sessions that reached the debrief,
  overall and per variant).
- The study's `SessionRecord` also gets `waitlist` and `interview` (+ CSV columns), so the research
  record is complete on its own.
- API (`backend/`): `POST /signups` (public, ≤ 10 KB, same rate limit as responses; upsert by
  `id`), `GET /signups` (admin key). Storage follows the responses adapter: Supabase table `signups`
  (`backend/supabase/schema.sql`, re-runnable), a sibling `signups.json` next to `DATA_FILE`, or none
  (503). Duplicate emails from the same source update the existing row (`email_key` = lower-cased
  email + source) and keep the original `created_at`.
- Frontend: `saveSignup(signup)` in `frontend/lib/storage.ts` mirrors to `localStorage`
  (`pfc.signups.v1`) then POSTs to `/api/signups` (proxied like responses); `loadLocalSignups()` is
  the no-backend fallback for the results page.
- Results page: an **Interest** block (numbers above), a sign-ups table (name, email, source,
  placement, variant, context, date, interview) and **Download sign-ups CSV**.

## Analytics (PostHog, docs/ANALYTICS.md)

- `interest_cta_view` `{ source, placement }` — once per page view when the card scrolls into view.
- `interest_signup` `{ source, placement, interview }` — on a successful submit.
- Funnels: study `study_step` step=debrief → `interest_signup`; C `c_compare_view` → `interest_signup`.
- Sign-up rate per variant is on the results page, not in PostHog (PostHog has no session ids).

## Ownership (build)

| Owner | Files |
| --- | --- |
| Lead (done) | `shared/src/types.ts` (Signup, API types, SessionRecord.waitlist/interview), `shared/src/signup.ts` (first version — data owner hardens and tests it), `frontend/lib/storage.ts` (`saveSignup`, `loadLocalSignups`), this doc |
| Data | `shared/src/signup.ts`, `shared/src/record.ts` (waitlist/interview), `shared/src/csv.ts`, `backend/**` (routes/signups.ts, store adapters, db.ts, app.ts, schema.sql, tests) |
| Flow | `frontend/components/flow/*` (DebriefScreen), `frontend/lib/session.ts`, `frontend/components/flow/StudyFlow.tsx`, `docs/ARCHITECTURE.md` (research-integrity rule), `README.md` |
| Version C | `frontend/components/c/interest/*` (new), placements in `frontend/app/c/*` and `frontend/components/c/{search,flight,compare,shell}/*`, `docs/VERSION_C.md` |
| Results | `frontend/lib/api.server.ts`, `frontend/app/results/*`, `frontend/components/results/*`, `docs/ANALYTICS.md` |
