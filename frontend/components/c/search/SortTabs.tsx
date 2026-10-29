"use client";

import { useEffect, useId, useRef } from "react";
import { SORT_KEYS, SORT_LABELS, type SortKey } from "@/lib/c/model";
import { cn } from "@/lib/cn";

interface SortTabsProps<K extends string> {
  value: K;
  onChange: (sort: K) => void;
  /** The sorts offered, in order. Default: version C's (Smoothest, Cheapest, Fastest, Departure time). */
  keys?: readonly K[];
  /** A label per sort. Default: version C's. */
  labels?: Readonly<Record<string, string>>;
  /** Sorts that can't be used yet (Smoothest before the turbulence forecast is out): shown, but disabled. */
  unavailable?: readonly K[];
  /** Why they can't — a quiet line under the pills (e.g. "Smoothest from Tue, Nov 24 · 2 days before departure"). */
  note?: string;
  className?: string;
}

/** Version C's sorts, for a caller that passes no `keys` (K is then SortKey). */
const C_SORT_KEYS: readonly string[] = SORT_KEYS;

/**
 * Sort order as a row of pills — native radio buttons underneath, so arrow
 * keys move between them and screen readers hear "1 of 4". Scrolls sideways
 * inside itself when the screen is narrow (never the page). A sort that
 * can't be used yet stays in its place, disabled, with the note saying when
 * (the row then wraps, so it stays in view). The sorts are version C's unless
 * a tool passes its own `keys` and `labels` (version D's "For you" sort).
 */
export function SortTabs<K extends string = SortKey>({
  value,
  onChange,
  keys = C_SORT_KEYS as readonly K[],
  labels = SORT_LABELS,
  unavailable = [],
  note,
  className,
}: SortTabsProps<K>) {
  const name = useId();
  const noteId = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Keep the chosen pill in view (e.g. "Departure time" on a narrow phone).
  useEffect(() => {
    const scroller = scrollerRef.current;
    const chosen = scroller?.querySelector<HTMLElement>(`[data-sort="${value}"]`);
    if (!scroller || !chosen || scroller.scrollWidth <= scroller.clientWidth) return;
    const left = chosen.offsetLeft - 16;
    const right = chosen.offsetLeft + chosen.offsetWidth + 16 - scroller.clientWidth;
    if (scroller.scrollLeft > left) scroller.scrollTo({ left });
    else if (scroller.scrollLeft < right) scroller.scrollTo({ left: right });
  }, [value]);

  // With a sort that can't be used yet, the pills wrap instead of scrolling: the disabled one (first) and
  // the chosen one (last) can't both fit a phone's width, and the note under the row is about the first.
  const wrap = unavailable.length > 0;

  return (
    <fieldset className={cn("min-w-0", className)} aria-describedby={note ? noteId : undefined}>
      <legend className="sr-only">Sort flights</legend>
      <div
        ref={scrollerRef}
        className={cn(
          "relative -mx-4 flex gap-1.5 px-4 py-1 sm:mx-0 sm:px-0",
          wrap ? "flex-wrap" : "overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {keys.map((key) => {
          const on = key === value;
          const off = unavailable.includes(key);
          return (
            <label key={key} data-sort={key} className={cn("relative shrink-0", off && "cursor-not-allowed")}>
              <input
                type="radio"
                name={name}
                value={key}
                checked={on}
                disabled={off}
                onChange={() => onChange(key)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-11 select-none items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-breeze-500",
                  off
                    ? "bg-canvas text-ink-400 ring-line"
                    : on
                      ? "cursor-pointer bg-night-900 text-white ring-night-900"
                      : "cursor-pointer bg-surface text-ink-700 ring-line-strong hover:bg-canvas hover:text-ink-900",
                )}
              >
                {labels[key] ?? key}
                {off ? <span className="sr-only"> (not available yet)</span> : null}
              </span>
            </label>
          );
        })}
      </div>
      {note ? (
        <p id={noteId} className="mt-1 text-xs leading-snug text-ink-500">
          {note}
        </p>
      ) : null}
    </fieldset>
  );
}
