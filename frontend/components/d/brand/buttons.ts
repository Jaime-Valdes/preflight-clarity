/*
 * Version D's buttons and links as class strings, for D's own components
 * (docs/ui-d-cinematic.md, "Surfaces and controls" and "Motion kit"). Each string
 * is a shape (Tailwind utilities) plus one class from app/d/d-motion.css that
 * carries the colours, the rest / hover / pressed / disabled states and the
 * motion. Sizes stay the caller's: add h-*, px-*, text-* and widths.
 *
 * An arrow or chevron icon inside any of them leans 3 px on hover; give any other
 * trailing icon the class d-trail. Disabled is the `disabled` attribute or
 * aria-disabled="true". Do not put two of the looks on one element: swap the
 * string when the state changes and the colours cross-fade.
 */

/** The one primary action: a royal pill with a lip and a white 800 label (17 px at 56 px tall). */
export const D_PILL_PRIMARY = "d-btn-primary inline-flex items-center justify-center gap-2 rounded-full font-extrabold";

/** A secondary action: a 2 px ink ring on whatever is behind it. */
export const D_PILL_OUTLINE = "d-btn-outline inline-flex items-center justify-center gap-2 rounded-full font-bold";

/** An outline control that is on (compare on, your pick): royal-100 fill, royal ring and label. Never a tier colour. */
export const D_PILL_SELECTED = "d-btn-selected inline-flex items-center justify-center gap-2 rounded-full font-bold";

/** A text link: ink, bold, underlined; a butter highlighter grows under the words on hover, press and keyboard focus. */
export const D_LINK = "d-link font-bold text-ink underline decoration-2 underline-offset-4";
