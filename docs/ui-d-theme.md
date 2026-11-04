# Version D look — "a calmer way to choose a flight"

The visual layer for the smooth-flight finder at `/d` only (iteration 2, docs/ITERATION_2.md). Inspired by
calm wellness onboarding: a soft sky, big organic shapes in two blues and a warm cream, one friendly
outlined mascot, one flowing ink line, a big bold headline, one line of copy, one black pill button, lots
of air. Versions A, B and C do not change: everything here is scoped to `[data-theme="d"]`
(set once in `frontend/app/d/layout.tsx`) or lives in `frontend/components/d/**`.

## How the scoping works

Tailwind 4 utilities read their colours from CSS variables (`bg-canvas` → `var(--color-canvas)`). Under
`[data-theme="d"]`, `frontend/app/globals.css` remaps the semantic tokens the shared components already
use — `canvas`, `surface`, `line`, `ink-*`, `night-*`, `calm-*`, `breeze-*`, `dusk-*`, `sand-*`, the
shadows, the focus ring and the selection colour — so a header, search form or sign-up card rendered
inside `/d` takes the new look without any of its own lines changing. A, B and C never set the attribute
and keep every value exactly (pixel-compared before and after). D-only components use the new tokens
directly.

## Tokens (`@theme` in globals.css)

| Token | Value | Used for |
| --- | --- | --- |
| `sky` | #D7E9F3 | the page |
| `sky-deep` | #BBD9EA | the big blob, info tints (`breeze-200` under D) |
| `sky-ink` | #355A70 | text on sky-deep (5.0:1) |
| `cream` | #F3E9D6 | the warm blob, the mascot's body, people/wellness tints (`dusk-100`) |
| `sun` / `sun-100` / `sun-ink` | #F2D8A2 / #F8E7BE / #6B4E12 | the middle tier ("Moderate", "Typical cabin"), the mascot's cheeks, the wordmark swash; text 6.3:1 on sun-100 |
| `leaf` / `leaf-100` / `leaf-ink` | #B9E2BA / #DDF1DD / #2F6B36 | the top tiers ("Very smooth", "Smooth", "Large jet", "Roomy and quiet"), good states; text 5.4:1 on leaf-100 |
| `amber` / `amber-100` / `amber-ink` | #EBC98F / #F5E3C3 / #6A4A14 | the lower tiers ("Slightly bumpy", "Bumpy", "Smaller jet", "Fuller and livelier"); warm, never red; text 6.4:1 on amber-100 |
| `ink` / `ink-soft` / `ink-mute` | #1F1F1F / #3B3D3F / #4F6373 | headlines and outlines / body (ink at 85%, 8.8:1 on sky) / secondary text (5.0:1 on sky) |
| `slate` | #9CB1BE | inactive dashes, rules, dividers only (1.8:1 — never for text) |

Semantic remaps under `[data-theme="d"]`: `night-*` → ink (primary buttons, the brand tile), `calm-*` →
leaf scale, `breeze-*` → sky scale, `dusk-*` → cream/sun scale, `sand-*` → amber scale, `surface` → white,
`line` → #C6DAE6. Surfaces are white on sky with the soft shadow; the 2 px ink outline is reserved for the
mascot, the category icon badge, the secondary button and the flight path — not for cards.

## Type

Manrope (already loaded for the whole app via `next/font`), two roles: headlines 800 at 38/48/56 px
(phone/tablet/laptop), line-height 1.08, letter-spacing −0.025em, `ink`; body 17 px, line-height 1.6,
`ink-soft`. Tier labels on cards 24 px / 800 in the tier's dark hue. Eyebrows 12 px bold uppercase
`ink-mute`. Wordmark "Cloud 9": the same face at 26 px / 800, tight, with a sun swash underneath
(`components/d/brand/Wordmark.tsx`).

## Components (`frontend/components/d/brand/*`)

- `CloudMascot` — the Cloud9 cloud as a character: one closed outline (ink 4 px, round joins), cream fill,
  dot eyes that blink, a smile, sun cheeks. Inline SVG. Floats ±4 px over 4.5 s. On the intro (and later:
  empty states, "Checking the skies…").
- `FlightPath` — one curved ink stroke that draws itself in (`pathLength="1"`, dash offset 1 → 0, 1.2 s,
  ease-out) and a tiny outlined paper plane that eases along it with CSS `offset-path` (1.3 s). Browsers
  without motion paths, and anyone with reduced motion, see the plane resting at the end.
- `Blobs` — three border-radius shapes (sky-deep, cream, a little leaf) behind the intro, drifting 6 px
  over 24–32 s.
- `ProgressDashes` — short rounded dashes, active ink, inactive slate.
- `CategoryIcon` — one outlined icon per rating category (waves, plane taking off, plane, armchair), from
  the icon set already in the app, stroke 2.25.
- Buttons: primary = full-width black pill, white 17 px bold label, trailing arrow; secondary = 2 px ink
  outline pill on the page colour; one primary per screen. Press: scale 0.98 over 120 ms.
- Flight card (`components/d/search/DResultCard.tsx`): white, 24 px radius, soft shadow. Airline and fare
  on the first line; then the focal block — a tint in the lead rating's tier with the outlined icon in a
  white ink-ringed badge, the category as an eyebrow, the tier in 24 px words, the one-line meaning; the
  second rating as a small pill; "Why?" slides the basis and the reasons open in place (the full numbers
  stay on the flight page). Then the times, then Compare (outline) and Details (text link).

## Motion

All of it respects `prefers-reduced-motion` through the global rule in globals.css, which ends every
animation on its resting frame (lines fully drawn, planes landed, eyes open, blobs still).

| What | How |
| --- | --- |
| Section / element enter | `animate-d-rise`: fade + 10 px rise, 400 ms, ease-out, staggered 60 ms |
| Mascot | `animate-d-float` ±4 px / 4.5 s; `animate-d-blink` one quick blink per 4.2 s |
| Flight path | `animate-d-draw` 1.2 s after 0.25 s; plane `animate-d-fly` 1.3 s after 0.45 s |
| Blobs | `animate-d-drift` / `-slow` 24–32 s, 6 px |
| Buttons | scale 0.98 on press, 120 ms |
| "Why?" on a card | grid-rows 0fr → 1fr, 300 ms ease-out; chevron turns |
| Reduced motion | the global rule ends every animation on its resting frame; inside the theme the entrance delays are zeroed too, so nothing appears late |
| Never | bounces, shakes, pulses, anything fast, anything red or orange |

## Rules that outrank fidelity to the reference

- Never red. "Bumpier" is amber, "moderate" is sun, "smooth" is leaf. Nothing reads as a warning.
- The plain-language tier words are the hero of every card; numbers and specs stay one tap away.
- One focal point and one primary action per screen; generous whitespace.
- Everything behind the look — routes, query parameters (`?v=`, `?p=`, `?test=1`), forms, PostHog event
  names, Supabase calls, the sign-up — is unchanged.
- AA contrast on `sky` and `cream` for every text colour (ratios above); keyboard focus is a 2 px ink
  ring; headings stay semantic; buttons are buttons.
- Inline SVG only, no new assets, no new runtime dependencies.

## What each screen does with it (Phase 2, branch `ui/milo-refresh-d`)

Every `/d` screen now wears the look; the shared version C pieces D borrows take it through the token
remap and, where a visual needed a switch, an optional prop whose default is C's exact old look
(`HomeSearch tone="light"`, `FlightPage` / `ComparePage` `loading`, `FareCard compareTone="outline"`). Nothing behind the look changed —
the same routes, query parameters, forms, PostHog event names, Supabase calls and sign-up (diffed against
`main`: no analytics, routing or sign-up line differs).

| Screen | The look |
| --- | --- |
| Intro (`/d`) | Phase 1: blobs, mascot on the drawing path, the headline, "Let's begin". Progress dashes 1 of 3. |
| What matters (`PrioritiesSetup`) | Dashes 2 of 3; the question in the headline face; the four categories as soft sky tiles with the outlined category icon, which turns into the rank number on ink once tapped; "Next" is the black pill, "Skip for now" / "Start over" quiet text. Answered: the compact summary with ink number badges and an outline "Change". The placeholder keeps the summary's height. |
| Where and when (`DHome` + `HomeSearch tone="light"`) | Dashes 3 of 3 on a white card; the form as it was (black "Search flights"); the popular routes as sky chips in ink instead of C's night block. |
| Results (`DResults`) | Loading: the mascot and "Checking the skies…". The priorities strip is the small reassurance beat: the mascot beside "Rated for you: … · Change what matters". Filters: a white card on laptops, an outline pill on phones. The cards (Phase 1) rise in one after another, 60 ms apart. Empty states (no match, nothing left, no nonstops, a bad link) show the mascot, one bold line, one quiet line and at most one black pill. |
| Flight (`DFlightDetail`) | `DFlightHeader`: the boarding-pass facts on a white card — airline, flight number, the route codes in the headline face with the ink path drawing itself between them and the paper plane at its end, countdown chip in leaf, date, a dashed slate rule, then departs / duration / arrives, aircraft and gate or terminal. "Your pick": the fare in the headline face, the black pill (leaf with a leaf-ink ring once picked). Reassurance cards: outlined icons on cream / sky / leaf tints. "Rated for you": rows with the category icon on the tier's tint, the tier in 20 px words in its dark hue, the meaning and the basis; each opens the sheet. "More detail": the same card shape with an outlined layers icon. The shared fare card takes an outline look for its compare controls (an optional prop, C unchanged), so the pick is the column's one black pill. |
| Rating sheet (`RatingSheet`) | The tier on its tint with the outlined icon; factors marked leaf (helps), amber (weighs on it) or sky (neutral); the numbers on a soft sky list. |
| Compare (`DCompareTable`, `DCompareEmpty`) | The table on a 24 px white card; group rows with outlined icons; markers ("Cheapest", "Smoothest for you") in leaf; "Details" as outline pills; "Pick" tiles in ink / leaf. Fewer than two flights: the mascot, the headline face, the black pill. |
| Loading (`DLoading`) | The mascot floating over "Checking the skies…", in place of the three skeletons; `role="status"`. |
| Everywhere | `h1` is weight 800 under the theme (the shared summary and compare headings included; inner lines set their own weight). A 2 px ink focus ring, except on text fields, selects and the date picker, which keep the shared blue ring so a focused field never shows two rings. Sun text selection. Under reduced motion the staggered entrances start at once (their delays are zeroed inside the theme). The remapped `calm-500`, `breeze-500`, `dusk-600` and `ink-400` are darker than a straight hue swap, so white or small text on them (the top bar's compare count, airline tiles, placeholders) stays at AA. |

Known small inconsistency, left alone on purpose: the shared pills inside the results summary ("Swap", "Change")
and the shared sign-up card keep C's thin line ring, since those components are shared with A, B and C and
only tokens may change them.
