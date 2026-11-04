/*
 * Version D's two pill shapes as class strings, for links that need them
 * (Button renders a <button>). Sizes are the caller's: add h-* and px-*.
 */

/** The one primary action: ink, white label, a 0.98 press. */
export const D_PILL_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-full bg-ink font-bold text-white transition-transform duration-[120ms] active:scale-[0.98]";

/** A secondary action: a 2 px ink outline on the surface behind it. */
export const D_PILL_OUTLINE =
  "inline-flex items-center justify-center gap-2 rounded-full font-bold text-ink ring-2 ring-inset ring-ink transition-[background-color,transform] duration-[120ms] hover:bg-ink/5 active:scale-[0.98]";
