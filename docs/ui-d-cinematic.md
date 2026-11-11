# Version D look, pass 3 — "Window Seat"

The build contract for the cinematic pass on `/d` (branch `ui/d-cinematic`). It replaces the palette and motion
sections of `docs/ui-d-theme.md`; the scoping mechanism described there stays. Where this file is silent, follow the
director's treatment, then the animator's for how the cloud acts, then the interaction designer's for small
interactions (paths at the end). Where they disagree with this file, this file wins.

The owner's request: the colours should pop; the cloud should move around with the cursor and look at the flights the
visitor looks at; moving between pages should show planes flying across; more creativity, like a movie; small
animations on clicks and scrolls; enjoyable, warm and comforting.

## 1. The idea

One visit is one calm flight through a fair-weather day, seen from the window seat.

- **One sky, never cut.** A fixed sky sits behind every `/d` page and survives navigation. Each page is a camera
  position in that sky (four lit scenes). The backdrop is never swapped, it moves.
- **Inside and outside.** Everything you read sits on warm paper cards (the cabin). Everything that glows or moves is
  outside the window: sky, sun, clouds, planes, the companion. Scenery never competes with text.
- **The cut is a plane.** A paper plane crosses left to right towing a ribbon of cloud, and the ribbon wipes the old
  page away. Most of the screen always shows a page.
- **A character with eye-lines.** The Cloud9 cloud sits on the edge of whatever the visitor attends to and looks where
  they look. It treats every flight identically.

House rules (they settle most decisions):

1. **Scenery animates; content settles.** Words and controls are readable and tappable in the first frame. Content
   that arrives with a page moves by at most 18 px and never starts invisible. Only sky, sun, clouds, planes and the
   mascot perform.
2. **Royal blue is for doing, gold is for light, and green / yellow / amber only ever mean a rating.** No control,
   selection state or decoration borrows a tier hue (so "Compare on" and "Your pick" are blue, not leaf).
3. **Feedback is symmetric and blind.** Adding and removing, picking and withdrawing get the same response, and no
   animation, colour or mascot behaviour ever reads a flight's rating, price, airline or place in the list.
4. **What you see is what you can tap.** Motion never queues, delays or hides a tap target.
5. **Fair weather only.** No grey or dark sky, no rain, no lightning. Planes fly level or climb a few degrees: no
   dives, banks, shakes or wobble. Nothing bounces. Never red, rose, coral, pink or orange.

## 2. Colour

Tokens live in the second `@theme` block of `frontend/app/globals.css` (D-only names) and in the re-pointing block
under `[data-theme="d"]`. New token names must not collide with Tailwind defaults.

| Token | Hex | Role |
| --- | --- | --- |
| `ink` / `ink-soft` / `ink-mute` | #14213D / #27344F / #3A4A66 | headlines, outlines / body / secondary text. Navy, not black |
| `ink-faint` | #507295 | placeholders only: 4.94 : 1 on paper, visibly lighter than typed text |
| `slate` | #9BB8D3 | rules, inactive dashes. Never text |
| `sky` / `sky-deep` / `sky-ink` | #D4EBFB / #A5D5F8 / #1F5A85 | flat tints (tiles, chips, the fallback page colour) / info tint / text on sky tints |
| `surface` (re-pointed) | #FFFDF8 | cards: "paper" |
| `line` / `line-strong` (re-pointed) | #C9DFF1 / #6890B8 | hairlines / field and pill outlines |
| `royal` / `royal-hover` / `royal-press` / `royal-100` | #1D49BC / #2A59D4 / #163A9A / #DFE9FE | every primary and selected control / hover / pressed and the button's lip / tint of a selected outline control |
| `gold` / `gold-deep` / `butter` | #FFC53D / #F4B428 / #FFE08A | sunlight: sun disc, swash, cheeks, rank coins, tap ring / coin rim / selection, link highlighter |
| `cream` / `cream-deep` | #FFF4DC / #FCE7B4 | mascot body, warm tints / belly shade, cloud undersides |
| `leaf-100` / `leaf` / `leaf-ink` | #D2F4D5 / #AFE4B5 / #2B5C34 | top rating tiers only |
| `sun-100` / `sun` / `sun-ink` | #F4EAC1 / #E5D594 / #604E06 | middle tier only |
| `amber-100` / `amber` / `amber-ink` | #FCE7C1 / #F0CF94 / #694909 | lower tiers only |

The three tier families are built in OKLCH with one lightness and one chroma per step (tint 0.935 / 0.055, solid
0.87 / 0.085, text 0.43 / 0.085), so no tier shouts. Amber is lighter and no redder than before.

Re-pointing of the shared scales under the theme: `canvas` = sky; `ink-900/700/500/400/300` = ink / ink-soft /
ink-mute / ink-mute / slate; `night-950/900/800/700` = royal-press / royal / royal-hover / #3C6BE0 (shared primaries
and selected states turn royal); `calm-*` = the leaf scale (`calm-500` #27763B, `calm-600` #2E8043, `calm-700`
leaf-ink); `breeze-*` = the sky scale (`breeze-500` #1D6CA6, `breeze-700` sky-ink); `dusk-*` = the cream scale
(`dusk-100` cream, `dusk-200` cream-deep, `dusk-600` #6F5210); `sand-*` = the amber scale. Checkboxes and sliders take
`accent-color: royal`.

Sky gradients, one per scene (`linear-gradient(180deg, …)`); each passes through a near-white stop so blue never
turns green on its way to butter:

| Scene | Page | Stops |
| --- | --- | --- |
| First light | home | #7EC3F4 0%, #AEDAF9 34%, #E3F1FC 60%, #FBF7EC 74%, #FFF1CC 87%, #FFE3A0 100% |
| The climb | results | #8CCBF5 0%, #C3E4FA 45%, #EDF6FD 80%, #FFF9EA 100% |
| Above the clouds | flight | #86C8F6 0%, #B7DEF9 40%, #E7F3FD 75%, #FCFDFE 100% |
| Golden afternoon | compare | #93CDF5 0%, #CBE7F9 36%, #FBF7EC 60%, #FFEFC4 80%, #FFDF96 100% |

Sun: `radial-gradient(circle closest-side, #FFE9A8 0, #FFD45F 50%, #FFC53D 69.5%, rgb(255 246 222 / .62) 71%,
rgb(255 250 236 / .30) 86%, rgb(255 252 244 / 0) 100%)` on a square 1.44 times the disc. No blur filter.

Surfaces and controls:

- **Cards:** `surface`, 24 px radius, shadow `0 2px 4px rgb(20 33 61 / .05), 0 16px 34px -18px rgb(20 33 61 / .30)`.
  Lifted: `0 2px 6px rgb(22 60 120 / .07), 0 22px 40px -18px rgb(22 60 120 / .30)`. Tailwind inlines shadow values,
  so set them with `[data-theme="d"] .shadow-soft { --tw-shadow: … }` (and `.shadow-lift`), not with `--shadow-*`.
- **Primary button:** a royal pill with a lip: white 17 px / 800 label, `box-shadow: inset 0 -3px 0 royal-press,
  0 8px 18px -10px rgb(29 73 188 / .55)`. Disabled: `sky-deep` fill, `ink-mute` label, no lip.
- **Outline button:** 2 px `ink` inset ring on transparent. Selected: `royal-100` fill, `royal` ring and label.
- **Header:** transparent over the sky, no border, no blur; inactive links `ink`, the active link on a `surface` pill.
- **Tray and sheets:** solid paper, no `backdrop-filter` anywhere under the theme (a moving sky behind a blur
  re-blurs every frame). Sheet scrim: `rgb(22 58 154 / .38)`.
- **Focus:** the 2 px `ink` ring at 3 px offset stays; fields keep one ring (`breeze-500`) plus a 4 px `sky` halo.
- **Selection:** `butter`.

Contrast is checked by script, not by eye: `frontend/scripts/d-contrast.mjs` (created by the theme work) computes
every text / background pair this look relies on, including the darkest point of each sky, and fails under 4.5 : 1
(3 : 1 for 24 px+ or 19 px+ bold text and for non-text marks). It also fails on any token whose hue is red, pink or
orange. Run it after any colour change: `node frontend/scripts/d-contrast.mjs`. Lowest text pairs today: white at 70 %
on `royal` (the chosen day's small print) at 4.60 : 1, then `ink-mute` on the deepest sky (#7EC3F4) at 4.68 : 1.

Rulings from the foundation review:

- **Airline tiles are all the same:** `ink` with a white code. The shared tile picks one of seven tones from the
  airline's code, and under this theme three of those are tier colours; one scoped rule makes every tile ink.
- **Chips that are not ratings are never leaf, sun or amber.** "Cheapest", the days-until-the-flight chip and the like
  use `sky` with `ink` text (or `royal-100` when they mark a selection). Leaf, sun and amber stay on rating words,
  rating tints and the "Smoothest" marks that compare ratings.
- **Shared "in compare" states are royal**, like D's own (`royal-100` fill, `royal` ring and label), by scoped CSS.
- **Placeholders are lighter than entered text** (a mid slate-blue that still passes 4.5 : 1 on paper), so an example
  never reads as an answer.

## 3. Scoping and layers

- Everything is scoped to `[data-theme="d"]`, to D-only files, or to `html[data-d-on]`: an attribute a tiny client
  component (`DScope`, mounted in the `/d` layout) sets on `<html>` in a layout effect and removes on cleanup. Use it
  for anything that must reach outside the themed `<div>`: the `::view-transition-*` rules, the `<body>` colour, and
  **sheets**, which portal to `<body>` and today wear version C's tokens. Give the sheet root
  (`html[data-d-on] body > div:has(> [role="dialog"][aria-modal="true"])`) the same token re-pointing as the theme
  (variables only, not the background paint). Do not use `:has([data-theme="d"])` on `html`: hidden kept-alive pages
  would keep matching.
- Unlayered `[data-theme="d"] …` rules beat Tailwind utilities, including those on D's own components. Put defaults
  that utilities should be able to override in `@layer base`.
- `frontend/app/d/layout.tsx` exports a `viewport` with `themeColor: "#7EC3F4"` so the phone's browser bar is sky.
- The layout root (`[data-theme="d"]`) is `position: relative; isolation: isolate; overflow-x: clip`. Layers inside it:

| z-index | Layer |
| --- | --- |
| -1 | `DSky` (fixed, `height: 100lvh`, pointer-events none) |
| auto | header, main, footer |
| 20 | the companion cloud (absolute, in document coordinates) |
| 30 | compare tray, suggestion lists (existing) |
| 40 | `DMotionLayer` (fixed; tap ring, the fly-to-tray plane) |
| 50 | sheets, skip link (existing) |
| above all | the page transition's pseudo-elements |

- Decorative layers are `aria-hidden`, `pointer-events: none`, never focusable, never tappable, fire no analytics
  events and put nothing in the URL. No per-frame DOM writes: drive motion with CSS (animation, transition, scroll
  timelines) or the Web Animations API, and change a class, attribute or custom property only when a state changes
  (at most about 12 times a second on one small node, while the pointer moves).
- No `position: fixed` or sticky element may sit under an ancestor with `transform`, `filter`, `will-change` or
  `contain: paint`. Entrance animations use `backwards` fill, never `both` (a finished `both` keeps a transform and
  breaks the suggestion lists' stacking).
- No text or `<span>` is added inside existing buttons and links (it renames their click events), and no visible or
  screen-reader copy changes.
- Kept-alive pages: Next keeps visited pages in the DOM hidden (`display: none`). `querySelector` can return hidden
  nodes: filter with `el.checkVisibility()` or use IntersectionObserver. Effects re-run on every return.

File ownership for the foundations:

| Area | Files |
| --- | --- |
| Theme, shell, sky, page transition | `frontend/app/globals.css` (the Version D part only), `frontend/app/d/layout.tsx`, `frontend/app/d/d-sky.css`, `frontend/app/d/d-transition.css`, `frontend/components/d/sky/**`, `frontend/components/d/brand/DScope.tsx`, `frontend/components/d/brand/DPageTransition.tsx`, the four `frontend/app/d/**/page.tsx` (only to add the transition stage), `frontend/scripts/d-contrast.mjs` |
| The cloud | `frontend/app/d/d-cloud.css`, `frontend/components/d/cloud/**`, `frontend/components/d/brand/CloudMascot.tsx` |
| Motion kit and control feedback | `frontend/app/d/d-motion.css`, `frontend/components/d/motion/**`, `frontend/components/d/brand/buttons.ts` |

File ownership for the screen pass (each screen also owns one stylesheet, loaded after the kit):

| Screen | Files |
| --- | --- |
| Home | `frontend/app/d/d-home.css`, `frontend/components/d/home/**`, `frontend/components/d/setup/**`, `frontend/components/d/brand/{FlightPath,ProgressDashes,Wordmark}.tsx` |
| Results | `frontend/app/d/d-results.css`, `frontend/components/d/search/**` |
| Flight | `frontend/app/d/d-flight.css`, `frontend/components/d/flight/**`, `frontend/components/d/ratings/**`, `frontend/components/d/brand/CategoryIcon.tsx` |
| Compare and the small states | `frontend/app/d/d-compare.css`, `frontend/components/d/compare/**`, `frontend/components/d/brand/Loading.tsx`, `frontend/app/d/not-found.tsx`, `frontend/app/d/error.tsx` |

The `d-*.css` partials are plain CSS imported by `frontend/app/d/layout.tsx` (no Tailwind directives; use
`var(--color-…)`, real class names prefixed `d-`, keyframes prefixed `d-`). Every selector in them starts with
`[data-theme="d"]`, `html[data-d-on]` or a `.d-…` class that only D renders.

## 4. The sky (`DSky`)

A client component, first child of the layout root: `position: fixed; top: 0; left: 0; width: 100%; height: 100lvh;
z-index: -1; pointer-events: none; overflow: clip`. It reads the pathname and sets `data-scene="home | results |
flight | compare"` (anything else under `/d` uses `results`). Only `opacity`, `translate` and `scale` animate.

Layers, back to front: **air** (four stacked gradient divs, the current scene's opaque, cross-fading over 700 ms);
**sun** (hidden on home, where the hero has its own in-flow sun; a warm corner on results and flight; half behind the
deck on compare); **far cloud**, **mid cloud**, **near clouds** (flat white / cream SVG silhouettes, no outline, no
face, so the outlined mascot is the only character; they drift 8 to 12 px over 36 to 60 s); **cloud deck** (two wide
scalloped bands along the bottom edge, below the frame on home and results, surfacing on flight, butter-lit on
compare). Positions and sizes per scene: director's treatment, section 3. On a page change every sprite travels to
its new place with 900 ms `cubic-bezier(0.22, 1, 0.36, 1)` transitions, near layers 80 ms after far ones: the camera
climbs. Phones under 640 px use three clouds.

Depth: scroll parallax with `animation-timeline: scroll(root)` over the first 1200 px (progressive enhancement, no
scroll listener); pointer parallax of a few pixels for fine pointers only (first thing to cut). Reduced motion:
scenes switch with no transition, nothing drifts, no parallax; the still frame is the design.

As built (accepted departures from the director's positions, all in `d-sky.css`): the sun stays on the right all day
(a corner on results, beside the boarding pass on wide flight pages, setting behind the deck on compare), so nothing
crosses the frame between scenes; the far cloud keeps to the left gutter on laptops and looks in from the right edge
on phone results, so no bright sprite sits under a caption; the home's sky sun is parked outside the frame (the hero
has its own, `.d-sun`); the corner sun is sized by its distance to the header's last link; the deck is never narrower
than 820 px. Hooks for screens: `.d-sky[data-scene]` precedes header, main and footer (a sibling selector can read
it), `.d-sun` with `--d-sun` (disc diameter) draws the sun in flow, `<DSkyCloud shape="wide" | "round" />` draws a
flat scenery cloud.

## 5. The cloud

### The rig (`CloudMascot`)

Same 120 x 96 viewBox and body path, regrouped so parts can move; same props, still server-renderable.

- Body: cream fill with a soft vertical gradient to `#FFF1CF`, 4 px `ink` outline, a white rim light at the top left
  (`M27 43C29 36 35 33 40 35`), a `cream-deep` belly shade clipped to the body.
- Face group (cheeks, eyes, mouth) shifts by `--gx` / `--gy` (-1 to 1): the eyes travel about 1.4 x 1.2 units with a
  90 ms transition, the whole face about 3 x 2.4 units with 180 ms, so a look reads as a head turning even at 60 px
  (multiply the travel by 1.5 under 112 px wide). Each eye has a small white catch-light that does not move.
- Cheeks `gold`. Eyes: open / happy arcs / closed arcs. Mouth: smile / wide. States swap by opacity (no path
  morphing). Blink: 70 ms closing, 20 ms shut, 110 ms opening.
- Moods (`data-mood`): **calm** (default), **curious** (leans up to 3° toward the look), **nod** (down 2.5 px with
  `scale(1.03, .96)` in 120 ms, back in 180 ms, one blink), **glad** (happy eyes, wide smile, cheeks 1.15, 900 ms).
  It is never sad, worried, surprised or sleepy, and it has no eyebrows. Squash and stretch never exceeds 6 %. It
  moves like a cloud: all glide, no bounce.

### Gaze

One passive pointer / touch listener for the whole layout (throttled to one write per cloud every 50 to 80 ms)
aims every visible cloud at the pointer, or at the thumb while a finger is down; 600 ms after the finger lifts, or
after 6 s without pointer movement, the eyes return to the visitor. Idle looks only go up or to the reader.

### Where it lives

There is one roaming cloud, the **companion**, plus the inline **stage** clouds that exist today (home hero, loading,
empty states, not-found and error).

- **Stages** (`data-cloud-stage`): the large inline clouds, with gaze. While a stage is at least 30 % visible the
  companion stays away.
- **Home** (`data-cloud-home`): a small inline cloud where the companion starts on a page, never on a flight: the
  "Rated for you" strip on results, the route line of the flight header, the heading row or the label column's corner
  on compare. When the companion leaves for a seat, the home cloud hides; when it returns, it shows.
- **Seats** (`data-cloud-seat`): in-flow cards the companion can sit on. It perches on the seat's **top edge**: about
  60 px wide, its base 6 px over the card's top padding, the rest in the gap above (D's card lists keep at least 24 px
  between seats, and 28 px above the first one, so it only ever overlaps sky and empty padding). It never covers text
  or a control, and sticky elements (the filters column, the flight page's side column, the tray, the compare label
  column) are never seats. On compare no flight column is ever a seat.

The companion is one absolutely positioned element in the layout root, placed in document coordinates with
`translate`, so it scrolls with its card for free; a 420 ms `cubic-bezier(0.22, 1, 0.36, 1)` transition glides it
between places. It re-measures on a seat change, on pointer movement (throttled), on resize and when the page's
height changes.

- **Mouse:** after a 140 ms dwell the seat is the one under the pointer, and the cloud slides along its top edge
  following the pointer's x (kept 40 px inside the card). Outside any seat it stays where it is and keeps looking at
  the pointer. This is "the cloud moves with the cursor and looks at the flight you look at". As on touch, when that
  seat's top edge is off the top of the screen the cloud sits on the next seat whose top edge is on screen, so it
  stays in view while a long card is under the pointer.
- **Touch:** the seat is the one crossing a line 40 % down the screen (one IntersectionObserver, no scroll handler),
  or a seat the visitor tapped in the last 4 s. When that seat's top edge has scrolled off the top of the screen, the
  cloud moves to the next seat whose top edge is on screen, so on a list of cards it is always in view: it sits in the
  gap just above or just below the card being read. It sits right of centre (about 72 % along the edge) and watches
  the thumb. During a fast fling it waits and settles where the scrolling slows.
- **Clearance:** the cloud's ink rises about 24 px above a seat's top edge (26 px from 640 px wide). Leave 24 px
  between seats, and at least 30 px (32 px from 640 px) between a seat and a control or a line of text above it.
- **As built:** a top edge counts as gone once more than 2 px of the cloud's outline would be cut, and has to come
  40 px back down before the cloud returns to it (a nudged page does not bounce it). The cloud glides only between
  two places that are both in view; otherwise it appears at the seat (a 10 px rise and a fade) and is simply home when
  an unseen home scrolls back. While hidden it is parked at the layout root's corner, so it never adds to the page's
  height. After about 6 s without input the stage and home clouds glance up once; the companion never does.
- **Keyboard:** the seat that contains focus.
- **It never arrives first.** On a fresh page it is at home, on no flight, and it reaches a flight only after the
  visitor's own hover, scroll, tap or focus. Every seat gets the same pose, look and timing.

### Reactions

Called from D components as `cloudReact(kind)`; the call carries a kind and nothing about a flight.

| Event | Reaction |
| --- | --- |
| A priority ranked or un-ranked; compare added or removed; "I'd pick this flight" picked or withdrawn | **nod**, identical in both directions and for every flight |
| "Why?" opened | **curious** for 800 ms |
| The setup answered | **glad** |
| A page change | the eyes follow the plane, then return to the visitor |

The pick is acknowledged, not celebrated: a nod says "noted". The cloud is not tappable and nothing invites a tap on
it (stray taps would inflate the study's click counts). The cloud code imports nothing from the ratings, fare or
search modules.

Reduced motion: no companion at all. Stage and home clouds are still drawings: eyes forward, no float, no blink.

## 6. The page transition

Mechanics: the proven recipe in the proof report (React's `<ViewTransition enter="d-plane" default="none">` around a
1 x 1 px fixed stage, rendered as the **first child of each `/d` page's fragment, outside its Suspense boundary**;
the root's old snapshot held by CSS; the artwork painted as backgrounds on the stage's `::view-transition-group` and
`::view-transition-image-pair`; rules scoped to `html[data-d-on]`). It fires for page-to-page moves by link or
`router.push`, never for sort, filter or date changes, Suspense reveals, the first load or browser Back / Forward
(which stay instant). Nothing shared is edited.

The picture is a **wipe**, not a white-out. One clock, `--d-vt: 760ms`, everything linear (a plane that neither
speeds up nor slows down is the calmest plane there is):

- The **seam** travels left to right, from `--d-vt-from` to `--d-vt-to`. Old page right of it, live new page left of
  it.
- The **old page**: `::view-transition-group(root)` gets `overflow: clip` and travels with the seam on the same
  clock, while `::view-transition-old(root)` counter-moves by the same amount, so the image stands still and its clip
  edge travels. The group is padded 100vw to the right (and its image-pair gives that width back), so the clip box
  and the ribbon share one start, one end and one linear clock and cannot fall out of step: there are no keyframe
  percentages to keep in sync. Transform only: it stays on time when the main thread is busy.
- The **ribbon**: a tall, soft column of cumulus centred on the seam (white core, cream lee side, scalloped on both
  edges, a few loose puffs trailing): 30vw wide on phones (120 px at most), 176 px from 1024 px. It hides the join.
- The **plane**: the outlined paper plane (white fill, `ink` outline, a short `gold` contrail), 52 px on phones,
  72 px on laptops, nose up about 5°, flying ahead of the ribbon in clear air and climbing about 3vh over the
  crossing. It enters at the height of the tap that caused the move (`--d-tap-y` on `<html>`, clamped to 18vh to
  72vh; 42vh by default).
- Taps on the still-visible old page are swallowed (they would land on things not on screen); everything left of the
  ribbon is live at once.
- If the wipe cannot be made solid in Chrome (seam visible, mistimed, wrong hit-testing), fall back to the proof's
  verified full-cover bank and say so.
- Reduced motion: no plane, no ribbon; the old page fades into the new one in 150 ms.
- **No dead time at either end.** The travel is fitted to the artwork in six width bands (from 0, 400, 530, 750,
  1024 and 1640 px), so on every width the plane's nose is on screen within 45 ms of the first frame and the last
  puff leaves within 30 ms of the end (at 1440 px: 35 ms and 23 ms). The travel is published per band as plain custom
  properties on `html[data-d-on]`: `--d-vt-from` and `--d-vt-to` (the seam's start and end, in vw) and `--d-vt-lead`
  (how far the plane's middle flies ahead of the seam); the cloud's eyes read them to follow the plane.
- **The artwork and the travel table are generated.** `frontend/scripts/d-transition-art.mjs` writes the two marked
  blocks of `d-transition.css` (the drawings as data URIs, the bands); `--check` exits 1 when the stylesheet is
  stale. Change a size or a drawing there, not in the CSS.
- A route seen for the first time shows its loader through the wipe and its content when the wipe ends (React holds
  the reveal). Once a route's code is loaded, the content is there in the first frame.
- Testing note: do not take a screenshot between the tap and the transition's first frame. A capture in flight while
  the browser pictures the old page makes that picture blank (a white field for the whole wipe), which no visitor
  ever sees. Use a screencast, or slow the clock (`html[data-d-on]:root{--d-vt:4000ms}`) and wait a moment.

## 7. Motion kit

`frontend/components/d/motion/` and `frontend/app/d/d-motion.css`. Easings: **out** `cubic-bezier(0.22, 1, 0.36, 1)`,
**in-out** `cubic-bezier(0.45, 0, 0.25, 1)`. Durations: press 100 ms, quick 160 ms, move 320 ms.

| Piece | What it is |
| --- | --- |
| `DMotionLayer` | Client component mounted once in the layout: fixed, z 40, pointer-events none. Draws the **tap ring** (a 44 px ring, `gold` inside and white outside, growing from the tap point and fading over 420 ms; three pooled elements; on `click` with a pointer, never on scroll starts or keyboard) and sets `--d-tap-y` on pointer-down. Exposes `flyTo(fromRect, toRect)`: a 14 px paper plane on a shallow arc, 520 ms. |
| `motion.ts` | `prefersReducedMotion()`, easing and duration constants, `animateOnce(el, preset)` for Web Animations API presets: `pop` (a glyph of 28 px or less arriving: scale .6 to 1, at most 8 % past), `stamp` (scale .8 to 1), `settle` (10 px rise, no fade). |
| `buttons.ts` | Class strings: `D_PILL_PRIMARY` (royal with the lip), `D_PILL_OUTLINE`, `D_PILL_SELECTED`, `D_LINK`. |
| CSS classes | `.d-btn-primary`, `.d-btn-outline`, `.d-link` (a `butter` highlighter grows under the words on hover or press), `.d-lift` (card hover: 3 px up, lifted shadow, fine pointers only), `.d-reveal` (scroll reveal: rise 16 px as the element enters, `animation-timeline: view()`, position only, opacity untouched, nothing where unsupported), `.d-route-plane` (the small plane on a card's time line travels along it as the card crosses the screen; scroll-driven; the same for every card), `.d-pop`, `.d-stamp`. |
| Shared controls | Scoped CSS gives shared primaries (`:is(button, a).bg-night-900`) the same lip, hover and press; fields the focus halo; date tiles, sort pills, chips and rating rows their hover and press. |

Hover styles sit inside `@media (hover: hover) and (pointer: fine)`. Press feedback starts on pointer-down and the
action is never deferred. Nothing overshoots in position, nothing loops beside text, nothing shakes.

Also in the kit: `ringFrom(el)` (the one soft royal ring that leaves a control, for pick and withdraw alike),
`flyToTray(control)` / `flyFromTray(index, control)` in `motion/tray.ts`, the classes `.d-chip`, `.d-row`,
`.d-settle`, and the custom properties `--d-ease-out`, `--d-ease-in-out`, `--d-press`, `--d-quick`, `--d-move`.
The kit's rules are unlayered: on an element wearing a `.d-btn-*` class, `bg-*`, `ring-*`, `shadow-*`,
`transition-*` and `active:scale-*` utilities lose, so never put two looks on one element.

**Entrances.** `animate-d-rise` (the entrance D already uses) moves 12 px and never fades: the keyframes change
position only, so a card is readable in its first frame and nothing shows through it. Entrance animations replay
when a kept-alive page is shown again; with position only that is a small settle, which is fine.

## 8. Small interactions

The director's table (section 6 of that treatment) is the list, with these rulings:

- Primary and selected controls are royal, not navy; no sheen.
- Compare add: the plus becomes a check, the pill takes `royal-100` with a `royal` ring, a small plane flies to the
  tray chip, the cloud nods. Remove: the mirror, the same nod.
- "I'd pick this flight": press, the pill cross-fades to `royal-100` with its `royal` ring, one soft ring expands
  from the pill. Withdrawing gets exactly the same. No confetti, no sparkle, no filled heart.
- Priority tiles: a tapped tile fills royal, its badge becomes a `gold` coin with the rank number popping in.
- The card stagger keeps today's order and length (60 ms per card): longer would give the top cards more stage time.
- The sign-up card is not transformed (its view event watches its box).
- The home's two `scrollIntoView` targets and the setup card's one-commit collapse stay as they are.

## 9. Screen by screen

Art direction for each screen: the director's treatment, section 7, read with these changes: primaries are royal;
the home hero carries its own in-flow sun behind the stage cloud (two columns from 1024 px: words left, scene right;
on phones the scene band comes first and "Let's begin" stays above the fold at 390 x 844 and 375 x 667); the
companion uses seats at every width (there is no gutter cloud and no peeking cloud); selected states are royal.

What each screen must end up with:

- **Home.** The old blobs go. The scene: the sun (`.d-sun`), the stage cloud in front of its lower left, the flight
  line sweeping up from the left to the paper plane. A short title sequence on arrival (about 1.8 s, nothing blocks,
  nothing starts invisible except the line that draws itself): the sun rises, the cloud drifts in, the line draws and
  the plane flies it, the wordmark's gold swash draws. "Let's begin" is the royal pill, visible and tappable in the
  first frame. Setup card: a tapped tile fills royal and its badge becomes a gold coin with the rank number popping
  in; the cloud nods on every rank and un-rank and is glad when the setup is answered; "Next" is the royal pill
  (disabled: `sky-deep`). The setup card and the search card are seats.
- **Results.** At least 24 px between cards and 30 px (32 px from 640 px) between the first card and the row above it.
  Cards lift on hover and rise their last 16 px as they scroll in; the small plane on each time line travels with
  the scroll. Compare: the pill swaps outline for selected, the plus becomes a check, a small plane flies to the tray
  chip (and back from it on remove), the cloud nods both ways. "Why?" makes the cloud curious. "Details" and
  "Choose what matters" are `D_LINK`. The date strip is filled in the first frame of an arrival.
- **Flight.** The header is a boarding pass: two panels meeting at the dashed rule, with a notch at each end of it.
  The route line draws on arrival and the plane flies from the origin's code to the destination's, over a gold
  under-stroke. 30 px (32 px from 640 px) between the back link and the pass. "I'd pick this flight" is the royal
  pill; picked, it is the selected look (`royal-100`, royal ring and label), with one soft ring and a nod for pick
  and withdraw alike and no filled heart. Rating rows lift and their badges stamp as they scroll in; the rating
  sheet's tier block settles and its reasons rise in turn. The page has a home cloud in the pass.
- **Compare and the small states.** The table rises as one piece. The label column's top corner holds the home cloud;
  no flight column is ever a seat. Loading: the stage cloud looks up above "Checking the skies…". Not found and
  error: the same paper card with the stage cloud in place of the icon tile.

## 10. Research integrity for this pass

- No expression, glow, lean, delay, colour or camera move depends on a rating, a price, an airline or a position in
  the list. The same card decoration and motion for every flight.
- "I'd pick this flight" is the measured outcome: it is acknowledged, never rewarded, and withdrawing is acknowledged
  identically.
- Copy is frozen, including screen-reader text and status announcements.
- Nothing delays a participant: no splash, no blocked tap beyond the old page's half of a 760 ms transition, a still
  version of everything under reduced motion.
- Event names, routes, query parameters, forms, the sign-up and the compare list do not change. Versions A, B and C
  render pixel-identically (checked by screenshot hash before and after).

## 11. Sources

- Director's treatment (scenes, contrast table, screen-by-screen):
  `scratchpad/cine/design/director.md`, look-dev stills in `scratchpad/cine/design/director-work/mock/`
- Animator's treatment (the cloud's acting): `scratchpad/cine/design/animator.md`
- Interaction designer's treatment (motion tokens, small interactions): `scratchpad/cine/design/interaction.md`
- Page-transition proof and recipe files: `scratchpad/cine/vt-proof/REPORT.md`, `scratchpad/cine/vt-proof/src/recipe/`
- Inventory of version D (selectors, layers, analytics, guards, traps): `scratchpad/cine/inventory.md`
