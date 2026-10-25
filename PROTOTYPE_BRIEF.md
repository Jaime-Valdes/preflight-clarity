# Prototype Brief: Cloud9 dashboard test

## Context

We're a student startup team (Allen, Arshad, Jaime, Krish) building software for people with flight anxiety. Discovery interviews and fieldwork gave us these findings:

- **Who we're building for:** people with flight anxiety who (1) have actively tried to fix it, (2) have changed decisions because of it, and (3) still fly at least twice a year.
- **The urgent need:** easing flight anxiety for flights they already have coming up. Today they get by with Valium or melatonin, educational videos, picking tickets carefully (wide-body over narrow-body jets), and turbulence forecast apps like Turbli.
- **Insights:**
  1. Lack of knowledge isn't the problem. They already know flying is safe.
  2. The anxiety *before* a flight can be as bad as the anxiety *during* it.
  3. They care about control and predictability from booking all the way through landing.
- **How we're different:** we focus on the time *before* the flight rather than during it, and we pull weather, flight, forecast, pilot, plane and airline data into one place.

## What this prototype tests

> **Risky assumption:** Giving anxious flyers more predictability and control *before* the flight (through rich, specific data about their flight) lowers their stress and anxiety, both in the months before and right before the flight.

**Test:** show participants a dashboard packed with informative data about their upcoming flight. Then measure whether their anxiety goes down or whether they're still scared. **All data is fake but should look realistic.**

Insight #1 matters here. This test could easily show that more data doesn't help, and that's a valid result. The prototype must **measure the result honestly** and must not nudge participants toward a positive answer.

### What "predictability" and "control" mean in this prototype
- **Predictability:** knowing what's coming. When the bumps will happen, how strong they'll be, what each sound means, and what the timeline looks like.
- **Control:** being able to act on the data. Picking a better seat, comparing flights, choosing a smoother time, setting alerts.

The dashboard should include both, so we can see which one participants respond to.

## User flow (one session takes about 5–8 minutes)

1. **Welcome / consent.** One screen. "We're testing a prototype for nervous flyers. It takes about 5 minutes. All data shown is illustrative."
2. **Pre-survey** (baseline):
   - "Think about your next upcoming flight (or imagine one you'd need to take). Right now, how anxious do you feel about it?" Slider from 0 to 10.
   - "How in control do you feel about that flight?" Slider from 0 to 10.
   - "How predictable does the flight feel to you?" Slider from 0 to 10.
   - Required, on a second screen ("About your flying"): how often they fly per year, what worries them most about flying, and when the anxiety usually starts.
   - Optional: route (origin → destination) and roughly how far away the flight is (<1 week / 1–4 weeks / 1–3 months / 3+ months).
3. **Flight setup.** The participant picks or types an origin, destination and date. The app generates a believable fake flight (airline, flight number, aircraft) from these inputs. Make it deterministic: the same inputs always give the same data.
4. **The dashboard** (the main part, see below). The participant explores it freely. Record time spent and which sections they open.
5. **Post-survey:**
   - The same three 0–10 sliders (anxiety, control, predictability) about the same flight.
   - "Which part of the dashboard, if any, made you feel better?" (multi-select of the sections)
   - "Did anything make you feel *more* anxious?" (multi-select of the sections plus free text)
   - "If this existed for your real flights, how often would you check it in the weeks before?" (Never / Once / Weekly / Daily / Multiple times a day)
   - "Would this replace anything you do today?" (Medication / Videos / Turbulence apps / Choosing flights carefully / Nothing) plus free text
   - Open text: "What would you still be scared of?"
6. **Debrief + thank you.** Remind them that all data was illustrative and not a real forecast. Optional email field for follow-up interviews.

## Dashboard contents (fake data, must look credible)

Use a mobile-first layout. Most participants will open it on a phone.

**Header:** flight number, route, date, aircraft, and a countdown ("47 days until your flight").

**Overall summary card:** a single "Smoothness score" (e.g. 82/100) with a calm one-line summary ("Expect a mostly smooth flight with light bumps during descent.").

**Sections (each one collapsible and tracked separately):**
1. **Turbulence forecast by flight phase.** A timeline/chart across takeoff → climb → cruise → descent → landing, showing the expected intensity (none / light / moderate) and time markers ("Light bumps likely about 25 min after takeoff, lasting about 5 min"). Show a confidence level. For flights months away, use historical route data ("On this route in this month, 88% of flights had little or no turbulence") and add a note that the forecast gets sharper closer to the date. This covers the "months before" part of the assumption.
2. **Your pilot (Uber-style).** Captain name (fake), star rating, total flight hours, hours on this aircraft type, years flying. Same for the first officer.
3. **Your aircraft.** Model (e.g. Airbus A321neo), wide-body or narrow-body, age of this specific plane, safety record for the model, maintenance status ("Last full inspection: 12 days ago").
4. **Airline safety and comfort.** Safety score, on-time rate, comfort score (seat pitch, cabin noise).
5. **Weather.** Conditions at origin and destination around departure and arrival.
6. **Best seat for smoothness.** A simple seat map that highlights the smoothest seats (over the wing), with a "Why?" explanation. *(control)*
7. **What you'll hear and feel.** A timeline of normal sounds and sensations (gear retracting, engine changes, flaps) with plain-language explanations. *(predictability)*
8. **Compare smoother options.** 2–3 alternative flights on the same route with their smoothness scores. *(control)*
9. **Alerts.** A toggle for "Notify me if the forecast changes." This is non-functional and only tracks whether it was tapped. *(control)*

**Tone and design:** calm, reassuring and premium, like an aviation app crossed with a wellness app. Soft colors and generous whitespace. **Don't** use red, alarming language or hard statistics about crashes.

## A/B variant (optional, recommended)
Randomly assign each participant one of two versions:
- **A: Full dashboard** (everything above)
- **B: Minimal** (summary card and turbulence timeline only)

This shows whether *more* data helps or whether a simple, calm summary works just as well. Store the assigned variant with each response. Allow forcing a variant with `?v=A` or `?v=B`.

## Data capture
Save one record per session:
- Session ID, timestamp, variant
- All pre-survey and post-survey answers
- Flight inputs
- Time spent on the dashboard, which sections were expanded and for how long, whether the alert toggle was tapped
- Device type

**Storage:** use Supabase (free tier, one `responses` table) through a small API route. Keep keys in Vercel environment variables. If there's no database yet, fall back to `localStorage`.

**Results page** at `/results?key=<ADMIN_KEY>`:
- Table of all responses, plus CSV export
- Average pre vs. post anxiety, control and predictability, overall and by variant
- % of participants whose anxiety dropped, stayed the same or rose
- Count of which sections were picked as calming vs. anxiety-inducing

## Tech stack
- **Next.js (App Router) + TypeScript + Tailwind CSS**, deployed on **Vercel**
- Charts: Recharts
- Fake data: a seeded generator in `lib/fakeFlight.ts` (same inputs give the same flight)
- No auth. No real flight APIs.
- Keep it simple. It's a test prototype, not a product.

## Build order
1. Scaffold the Next.js app and deploy a "hello world" to Vercel right away
2. Fake flight data generator
3. Dashboard UI (mobile-first)
4. Pre-survey and post-survey flow, plus the debrief screen
5. Event tracking and Supabase storage
6. Results page
7. A/B variant
8. Polish: loading states, check that it works on a phone, add an OG image for sharing the link

## Done when
- A participant can open one Vercel link on their phone and finish the whole flow in under 8 minutes
- Every session is saved, and the team can see pre-vs-post anxiety change on `/results`
- The dashboard looks credible enough that participants react to the data, not to the prototype's rough edges
