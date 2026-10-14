/** Joins class names, skipping falsy values. Does not merge conflicting Tailwind classes. */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
