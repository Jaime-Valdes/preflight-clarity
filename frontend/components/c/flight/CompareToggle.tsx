"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

interface CompareToggleProps {
  pressed: boolean;
  disabled?: boolean;
  /** Read after "Compare" by screen readers, e.g. "AA 914, 2:20 PM". */
  flightLabel: string;
  /** Id of a note explaining why the toggle is disabled. */
  describedBy?: string;
  onToggle: () => void;
  className?: string;
}

/**
 * Version C: "Compare" toggle for a flight in a list. The label stays the same
 * (aria-pressed carries the state); a small check box shows it visually.
 */
export function CompareToggle({ pressed, disabled = false, flightLabel, describedBy, onToggle, className }: CompareToggleProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      aria-describedby={describedBy}
      onClick={onToggle}
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold ring-1 ring-inset transition-colors duration-200 disabled:cursor-not-allowed",
        pressed
          ? "bg-calm-50 text-calm-700 ring-calm-200 hover:bg-calm-100"
          : "bg-surface text-ink-900 ring-line-strong hover:bg-canvas disabled:text-ink-300 disabled:ring-line disabled:hover:bg-surface",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[5px] ring-1 ring-inset transition-colors",
          pressed ? "bg-calm-500 text-white ring-calm-500" : "bg-surface ring-ink-300",
        )}
      >
        {pressed ? <Check className="size-3" strokeWidth={3.5} /> : null}
      </span>
      Compare<span className="sr-only"> {flightLabel}</span>
    </button>
  );
}
