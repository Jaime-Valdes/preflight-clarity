# Version D look: how the theme is scoped

How version D (`/d`, the smooth-flight finder, docs/ITERATION_2.md) gets its own look while it reuses version C's
components, and what to run after changing it. Palette, motion, the sky, the companion cloud, the page transition and
each screen are in the build contract, `docs/ui-d-cinematic.md`; this file does not repeat them. Versions A, B and C
never set the theme and must render pixel-identically after any change here.

## Where the theme lives

- **The root.** `frontend/app/d/layout.tsx` renders `<div data-theme="d">` around the shared shell (C's `Header`,
  `<main id="c-main">`, `CompareTray`, `Footer`) and D's persistent pieces (`DScope`, `DSky`, `DCompanion`,
  `DMotionLayer`). The root is `relative isolate … overflow-x-clip`. The layout also exports
  `viewport = { themeColor: "#7EC3F4" }`.
- **`html[data-d-on]`.** `components/d/brand/DScope.tsx` sets `data-d-on` on `<html>` in a layout effect and removes it
  on cleanup. Rules that must reach outside the themed `<div>` use it: the `::view-transition-*` rules
  (`app/d/d-transition.css`), the `<html>` / `<body>` background (overscroll), and sheets. Do not use
  `:has([data-theme="d"])` on `html` instead: kept-alive pages (below) would keep it matching.
- **Tokens, in `frontend/app/globals.css`, in the part headed "Version D theme".**
  - A second `@theme static` block holds D-only names (`sky`, `royal`, `gold`, `butter`, `cream`, `leaf`, `sun`,
    `amber`, `ink`, `slate` and their steps) and the one D entrance, `--animate-d-rise`. `static` makes Tailwind emit
    every token as a CSS variable, so the plain-CSS partials and inline SVG can read them with `var()`. New names must
    not collide with Tailwind's defaults.
  - The re-pointing block, `[data-theme="d"], html[data-d-on] :where(body > div:has(> [role="dialog"][aria-modal="true"]))`,
    re-points the shared scales (`canvas`, `surface`, `line`, `line-strong`, `ink-*`, `night-*`, `calm-*`, `breeze-*`,
    `dusk-*`, `sand-*`) to D's palette, defines `--d-shadow-card` / `--d-shadow-lift`, and points C's
    `--animate-fade-up` at `--animate-d-rise`. Variables only; what each root paints follows separately.
  - After it: the shell restyled by CSS (header, tray, footer), sheets, and "Shared pieces that asked for a rating
    colour" (airline tiles, "in compare" states, calm-coloured links, tiles and expanders, sand form hints), each put
    on royal, sky or ink.
- **Per-page partials.** `app/d/d-sky.css`, `d-transition.css`, `d-cloud.css`, `d-motion.css`, `d-home.css`,
  `d-results.css`, `d-flight.css` and `d-compare.css`, imported by `app/d/layout.tsx` in that order. Plain CSS: no
  Tailwind directives, colours through `var(--color-…)`, classes and keyframes prefixed `d-`. Every selector in them
  starts with `[data-theme="d"]`, `html[data-d-on]` or a `.d-…` class that only D renders.
- **D's own components** (`frontend/components/d/**`) use the D tokens directly (`components/d/brand/buttons.ts`
  holds the shared class strings: `D_PILL_PRIMARY`, `D_PILL_OUTLINE`, `D_PILL_SELECTED`, `D_LINK`).
- **Optional props on shared components**, each defaulting to C's look: `HomeSearch tone` (D passes `"light"`),
  `FareCard compareTone` (D passes `"outline"`), and `FlightPage` / `ComparePage` `loading` (D passes `<DLoading />`).

## Sheets

`components/c/common/Sheet.tsx` portals to `<body>`, outside the themed `<div>`. While `/d` is mounted, the sheet
root, `html[data-d-on] :where(body > div:has(> [role="dialog"][aria-modal="true"]))`, is the second selector of the
re-pointing block, so a sheet gets D's tokens; `:where()` keeps the `body > div:has(…)` part from adding weight.
Separate rules then paint it: ink text, a `rgb(22 58 154 / .38)` scrim on the root's first child, and a `surface` panel and footer (the
shared ones are `canvas`, which is sky under D). The D-wide rules for focus, selection, placeholders, checkbox accent,
field size (16 px, so Safari on iPhone never zooms into a field), shadows, airline tiles and form hints each list
the sheet root as a second selector. The motion kit reaches into
sheets with `html[data-d-on] [role="dialog"][aria-modal="true"] …`.

## Shadows

`shadow-soft` and `shadow-lift` compile with version C's values inlined, so re-pointing `--shadow-*` changes nothing.
D sets the variable the utility reads on the element itself: `[data-theme="d"] .shadow-soft { --tw-shadow:
var(--d-shadow-card) }` and `.shadow-lift { --tw-shadow: var(--d-shadow-lift) }` (not on a disabled button that asks
for `disabled:shadow-none`), plus the sheet-root versions. A D-only element can use `box-shadow: var(--d-shadow-card)`
directly.

## Layers

Unlayered `[data-theme="d"] …` rules beat Tailwind utilities, including the utilities on D's own components. A default
that a utility should still be able to override goes in `@layer base`; today that is the focus ring (2 px `ink` at
3 px offset), the one-ring rule for text fields and selects, and `::selection`. Under reduced motion, the global rule
in `globals.css` ends every animation in 0.01 ms, and a D rule zeroes animation delays inside the theme and in sheets.

## Kept-alive pages

`next.config.ts` sets `cacheComponents: true`: pages the visitor has left stay in the DOM with `display: none`, and
their effects re-run on every return. `querySelector` can return those hidden nodes; filter with
`el.checkVisibility()` (as `components/d/cloud/dom.ts` does) or use an IntersectionObserver.

## Shared markup found by structure

Some D rules and one handler find shared markup by a class string, an aria-label, an id or a nesting (for example the
airline tile by `inline-grid … rounded-xl font-bold tracking-wide`, the fare card's "In compare" pill by
`rounded-full bg-calm-50` beside `aria-label="Remove from compare"`, and `DFlightDetail`'s `acknowledgeCompare`, which
reads the shared compare controls' `aria-label`, `aria-pressed` and the Details link's query). If that text changes
in the shared file, the D rule stops matching without any error and C's colours (often leaf, a rating colour) come
back under D. `frontend/scripts/d-hooks.mjs` lists every such dependency with the reason it matters; add a row there
when you add a rule of this kind.

## Checks

From the repo root, after any change to version D (the contract's section 11 has the full list, including the build
checks):

- `npx tsc --noEmit -p frontend` and `npx eslint frontend --max-warnings=0` (the React Compiler rules are errors).
- `node frontend/scripts/d-contrast.mjs`: every text and mark pair the palette relies on, and no red, pink or orange
  token. Run it after any colour change.
- `node frontend/scripts/d-transition-art.mjs --check`: the transition's generated blocks match the generator.
- `node frontend/scripts/d-hooks.mjs`: every piece of shared markup a D rule or handler depends on is still there.
  `D_HOOKS_ROOT=<dir>` (or `--root <dir>`) reads a shared file from a copy under `<dir>` to try a change first;
  `--strict` also fails when a D rule named in the table has been renamed or removed.
- After `next build`: `node frontend/scripts/d-css-check.mjs`, which checks that the build carries the stylesheets on
  disk.
- The A/B/C guard: screenshots of versions A, B and C against `main`, compared pixel for pixel, must be identical.
