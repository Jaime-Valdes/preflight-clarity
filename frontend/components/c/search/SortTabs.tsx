"use client";

import { useEffect, useId, useRef } from "react";
import { SORT_KEYS, SORT_LABELS, type SortKey } from "@/lib/c/model";
import { cn } from "@/lib/cn";

interface SortTabsProps {
  value: SortKey;
  onChange: (sort: SortKey) => void;
  className?: string;
}

/**
 * Sort order as a row of pills — native radio buttons underneath, so arrow
 * keys move between them and screen readers hear "1 of 4". Scrolls sideways
 * inside itself when the screen is narrow (never the page).
 */
export function SortTabs({ value, onChange, className }: SortTabsProps) {
  const name = useId();
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

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="sr-only">Sort flights</legend>
      <div
        ref={scrollerRef}
        className={cn(
          "relative -mx-4 flex gap-1.5 overflow-x-auto overscroll-x-contain px-4 py-1 sm:mx-0 sm:px-0",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        )}
      >
        {SORT_KEYS.map((key) => {
          const on = key === value;
          return (
            <label key={key} data-sort={key} className="relative shrink-0">
              <input
                type="radio"
                name={name}
                value={key}
                checked={on}
                onChange={() => onChange(key)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "flex h-11 cursor-pointer select-none items-center whitespace-nowrap rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-breeze-500",
                  on
                    ? "bg-night-900 text-white ring-night-900"
                    : "bg-surface text-ink-700 ring-line-strong hover:bg-canvas hover:text-ink-900",
                )}
              >
                {SORT_LABELS[key]}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
