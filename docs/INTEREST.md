# Product interest — the sign-up call to action (contract)

Besides testing whether pre-flight information lowers anxiety, the team wants a **business signal**:
would people use a product like this? Decision (2026-10-21): one honest "notify me when it's live"
sign-up, shown at the same point to everyone, measured as a rate.

## Where it appears, and why there

| Prototype | Placement | Rule |
| --- | --- | --- |
| Study (A and B) — briefing | A card at the **bottom of the dashboard** (placement `dashboard`, since 2026-10-24): after every section, before the sticky "I'm done exploring" footer. Identical in A and B — same copy, same form, same position — and never required to continue. | Interest peaks while people are looking at the briefing (team decision 2026-10-24, mirroring version C's bottom card). Because the card is identical in both arms and sits after all the content, the sign-up rate by variant still compares the dashboards, not the prompt. It does sit before the post-survey, so a share of participants now see a product prompt before rating their anxiety; the results page's Interest block says where each sign-up came from (`By placement`). |
| Study (A and B) — debrief | The **debrief** screen, after the illustrative-data reminder. Someone who signed up on the briefing sees "You're on the list." here instead of the form. | A second, calmer chance after every answer is saved; identical in A and B. |
| Version C | A card at the **bottom of every page** (home, results, flight, compare) and a "Get early access" link in the footer; tapping opens a sign-up sheet. | Interest peaks right after comparing flights; the card never covers content (the compare tray stays sticky). |

The study's existing "open to a 15-minute chat" email form becomes part of this: one form, the product
sign-up as the primary action, the interview as an optional checkbox.

## The form (same copy everywhere, calm, honest)

- Title: **Want this for your real flights?**
- Body: *Cloud9 is a prototype today. We're building it into a free app. Leave your email and
  we'll let you know when it's live — one email, no spam.*
- Fields: **First name** (optional, ≤ 60) · **Email** (required, validated) · checkbox *I'm also open to
  a 15-minute chat about what I'd want from this* (study: *…about my experience*).
- Button: **Notify me when it's live**.
- After: **You're on the list.** *We'll email you once when it launches.* (study adds: *We'll only use
  your name and email for this.*)
- Never: claims that it reduces anxiety or makes flying safer, "limited spots", countdowns, pre-ticked
  boxes, or a sign-up requirement to continue. Everything stays optional and skippable.

Once someone has signed up in a browser, every C page shows the "You're on the list" state instead of
the form (`localStorage` `pfc.interest.v1`). The study does the same across its two placements: a
sign-up on the briefing card marks the session (`emailSent`) and the debrief shows "You're on the list."

## Data

- `Signup` (shared/src/types.ts): `id` (browser UUID), `createdAt`, `source` (`study` | `c`),
  `placement` (`dashboard` | `debrief` | `c_home` | `c_results` | `c_flight` | `c_compare`), `email`, `firstName`,
  `waitlist` (true), `interview`, `sessionId` + `variant` + `isTest` + `participant` (study), `context`
  (what they were looking at, e.g. `JFK → LAX · Nov 26 · 2 flights in compare`), `page`.
- `shared/src/signup.ts`: `parseSignup` (validation), `signupsToCsv`, `signupStats` (total, unique
  emails, by source/placement, study sign-up rate = sign-ups ÷ real sessions that saw the sign-up form —
  reached the briefing, which shows the card, or the debrief — overall and per variant).
- The study's `SessionRecord` also gets `waitlist` and `interview` (+ CSV columns), so the research
  record is complete on its own.
- API (`backend/`): `POST /signups` (public, ≤ 10 KB, same rate limit as responses; upsert on
  `email_key` + `source` — a repeat from the same email and source takes the latest id, placement,
  context and page, keeps the original `created_at`, keeps an earlier first name when the repeat's is
  blank, and keeps the interview opt-in once given), `GET /signups` (admin key). Storage follows the responses adapter: Supabase table `signups`
  (`backend/supabase/schema.sql`, re-runnable), a sibling `signups.json` next to `DATA_FILE`, or none
  (503). `email_key` = lower-cased, trimmed email.
- Team tests: the study marks its sign-ups with the session's `isTest`; on version C, open any `/c`
  page with `?test=1` and that tab's sign-ups are marked as tests (`pfc.c.test.v1`). The results page
  excludes test sign-ups unless "Include test sessions" is on.
- Frontend: `saveSignup(signup)` in `frontend/lib/storage.ts` mirrors to `localStorage`
  (`pfc.signups.v1`) then POSTs to `/api/signups` (proxied like responses); `loadLocalSignups()` is
  the no-backend fallback for the results page.
- Results page: an **Interest** block (numbers above, plus **Sign-ups by section opened**: per
  dashboard section, the real completed sessions shown it, split by opened / not opened, with each
  half's sign-up count and rate — `signupRateBySection` in `shared/src/stats.ts`; a cross-tab, not a
  cause), a sign-ups table (name, email, source, placement, variant, context, date, interview) and
  **Download sign-ups CSV**.

## Analytics (PostHog, docs/ANALYTICS.md)

- `interest_cta_view` `{ source, placement }` — once per page view when the card scrolls into view
  (the study's briefing card sends `placement: "dashboard"`).
- `interest_signup` `{ source, placement, interview }` — on a successful submit.
- Funnels: study `study_step` step=dashboard → `interest_signup` (broken down by `placement`); C
  `c_compare_view` → `interest_signup`; `dashboard_section_open` → `interest_signup` by `section` for
  which parts of the briefing go with signing up ("Which sections relate to sign-ups" in
  docs/ANALYTICS.md).
- Sign-up rate per variant and the per-section cross-tab are on the results page, not in PostHog
  (PostHog has no session ids).

## Ownership (build)

| Owner | Files |
| --- | --- |
| Lead (done) | `shared/src/types.ts` (Signup, API types, SessionRecord.waitlist/interview), `shared/src/signup.ts` (first version — data owner hardens and tests it), `frontend/lib/storage.ts` (`saveSignup`, `loadLocalSignups`), this doc |
| Data | `shared/src/signup.ts`, `shared/src/record.ts` (waitlist/interview), `shared/src/csv.ts`, `backend/**` (routes/signups.ts, store adapters, db.ts, app.ts, schema.sql, tests) |
| Flow | `frontend/components/flow/*` (DebriefScreen), `frontend/lib/session.ts`, `frontend/components/flow/StudyFlow.tsx`, `docs/ARCHITECTURE.md` (research-integrity rule), `README.md` |
| Version C | `frontend/components/c/interest/*` (new), placements in `frontend/app/c/*` and `frontend/components/c/{search,flight,compare,shell}/*`, `docs/VERSION_C.md` |
| Results | `frontend/lib/api.server.ts`, `frontend/app/results/*`, `frontend/components/results/*`, `docs/ANALYTICS.md` |
