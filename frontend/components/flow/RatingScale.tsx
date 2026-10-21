"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

interface RatingScaleProps {
  /** The question, shown above the scale and used as the accessible name. */
  question: string;
  /** 0–10, or null while unanswered (no thumb is shown). */
  value: number | null;
  onChange: (value: number) => void;
  /** Anchor labels under the two ends, e.g. "Not at all anxious" / "Extremely anxious". */
  minLabel: string;
  maxLabel: string;
  className?: string;
}

const MIN = 0;
const MAX = 10;
const TICKS = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i);

/**
 * A 0–10 integer slider that starts unset: no thumb until the participant
 * taps or drags on the track (so no default value anchors the answer).
 * Pointer events with capture, keyboard support, and `touch-action: none`
 * on the track so dragging doesn't scroll the page on iOS.
 */
export function RatingScale({ question, value, onChange, minLabel, maxLabel, className }: RatingScaleProps) {
  const questionId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const isSet = value !== null;
  const pct = isSet ? `${((value - MIN) / (MAX - MIN)) * 100}%` : "0%";

  function valueAt(clientX: number): number {
    const el = trackRef.current;
    if (!el) return value ?? 5;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return value ?? 5;
    const t = (clientX - rect.left) / rect.width;
    return Math.round(Math.min(1, Math.max(0, t)) * (MAX - MIN)) + MIN;
  }

  function update(next: number) {
    if (next !== value) onChange(next);
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort
    }
    setDragging(true);
    el.focus({ preventScroll: true });
    update(valueAt(e.clientX));
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    update(valueAt(e.clientX));
  }

  function endDrag(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const current = value ?? 5;
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = isSet ? Math.min(MAX, current + 1) : current;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = isSet ? Math.max(MIN, current - 1) : current;
        break;
      case "PageUp":
        next = isSet ? Math.min(MAX, current + 2) : current;
        break;
      case "PageDown":
        next = isSet ? Math.max(MIN, current - 2) : current;
        break;
      case "Home":
        next = MIN;
        break;
      case "End":
        next = MAX;
        break;
      default:
        return;
    }
    e.preventDefault();
    update(next);
  }

  return (
    <div data-ph-mask className={cn("select-none", className)}>
      <p id={questionId} className="text-[15px] font-semibold leading-snug text-ink-900">
        {question}
      </p>

      <div className="mt-3 h-5 text-center text-[13px] text-ink-500" aria-hidden>
        {isSet ? (
          <span className="font-semibold text-ink-700 tabular-nums">{value} out of 10</span>
        ) : (
          "Tap or drag to answer"
        )}
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-labelledby={questionId}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={isSet ? value : undefined}
        aria-valuetext={isSet ? `${value} out of 10` : "Not answered yet"}
        aria-orientation="horizontal"
        className="touch-none cursor-pointer rounded-2xl px-[22px] pt-2 pb-1 outline-offset-4"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <div ref={trackRef} className="relative h-12">
          {/* track */}
          <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-line" />
          {isSet ? (
            <div
              className={cn(
                "absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-night-900/25",
                !dragging && "transition-[width] duration-150 ease-out",
              )}
              style={{ width: pct }}
            />
          ) : null}
          {/* ticks */}
          {TICKS.map((tick) => (
            <span
              key={tick}
              className="absolute top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-300"
              style={{ left: `${((tick - MIN) / (MAX - MIN)) * 100}%` }}
            />
          ))}
          {/* thumb */}
          {isSet ? (
            <div
              className={cn(
                "absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-night-900 text-base font-bold text-white shadow-lift ring-4 ring-surface tabular-nums",
                dragging ? "scale-110" : "transition-[left,transform] duration-150 ease-out",
              )}
              style={{ left: pct }}
            >
              {value}
            </div>
          ) : null}
        </div>

        <div className="relative mt-1 h-4">
          {TICKS.map((tick) => (
            <span
              key={tick}
              className={cn(
                "absolute top-0 -translate-x-1/2 text-[11px] leading-4 tabular-nums",
                tick === value ? "font-bold text-ink-900" : "text-ink-500",
              )}
              style={{ left: `${((tick - MIN) / (MAX - MIN)) * 100}%` }}
            >
              {tick}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-2 flex justify-between gap-4 text-xs leading-snug text-ink-500">
        <span className="max-w-[45%]">{minLabel}</span>
        <span className="max-w-[45%] text-right">{maxLabel}</span>
      </div>
    </div>
  );
}
