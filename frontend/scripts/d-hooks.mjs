#!/usr/bin/env node
/*
 * Structural-hook check for version D's look (docs/ui-d-cinematic.md, section 3, "Scoping and layers").
 *
 *   node frontend/scripts/d-hooks.mjs            check the shared sources in this checkout
 *   node frontend/scripts/d-hooks.mjs --strict   also fail when a D rule named in the table is no longer found
 *   D_HOOKS_ROOT=<dir> node frontend/scripts/d-hooks.mjs
 *                                                read a shared file from <dir>/<its path under frontend/> when that
 *                                                copy exists (to try a change without touching the real file)
 *
 * Version D styles several shared components (components/c/**, components/ui/**, components/dashboard/**,
 * components/flow/**) without changing a line of them: its rules find their markup by a class string, an
 * aria-label, an id or a nesting, and one handler (DFlightDetail's acknowledgeCompare) reads their attributes. If one
 * of those strings changes in the shared file, the D rule silently stops matching and version C's colours come back
 * under D (often leaf, which in D means a top rating). This script reads each shared file a D rule depends on and
 * checks that the exact text the rule relies on is still there.
 *
 * Each row of HOOKS below is one dependency:
 *   d      the D side: [file under frontend/, the selector or function that depends on the shared markup]
 *   file   the shared file under frontend/
 *   text   a string that must appear in that file, or a list of strings that must appear in that order within
 *          `within` lines of the first one (default 8), which pins them to one element or one nesting
 *   count  optional: the first string must appear exactly this many times
 *   why    what breaks under D if the text goes
 *
 * Exits 0 when every hook holds, 1 when one is missing (each listed with the D rule it breaks). A D side that is no
 * longer found (the rule was renamed or removed) is printed as a note, and fails only with --strict: the row is then
 * stale and should be updated or deleted. Plain file reads, no browser, no dependencies.
 *
 * What it cannot see: the position part of a selector (:first-child, :last-child, + and ~). A row pins the text and
 * its order, not that nothing new sits before or after it, so an element added beside a positional target (say a
 * status line after the results summary's Swap / Change pair) passes here and quietly moves the D rule onto the
 * wrong element. The rows that depend on position say so in their `why`: after changing shared markup near one of
 * them, look at the page.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const STRICT = args.includes("--strict");
const rootArg = args.indexOf("--root");
const OVERRIDE = rootArg >= 0 ? args[rootArg + 1] : process.env.D_HOOKS_ROOT;

const G = "app/globals.css";
const MOTION = "app/d/d-motion.css";
const SHEET = 'html[data-d-on] :where(body > div:has(> [role="dialog"][aria-modal="true"]))';

// ── The hooks ───────────────────────────────────────────────────────────────────

const HOOKS = [
  // Shared pieces that asked for a rating colour (app/globals.css). These are the ones whose lapse shows.
  {
    d: [G, 'span[aria-hidden].inline-grid.place-items-center.rounded-xl.font-bold.tracking-wide'],
    file: "components/c/common/AirlineMark.tsx",
    text: ["<span", "aria-hidden", '"inline-grid shrink-0 place-items-center rounded-xl font-bold tracking-wide"', "tileFor(code)"],
    why: "every airline tile is ink; without it each tile takes one of seven hashed tones, three of them rating tiers, so some airlines would look better rated",
  },
  {
    d: [G, 'div.rounded-full.bg-calm-50:has(> button[aria-label="Remove from compare"])'],
    file: "components/c/flight/FareCard.tsx",
    text: [
      '<div className="flex min-h-12 items-center justify-between gap-2 rounded-full bg-calm-50',
      '<span className="inline-flex items-center gap-1.5 text-sm font-semibold text-calm-700">',
      "<button",
      'aria-label="Remove from compare"',
    ],
    within: 12,
    why: 'the fare card\'s "In compare" pill and its label are royal; without it they are leaf, a rating colour on a selection',
  },
  {
    d: [G, 'button[aria-pressed="true"].bg-calm-50'],
    file: "components/c/flight/CompareToggle.tsx",
    text: ["aria-pressed={pressed}", '? "bg-calm-50 text-calm-700'],
    within: 14,
    why: '"Compare" under Other flights, when on, is royal; without it it is leaf',
  },
  {
    d: [G, 'button[aria-pressed="true"] > span[aria-hidden].bg-calm-500'],
    file: "components/c/flight/CompareToggle.tsx",
    text: ["<span", "aria-hidden", 'pressed ? "bg-calm-500'],
    within: 5,
    why: "the toggle's check box is royal; without it it is a solid leaf square",
  },
  {
    d: [G, 'button[aria-pressed="true"].bg-calm-50'],
    file: "components/ui/Button.tsx",
    text: 'soft: "bg-calm-50 ',
    why: 'the seat section\'s "Selected" (Button variant soft) is royal; without it it is leaf',
  },
  {
    d: [G, 'button[aria-pressed="true"].bg-calm-50'],
    file: "components/dashboard/SeatSection.tsx",
    text: ['variant={isChosen ? "soft" : "secondary"}', "aria-pressed={isChosen}"],
    within: 2,
    why: 'the same rule reaches "Selected" only through aria-pressed on the soft button',
  },
  {
    d: [G, 'a.text-calm-700'],
    file: "components/c/flight/FareCard.tsx",
    text: '<a href={othersHref} className="font-semibold text-calm-700',
    why: '"other flights this day" is D\'s ink text link with the highlighter (also d-motion.css); without it it is a leaf link',
  },
  {
    d: [G, 'sup.text-calm-700'],
    file: "components/c/flight/OtherFlights.tsx",
    text: '<sup aria-hidden className="ml-0.5 text-[11px] font-semibold text-calm-700">',
    why: 'the "+1" beside an arrival under Other flights is ink-mute; without it it is leaf',
  },
  {
    d: [G, 'button[aria-expanded].text-calm-700'],
    file: "components/dashboard/SeatSection.tsx",
    text: ["aria-expanded={whyOpen}", "text-calm-700"],
    within: 3,
    why: '"Why over the wing?" under More detail is an ink control; without it its label is leaf',
  },
  {
    d: [G, 'button[aria-expanded].text-calm-700'],
    file: "components/dashboard/AircraftSection.tsx",
    text: ["aria-expanded={explainerOpen}", "text-calm-700"],
    within: 4,
    why: '"What\'s an A-check?" under More detail is an ink control; without it its label is leaf',
  },
  {
    d: [G, 'span[aria-hidden].rounded-2xl.bg-calm-50.text-calm-700'],
    file: "components/ui/SectionCard.tsx",
    text: ["<span", "aria-hidden", '"flex size-11 shrink-0 items-center justify-center rounded-2xl', "t.bg,", "t.text,"],
    within: 6,
    why: "the More detail section headers' icon tiles are sky; without it three of them are leaf on every flight, like a top rating",
  },
  {
    d: [G, 'span[aria-hidden].rounded-2xl.bg-calm-50.text-calm-700'],
    file: "lib/theme.ts",
    text: 'calm: { bg: "bg-calm-50", text: "text-calm-700"',
    why: "SectionCard's calm tone must still compile to the two classes the rule asks for",
  },
  {
    d: [G, 'span[aria-hidden].rounded-2xl.bg-calm-50.text-calm-700'],
    file: "components/c/flight/FlightSections.tsx",
    text: 'tone: "calm"',
    count: 3,
    why: "the turbulence, airline and seat sections are the calm-toned ones the rule turns sky",
  },
  {
    d: [G, 'span[aria-hidden].rounded-2xl.bg-calm-50.text-calm-700'],
    file: "components/c/interest/InterestCard.tsx",
    text: ["<span", "aria-hidden", "rounded-2xl bg-calm-50 text-calm-700"],
    within: 3,
    why: 'the sign-up card\'s "on the list" tile is sky; without it it is leaf',
  },
  {
    d: [G, `${SHEET} span[aria-hidden].rounded-2xl.bg-calm-50.text-calm-700`],
    file: "components/c/interest/InterestSheet.tsx",
    text: ["<span", "aria-hidden", "rounded-2xl bg-calm-50 text-calm-700"],
    within: 3,
    why: "the sign-up sheet's tile is sky; without it it is leaf",
  },
  {
    d: [G, 'form p.text-sand-700'],
    file: "components/c/search/SearchForm.tsx",
    text: ["<p", "id={dateHintId}", '"text-sand-700"'],
    within: 3,
    why: "the date field's hint is sky-ink; without it it is the lowest rating's amber",
  },
  {
    d: [G, 'form p.text-sand-700'],
    file: "components/c/search/SearchForm.tsx",
    text: "<form noValidate",
    why: "the hint rule only reaches a <p> inside a <form>",
  },
  {
    d: [G, 'form p.text-sand-700'],
    file: "components/flow/AirportField.tsx",
    text: ['<p id={hintId}', '"text-sand-700"'],
    within: 1,
    why: "an airport field's hint is sky-ink; without it it is amber",
  },
  {
    d: [G, `${SHEET} form p.text-sand-700`],
    file: "components/c/interest/InterestSheet.tsx",
    text: ["<form id={formId}", '<p id={hintId} className="mt-1.5 min-h-4 text-[13px] leading-snug text-sand-700"'],
    within: 40,
    why: "the sign-up sheet's hint is sky-ink; without it it is amber",
  },

  // The shell (app/globals.css). components/c/shell is shared with version C.
  {
    d: [G, '[data-theme="d"] > header'],
    file: "components/c/shell/Header.tsx",
    text: '<header className="border-b ',
    why: "the top bar is transparent over the sky with no hairline; the rule needs the bar to be the <header> element",
  },
  {
    d: [G, '[data-theme="d"] > header nav a'],
    file: "components/c/shell/Header.tsx",
    text: '<nav aria-label="Main"',
    why: "the header's links are ink and the current one sits on a paper pill",
  },
  {
    d: [G, '[data-theme="d"] > header nav a > span[aria-hidden]'],
    file: "components/c/shell/Header.tsx",
    text: ["<span", "aria-hidden", "rounded-full bg-calm-500"],
    within: 3,
    why: "the compare count is royal; without it it is leaf, a rating colour on a control's state",
  },
  {
    d: [G, 'header a[aria-label^="Cloud9"] > span[aria-hidden]:first-child'],
    file: "components/c/shell/Header.tsx",
    text: ["aria-label={`Cloud9, ${tool.name}`}", "<BrandTile"],
    within: 3,
    why: "the brand tile stays ink; without it it takes royal from night-900 and reads as a control",
  },
  {
    d: [G, 'header a[aria-label^="Cloud9"] > span[aria-hidden]:first-child'],
    file: "components/ui/BrandMark.tsx",
    text: ["export function BrandTile", "<span", "aria-hidden", "bg-night-900"],
    within: 8,
    why: "BrandTile's root must be the aria-hidden <span> that is the link's first child",
  },
  {
    d: [G, 'header a[aria-label^="Cloud9"] > span[aria-hidden]:first-child ellipse'],
    file: "components/ui/BrandMark.tsx",
    text: "<ellipse",
    count: 2,
    why: "the drawing's only ellipses are its two cheeks, which turn gold; another ellipse would turn gold too",
  },
  {
    d: [G, '[data-theme="d"] #c-compare-tray'],
    file: "components/c/shell/CompareTray.tsx",
    text: ['const TRAY_ID = "c-compare-tray";', "id={TRAY_ID}"],
    within: 80,
    why: "the tray is solid paper with an ink shadow; without it the tray keeps C's 95 % fill and shadow",
  },
  {
    d: [G, '#c-compare-tray span[aria-disabled="true"]'],
    file: "components/c/shell/CompareTray.tsx",
    text: ["<span", 'aria-disabled="true"', "bg-line/70"],
    within: 3,
    why: '"Compare (n)" before two flights is the disabled primary (sky-deep); without it it is C\'s grey pill',
  },
  {
    d: [G, '[data-theme="d"] > footer'],
    file: "components/c/shell/Footer.tsx",
    text: '<footer className="border-t ',
    why: "the footer has no rule above it on the sky",
  },

  // Sheets (c/common/Sheet.tsx portals to <body>, outside the themed <div>).
  {
    d: [G, 'html[data-d-on] :where(body > div:has(> [role="dialog"][aria-modal="true"])) {'],
    file: "components/c/common/Sheet.tsx",
    text: ["createPortal(", "<div ref={rootRef} className=", "<div", "aria-hidden", "<div", "role=\"dialog\"", 'aria-modal="true"'],
    within: 12,
    why: "a sheet root is found as a <body> child holding the modal dialog; without it every sheet wears version C's tokens under D",
  },
  {
    d: [G, 'html[data-d-on] :where(body > div:has(> [role="dialog"][aria-modal="true"]))'],
    file: "components/c/common/Sheet.tsx",
    text: "document.body,",
    why: "the sheet must portal straight into <body> for the root selector to match",
  },
  {
    d: [G, `${SHEET} > [aria-hidden]:first-child`],
    file: "components/c/common/Sheet.tsx",
    text: ["<div ref={rootRef}", "<div", "aria-hidden", "bg-night-950/45"],
    within: 4,
    why: "the scrim is the root's first child; without it the backdrop is a dark navy wash instead of the blue scrim",
  },
  {
    d: [G, 'html[data-d-on] :where(body > div) > [role="dialog"][aria-modal="true"] > [data-sheet-scroll] + div'],
    file: "components/c/common/Sheet.tsx",
    text: ["<div data-sheet-scroll", "{footer ? (", "<div", "bg-canvas/95"],
    within: 8,
    why: "the sheet footer follows the scroll area; without it the footer is sky (canvas) under a paper panel",
  },

  // No backdrop blur under D ([class*="backdrop-blur"]): a blur over the moving sky is redone every frame.
  {
    d: [G, '[data-theme="d"] [class*="backdrop-blur"]'],
    file: "components/c/shell/Header.tsx",
    text: "backdrop-blur-md",
    why: "the header's blur is turned off by its class name",
  },
  {
    d: [G, '[data-theme="d"] [class*="backdrop-blur"]'],
    file: "components/c/shell/CompareTray.tsx",
    text: "backdrop-blur-md",
    why: "the tray's blur is turned off by its class name",
  },
  {
    d: [G, `${SHEET} [class*="backdrop-blur"]`],
    file: "components/c/common/Sheet.tsx",
    text: "backdrop-blur-[2px]",
    why: "the sheet scrim's blur is turned off by its class name",
  },
  {
    d: [G, '[data-theme="d"] [aria-label="Seat map"] .sticky[class*="backdrop-blur"]'],
    file: "components/dashboard/SeatSection.tsx",
    text: ['aria-label="Seat map"', '"sticky top-0 z-20 grid border-b border-line/80 bg-canvas/95 pb-1 pt-1 backdrop-blur-sm"'],
    within: 30,
    why: "the seat map's sticky row of letters gets a solid fill once its blur is off; without it seats show through it",
  },

  // The motion kit's control feedback (app/d/d-motion.css), found on shared markup.
  {
    d: [MOTION, '[data-theme="d"] :is(button, a).rounded-full.bg-night-900'],
    file: "components/c/search/SearchForm.tsx",
    text: "rounded-full bg-night-900",
    why: '"Search flights" is the royal pill with a lip and the press feedback',
  },
  {
    d: [MOTION, '[data-theme="d"] :is(button, a).rounded-full.bg-night-900'],
    file: "components/c/shell/CompareTray.tsx",
    text: "rounded-full bg-night-900",
    why: 'the tray\'s "Compare (n)" is the royal pill with a lip',
  },
  {
    d: [MOTION, 'html[data-d-on] [role="dialog"][aria-modal="true"] :is(button, a).rounded-full.bg-night-900'],
    file: "components/c/interest/InterestSheet.tsx",
    text: "rounded-full bg-night-900",
    why: '"Notify me when it\'s live" is the royal pill with a lip',
  },
  {
    d: [MOTION, '[data-theme="d"] nav[aria-label="Nearby dates"] a'],
    file: "components/c/search/DateStrip.tsx",
    text: ['<nav aria-label="Nearby dates"'],
    why: "the date strip's tiles rise under the pointer and give when pressed",
  },
  {
    d: [MOTION, '[data-theme="d"] nav[aria-label="Nearby dates"] a[aria-current="date"]::after'],
    file: "components/c/search/DateStrip.tsx",
    text: ["<Link", 'aria-current={current ? "date" : undefined}'],
    within: 4,
    why: "the chosen day is marked by aria-current=\"date\" on its link",
  },
  {
    d: [MOTION, '[data-theme="d"] label > input.peer[type="radio"] + span'],
    file: "components/c/search/SortTabs.tsx",
    text: ["<label", "<input", 'type="radio"', 'className="peer sr-only"', "/>", "<span"],
    within: 12,
    why: "the sort pills give when pressed: a label holding the hidden radio, then the visible span",
  },
  {
    d: [MOTION, 'html[data-d-on] [role="dialog"][aria-modal="true"] label > input.peer[type="radio"] + span'],
    file: "components/c/search/Filters.tsx",
    text: ["<label", "<input", 'type="radio"', 'className="peer sr-only"', "/>", "<span"],
    within: 12,
    why: "the filters' segmented choice gives when pressed, by the same structure",
  },
  {
    d: [MOTION, '[data-theme="d"] ul.grid > li > a.rounded-2xl.min-h-14[href^="/d/search"]'],
    file: "components/c/search/HomeSearch.tsx",
    text: ['<ul className="mt-2.5 grid', "<li", "<Link", "href={hrefs.search(", "min-h-14 flex-col justify-center rounded-2xl"],
    within: 12,
    why: "the popular-route chips lift and give; they are found by shape and destination",
  },
  {
    d: [MOTION, 'html[data-d-on] [role="dialog"][aria-modal="true"] label:has(> input[type="checkbox"])'],
    file: "components/c/search/Filters.tsx",
    text: ["<label", "<input", 'type="checkbox"'],
    within: 8,
    why: "a filter checkbox row tints while pressed",
  },
  {
    d: [MOTION, 'html[data-d-on] [role="dialog"][aria-modal="true"] label:has(> input[type="checkbox"])'],
    file: "components/c/interest/InterestSheet.tsx",
    text: ["<label", "<input", 'type="checkbox"'],
    within: 10,
    why: "the sign-up sheet's checkbox row tints while pressed",
  },
  {
    d: [MOTION, '[data-theme="d"] button[aria-label="Swap origin and destination"] > svg'],
    file: "components/c/search/SearchForm.tsx",
    text: ['aria-label="Swap origin and destination"', "<ArrowLeftRight aria-hidden"],
    within: 4,
    why: "the form's swap icon makes a half turn when pressed",
  },
  {
    d: [MOTION, '[data-theme="d"] a[aria-label^="Swap:"] > svg'],
    file: "components/c/search/SearchSummary.tsx",
    text: ["aria-label={`Swap: ", "<ArrowLeftRight aria-hidden"],
    within: 3,
    why: "the results summary's swap icon makes a half turn when pressed",
  },
  {
    d: [MOTION, '[data-theme="d"] div.relative > svg.pointer-events-none'],
    file: "components/c/search/SearchForm.tsx",
    text: ['<div className="relative">', "<CalendarDays", 'className="pointer-events-none '],
    within: 4,
    why: "the date field's calendar icon turns sky-ink while the field has focus",
  },
  {
    d: [MOTION, 'html[data-d-on] [role="dialog"][aria-modal="true"] :is(button, a).hover\\:bg-line\\/50'],
    file: "components/c/common/Sheet.tsx",
    text: ['aria-label="Close"', "hover:bg-line/50"],
    within: 3,
    why: "a sheet's close button tints while pressed",
  },
  {
    d: [MOTION, '.d-lift:not(:has([role="combobox"])):not([aria-labelledby^="c-interest-"])'],
    file: "components/c/interest/InterestCard.tsx",
    text: ["<section", "aria-labelledby={`c-interest-${placement}`}"],
    within: 3,
    why: "the sign-up card is kept out of the hover lift and the scroll reveal by its labelledby prefix",
  },

  // The compare page (app/d/d-compare.css). components/c/compare/ComparePage.tsx is shared.
  {
    d: ["app/d/d-compare.css", '[data-theme="d"] main > div > div.bg-breeze-50:has(> p > .lucide-link-2)'],
    file: "components/c/compare/ComparePage.tsx",
    text: ["{offerKeep ? (", '<div className="mt-4 flex', "bg-breeze-50", "<p className=", "<Link2 aria-hidden", "<button"],
    within: 12,
    why: '"These flights came from a link" is a paper strip and its button D\'s text link; without it it is C\'s breeze box',
  },
  {
    d: ["app/d/d-compare.css", '[data-theme="d"] main > div > div.bg-breeze-50:has(> p > .lucide-link-2)'],
    file: "components/c/compare/ComparePage.tsx",
    text: ["  return (", "    <div>"],
    within: 1,
    why: "the strip is found as a child of the page's root <div>, which sits straight in <main>",
  },
  {
    d: ["app/d/d-compare.css", '[data-theme="d"] main > div > div:has(> .d-compare-arrive) + p'],
    file: "components/c/compare/ComparePage.tsx",
    text: ['<div className="mt-5">', "<Table ", "</div>", "{comparing ? <p "],
    within: 16,
    why: "the note under the table is the <p> right after the table's box; it gets a paper strip over the sunset",
  },
  {
    d: ["app/d/d-compare.css", '[data-theme="d"] section[aria-labelledby="c-interest-d_compare"]'],
    file: "components/c/interest/InterestCard.tsx",
    text: ["<section", "aria-labelledby={`c-interest-${placement}`}"],
    within: 3,
    why: "the compare page's sign-up card loses its cool outline",
  },
  {
    d: ["app/d/d-compare.css", '[data-theme="d"] section[aria-labelledby="c-interest-d_compare"]'],
    file: "lib/tool.ts",
    text: 'compare: "d_compare"',
    why: "the placement name that makes the card's labelledby c-interest-d_compare",
  },

  // The flight page (app/d/d-flight.css). OtherFlights is shared; DFlightDetail passes it the id.
  {
    d: ["components/d/motion/DMotionLayer.tsx", '[data-theme="d"] #other-flights > ul > li > div'],
    file: "components/c/flight/OtherFlights.tsx",
    text: ["<section id={id}", '<ul className="mt-3 flex flex-col gap-2.5">', "<li key={option.key}>", "<OtherFlightRow"],
    within: 30,
    why: "each other flight's card rises in on scroll; found as section > ul > li > the row's root",
  },
  {
    d: ["components/d/motion/DMotionLayer.tsx", '[data-theme="d"] #other-flights > ul > li > div'],
    file: "components/c/flight/OtherFlights.tsx",
    text: ["  return (", '    <div className="rounded-3xl bg-surface p-4 shadow-soft'],
    within: 1,
    why: "the row's root is the <div> card the reveal moves",
  },
  {
    d: ["components/d/motion/DMotionLayer.tsx", '[data-theme="d"] #other-flights > ul > li > div'],
    file: "components/c/flight/FlightPage.tsx",
    text: ["<OtherFlights", 'id="other-flights"'],
    within: 1,
    why: "a flight that has left shows the shared page's Other flights under the same id",
  },

  // The flight page's notices (no query, a date out of range, an unknown flight, no flight picked) are the shared
  // Notice inside the shared Card; d-flight.css gives them D's dead-end card by their structure.
  {
    d: ["app/d/d-flight.css", '[data-theme="d"] .rounded-3xl:has(> [aria-hidden].size-14:first-child + h1)'],
    file: "components/c/flight/Notice.tsx",
    text: ["<Card", "<div", "aria-hidden", "size-14", "</div>", "<h1", "<div", "<div", "{actions}</div>", "</Card>"],
    within: 14,
    why: "the notices wear D's paper card, royal primary and ink outline; found as the icon tile (first child) right before the h1, the actions as the last child",
  },
  {
    d: ["app/d/d-flight.css", '[data-theme="d"] .rounded-3xl:has(> [aria-hidden].size-14:first-child + h1)'],
    file: "components/ui/Card.tsx",
    text: '"rounded-3xl bg-surface shadow-soft',
    why: "the notice's card is found by the shared Card's rounded-3xl",
  },
  {
    d: ["app/d/d-flight.css", '[data-theme="d"] .rounded-3xl:has(> [aria-hidden].size-14:first-child + h1) > div:last-child > a:not(.bg-night-900)'],
    file: "components/c/flight/copy.ts",
    text: ["export const LINK_TONE = {", 'primary: "bg-night-900 text-white'],
    within: 2,
    why: "the notice's primary is told from its secondary by bg-night-900; without it both would wear the outline",
  },

  // The results summary (app/d/d-results.css): its Swap / Change row wraps instead of overflowing at large text.
  {
    d: ["app/d/d-results.css", '[data-theme="d"] section[aria-labelledby="c-results-title"] > div:first-child > div:last-child'],
    file: "components/c/search/SearchSummary.tsx",
    text: ['<section aria-labelledby="c-results-title"', '<div className="flex flex-wrap items-center', '<div className="min-w-0">', '<div className="flex shrink-0 gap-2">'],
    within: 21,
    why: "at 200 % text the Swap / Change row wraps; found as the last child of the summary's first row (the root's overflow-x clip would cut 'Change' otherwise)",
  },

  // DFlightDetail's acknowledgeCompare: the shared compare controls' clicks get D's plane and nod.
  {
    d: ["components/d/flight/DFlightDetail.tsx", "const acknowledgeCompare"],
    file: "components/c/flight/FareCard.tsx",
    text: ["<button", "ref={removeRef}", 'type="button"', "onClick={remove}", 'aria-label="Remove from compare"'],
    within: 5,
    why: 'a removal is told from an add by this label; without it "Remove" flies a plane to the tray like an add',
  },
  {
    d: ["components/d/flight/DFlightDetail.tsx", "const acknowledgeCompare"],
    file: "components/c/flight/FareCard.tsx",
    text: ['<div className="mt-4">', "{inList ? (", ") : (", "<button", "ref={addRef}", "aria-disabled={full || undefined}"],
    within: 22,
    why: "an add flies from the box around the two buttons (the add button's parent), and a full list's add is skipped by aria-disabled",
  },
  {
    d: ["components/d/flight/DFlightDetail.tsx", "const acknowledgeCompare"],
    file: "components/c/flight/CompareToggle.tsx",
    text: ["<button", 'type="button"', "aria-pressed={pressed}", "aria-disabled={disabled || undefined}"],
    within: 4,
    why: "the Other flights toggle is found by aria-pressed, its direction read from it, and a full list skipped by aria-disabled",
  },
  {
    d: ["components/d/flight/DFlightDetail.tsx", "const acknowledgeCompare"],
    file: "components/c/flight/OtherFlights.tsx",
    text: ['<div className="mt-3 grid grid-cols-2', "<Link href={hrefs.flight(item)}", "<CompareToggle"],
    within: 4,
    why: "a removal finds its flight from the Details link that shares the toggle's parent; the link must be that box's first a[href]",
  },
  {
    d: ["components/d/flight/DFlightDetail.tsx", "const acknowledgeCompare"],
    file: "lib/c/model.ts",
    text: "from: item.origin, to: item.destination, date: item.date, f: item.key",
    why: "the Details link's from, to, date and f are rebuilt by hand into the item id the tray uses",
  },
  {
    d: ["components/d/flight/DFlightDetail.tsx", "const acknowledgeCompare"],
    file: "lib/c/model.ts",
    text: "return `${item.origin}.${item.destination}.${item.date}.${item.key}`;",
    why: "the hand-built id must keep itemId's order and dots, or the removal plane starts from the wrong chip",
  },
];

// ── The check ───────────────────────────────────────────────────────────────────

const cache = new Map();
const overridden = new Set();
function source(path) {
  if (!cache.has(path)) {
    let full = join(FRONTEND, path);
    if (OVERRIDE) {
      const copy = join(resolve(OVERRIDE), path);
      if (existsSync(copy)) {
        full = copy;
        overridden.add(`${path} <- ${copy}`);
      }
    }
    cache.set(path, existsSync(full) ? readFileSync(full, "utf8") : null);
  }
  return cache.get(path);
}

const squash = (s) => s.replace(/\s+/g, " ");
function dSource(path) {
  const key = `d:${path}`;
  if (!cache.has(key)) {
    const full = join(FRONTEND, path);
    cache.set(key, existsSync(full) ? squash(readFileSync(full, "utf8")) : null);
  }
  return cache.get(key);
}

function occurrences(text, needle) {
  let n = 0;
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Do the fragments appear in order, each on or after the line of the one before, within `within` lines of the first? */
function inOrder(lines, fragments, within) {
  for (let start = 0; start < lines.length; start++) {
    let col = lines[start].indexOf(fragments[0]);
    if (col < 0) continue;
    let line = start;
    let at = col + fragments[0].length;
    let ok = true;
    for (const fragment of fragments.slice(1)) {
      let found = false;
      for (; line <= Math.min(start + within, lines.length - 1); line++, at = 0) {
        const c = lines[line].indexOf(fragment, at);
        if (c >= 0) {
          at = c + fragment.length;
          found = true;
          break;
        }
      }
      if (!found) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** The first fragment of a sequence that cannot be placed, to say what went. */
function firstMissing(lines, fragments, within) {
  for (let k = 1; k <= fragments.length; k++) if (!inOrder(lines, fragments.slice(0, k), within)) return k - 1;
  return -1;
}

const failures = [];
const stale = [];
const files = new Set();
for (const hook of HOOKS) {
  files.add(hook.file);
  const [dFile, dText] = hook.d;
  const d = dSource(dFile);
  if (d === null || !d.includes(squash(dText))) stale.push(hook);

  const text = source(hook.file);
  if (text === null) {
    failures.push({ hook, problem: "the shared file is gone" });
    continue;
  }
  const fragments = Array.isArray(hook.text) ? hook.text : [hook.text];
  if (hook.count !== undefined) {
    const n = occurrences(text, fragments[0]);
    if (n !== hook.count) failures.push({ hook, problem: `expected ${hook.count} of ${JSON.stringify(fragments[0])}, found ${n}` });
    continue;
  }
  const within = hook.within ?? 8;
  if (!inOrder(text.split("\n"), fragments, within)) {
    const k = firstMissing(text.split("\n"), fragments, within);
    const problem =
      fragments.length === 1
        ? `not found: ${JSON.stringify(fragments[0])}`
        : k === 0
          ? `not found: ${JSON.stringify(fragments[0])}`
          : `not found in order within ${within} lines: ${fragments.map((f) => JSON.stringify(f)).join(" ... ")}` +
            `\n            (it stops at ${JSON.stringify(fragments[k])})`;
    failures.push({ hook, problem });
  }
}

if (overridden.size) {
  console.log("Reading these shared files from D_HOOKS_ROOT:");
  for (const line of overridden) console.log(`  ${line}`);
  console.log("");
}

for (const { hook, problem } of failures) {
  console.log(`MISSING  ${hook.file}`);
  console.log(`  ${problem}`);
  console.log(`  breaks:  ${hook.d[0]}  ${hook.d[1]}`);
  console.log(`  why:     ${hook.why}\n`);
}

if (stale.length) {
  console.log(`Note: ${stale.length} D ${stale.length === 1 ? "side is" : "sides are"} no longer found, so ${stale.length === 1 ? "its row" : "those rows"} may be stale (update or delete them):`);
  for (const hook of stale) console.log(`  ${hook.d[0]}  ${hook.d[1]}`);
  console.log("");
}

console.log(`${HOOKS.length} hooks into ${files.size} shared files: ${HOOKS.length - failures.length} hold, ${failures.length} missing.`);
if (failures.length || (STRICT && stale.length)) process.exit(1);
console.log("All hold.");
