# Flight Day Pack: version D's pricing test

Built 2026-11-18 on the branch `test/flight-day-pack`. Only version D (`/d`) changes. The study (A/B) and
version C look and behave exactly as before.

## What it tests

Would people pay for a per-trip add-on, and at which price? The **Flight Day Pack** is offered at **$4.99** or
**$14.99 per trip**. Each visitor gets one of the two prices at random, 50/50, and always sees that one. It
contains:

- an airport walkthrough for your departure airport (security, your terminal, finding your gate);
- Flight Forecast updates and alerts;
- letting loved ones know you've landed;
- and more.

(Iteration 1, 2026-11-18, listed "your airline, explained" in the second place, with the item key `airline`;
iteration 2 replaced it with `forecast_alerts`. No real answers used the old key.)

The pack doesn't exist yet. "Add" opens an honest fake door: *The Flight Day Pack isn't ready yet. Leave your
email and you'll get it free at launch.* Nothing is ever charged and no payment is ever asked for.

- **Key metric:** revenue per offer view and per visitor (joins × price), by arm.
- **Also:** which items people would use, why people say no, the Van Westendorp price range, and per trip
  vs. $29.99 a year.

## Iteration 2 (2026-11-19, the owner's request)

The owner lifted two of D's rules, "never a pop-up" and "never orange", for the offer and the waitlist dialog
only. Everything else stands: no fear framing or anxiety claims, no urgency, countdowns or timers shown, the
banned words, nothing typed or answered sent to PostHog, A/B/C pixel-identical.

- **`results` becomes a pop-in.** No longer a list item after the 3rd result: a panel slides in from the
  right 5 s after the visitor's first scroll of the results (once the flights are on screen), fixed to the
  screen over the list. Phone: about 88 % of the width from the right edge, low on the screen, above the compare
  tray when it shows. Laptop: 392 px wide, 24 px from the right edge. It is not modal: the page stays usable.
  It closes only through its own steps ("Add to flight – $X" or "No thanks", then the steps, then the
  thank-you's Close), or when the visitor leaves the page. It never starts during a page transition; under
  reduced motion it fades in. `d_addon_view` fires once it has finished arriving.
- **`after_pick` becomes a forced-choice dialog.** Right after "I'd pick this flight" (flight and compare
  pages): a centred dialog over a dimmed page (`role="dialog"`, `aria-modal`, the focus starts on the heading,
  stays inside and returns to the pick button; the page doesn't scroll). No ✕, the backdrop does nothing; the
  visitor chooses "Add to flight – $X" or "No thanks", and **Escape counts as "No thanks"** (to the reasons step).
  The follow-up steps continue inside, all skippable; the last one closes it. It opens only from a pick on that
  page load (a reload never reopens it).
- **Sunset look.** Both surfaces are a light peach-to-apricot gradient (#FFEBD6 → #FFD3AE) with D's navy ink;
  by night a muted dusk (#ECD2BC → #D9B597) with the day ink. `app/d/d-offer-sunset.css` is the only D file
  allowed hues from 18° to 32° (`scripts/d-contrast.mjs`, which also checks the ink on every stop). The Add
  pill stays D's royal blue; "No thanks" is a quiet link, 44 px tall.
- **Copy.** "Add to flight – $4.99" / "– $14.99" (an en dash); items as listed above, the last a lighter
  "And more!" with a plus.
- **The waitlist as a dialog** (placement `d_popup`, docs/INTEREST.md): D's "Want this for your real
  flights?" card, same copy and form, centred over a dimmed page after 30 s of the tab's visible time on D's
  pages (counted across page moves, `pfc.d.visible.v1`). Sign up or "No thanks" (Escape = No thanks); no ✕.
  Once per browser (`pfc.d.popup.v1`, marked when it opens), never for a browser already signed up, and never
  on top of an offer pop-in or dialog, during a page transition or while a form field has the focus (it waits).
  Events: `interest_cta_view`, `interest_signup` and `interest_dismiss`, all with placement `d_popup`.
- **Hero:** "Tell us what matters to you. We'll show you the flights that fit you best."

## The flows (iteration 1; see above for what iteration 2 changed)

1. **Price arm** (`frontend/lib/d/priceArm.ts`, the only place it lives, so it can become a PostHog flag
   later).
   - Drawn with `crypto.getRandomValues` the first time a /d page runs, and kept in localStorage
     (`pfc.d.arm.v1`). It is never re-drawn.
   - `?arm=p499|p1499` forces an arm for that tab's session (sessionStorage). The drawn arm stays stored
     underneath, and every event and row carries `arm_forced: true`.
2. **The offer card.** It is inline, never a pop-up, and is the same card for every flight and every search.
   - **`after_pick`:** right below "I'd pick this flight", once a flight is picked, on the flight page (under
     whichever pick is on screen) and on the compare page (under the table, whose last row is the pick).
   - **`results`:** a list item after the 3rd result, or after the last with fewer. It never shows once the
     after_pick card has shown in that session. A re-sort leaves it in its slot.
   - **Frequency:** once per placement per tab session. "No thanks" or "Add" makes the offer gone for the
     session.
   - **Server rendering:** the card exists only on the client, so the price never exists on the server and
     can't flash.
   - **The cloud:** it gives the card no reaction at all, so "Add" and "No thanks" get exactly the same.
3. **"Add for $X"** shows the fake door, inline:
   1. **Email form.** The email is prefilled with this browser's latest sign-up. Also an optional first name,
      the usual 15-minute-chat box, and an optional "When?" date (today to a year out). It saves a `signups`
      row: source `d`, placement `d_addon`, with the arm, the card's placement, the date and the session's
      UTMs.
   2. **Items.** "Which of these would you actually use?" (the three items plus an equal "None of these"),
      then "What would make this worth it for you?".
   3. **The pricing questions**, if this browser hasn't been asked them yet.
   4. A calm thank-you.
4. **"No thanks"** shows one tap on a reason (Too expensive · I wouldn't use it · Not sure what it is ·
   Something else · Prefer not to say), an optional "Anything else?" and "Done". Then the pricing questions
   (once per browser), then a thank-you. If the visitor leaves the page without pressing "Done", the dismiss
   still counts, with `reason: "none_given"` (or the reason tapped). A row is saved only when something was
   answered.
5. **Pricing questions** (once per browser, `pfc.d.pricing.v1`, whether answered or skipped):
   - the four Van Westendorp questions in dollars ($0–$500, rounded to cents): too cheap to trust, a bargain,
     getting expensive, too expensive to consider;
   - "Per trip, or $29.99 a year for every trip?" (Per trip · Yearly · Neither · Not sure).
6. **General feedback.** A quiet "Tell us what you think" link under the flight and compare pages.
   - It asks "Did Cloud9 make choosing a flight feel easier?" (Yes · A little · No · None of these) and "What
     would make Cloud9 more useful before your next flight?".
   - The link is hidden for the session once an open question in steps 3–4 was answered, or once the
     feedback was sent.

## Storage

- **`d_feedback`** (Supabase; `d_feedback.json` beside `DATA_FILE` in dev; `pfc.d.feedback.v1` in the browser
  with no backend). One row per answered step.
  - Columns: `id`, `created_at`, `session_id` (D's per-tab session id, `pfc.d.session.v1`), `price_arm`,
    `arm_forced`, `placement` (after_pick, results, flight, compare), `kind`, `answers` (jsonb), `utm_source`,
    `utm_medium`, `utm_campaign`, `is_test`, and the full row in `record`.
  - `kind` is `addon_join`, `addon_dismiss`, `pricing` or `general`.
  - Access: RLS on, no policies, server only.
- **API.** `POST /d-feedback` validates strictly (`shared/src/dFeedback.ts`: known kinds, placements, answer
  keys and options only; text cut at 1,000 characters; amounts must be numbers from 0 to 500). It has the same
  rate limit as the other routes. `GET /d-feedback` needs the admin key.
- **`signups`** gains nullable `price_arm`, `arm_forced`, `offer_placement`, `flight_date` and `utm_*` columns,
  plus the placement `d_addon`. Every other sign-up is sent and stored exactly as before.
- **Migration:** `backend/supabase/migrations/2026-11-18_flight_day_pack.sql`. The same SQL is in `schema.sql`.
- **UTMs:**
  - The first D page of a tab session keeps `utm_source`, `utm_medium` and `utm_campaign` (first touch, at
    most 200 characters each; `pfc.d.utm.v1`).
  - D's own links carry any `utm_*` forward: home → results, Change, Swap, other routes, the results' own
    links.
- **Results page:** **Download Flight Day Pack CSV**, beside "Download sign-ups CSV", gives one row per
  answer with `answers` flattened into columns, plus `price_usd`. It follows the page's "Include test
  sessions" filter.

## Events (PostHog, docs/ANALYTICS.md)

Every event from a /d page carries `price_arm` (and `arm_forced` when forced). The test's own events are:

- `d_addon_view`, `d_addon_click`, `d_addon_waitlist`;
- `d_addon_dismiss` (+ `reason`) and `d_addon_items` (+ `items`, keys only);
- `d_pricing_answered` (+ `questions_answered`, a count);
- `d_feedback_open` and `d_feedback_submitted`.

Each one has `placement`, `variant: "D"` and `is_test`. None of them carries an email, a name, typed text, a
dollar amount, the plan answer or the date.

## How to read it

- **Filter first:** `is_test = false` and `arm_forced` not set, in PostHog and in the CSV.
- **Revenue per offer view**, per arm: `d_addon_waitlist` × price ÷ `d_addon_view` (unique users).
- **Revenue per visitor**, per arm: `d_addon_waitlist` × price ÷ unique visitors with a /d `$pageview`.
- **Cross-check** the joins against `signups` rows with placement `d_addon` (one row per email, so it
  undercounts a repeat).
- A join is intent at a price, not a sale: it costs the visitor nothing. Compare the two arms with each
  other, never with real purchase rates.
- With tens of visitors per arm, a difference of a few joins is noise. Report n for every number.
- **Van Westendorp:** plot the four cumulative curves from the pricing rows. The range between "too cheap"
  and "too expensive" crossing the other two is the acceptable range. Few answers make it rough.
- The `after_pick` card only reaches people who picked a flight, so they are more engaged than the `results`
  audience. Read the two placements separately.
