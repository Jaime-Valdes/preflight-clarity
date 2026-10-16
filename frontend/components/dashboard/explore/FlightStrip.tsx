"use client";

import { ArrowLeftRight, Plus } from "lucide-react";
import { useEffect, useRef } from "react";
import { formatTime12 } from "@preflight/shared/dates";
import { cn } from "@/lib/cn";
import { MAX_EXPLORED_FLIGHTS } from "@/lib/tracking";
import { chipDate, exploreLabel, routeLabel, type ExploredEntry } from "./model";

interface FlightStripProps {
  entries: readonly ExploredEntry[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onCompare: () => void;
  className?: string;
}

const CHIP =
  "relative inline-flex h-11 shrink-0 snap-start items-center rounded-full transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-breeze-500";

/**
 * One chip per explored flight ("Example flight", "Option 2"…), then "+ Another
 * flight" and, with two or more flights, "Compare". The flight chips scroll
 * sideways inside themselves (never the page), with soft fades at the edges;
 * the two actions stay put after them, shrinking to icons when space is short.
 */
export function FlightStrip({ entries, activeId, onSelect, onAdd, onCompare, className }: FlightStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const full = entries.length >= MAX_EXPLORED_FLIGHTS;
  const single = entries.length < 2;

  // Keep the active chip fully in view (e.g. after adding a sixth flight). Scrolls to the chip's own
  // snap point (start-aligned): any other target would be snapped back to a neighbour's.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const chip = scroller?.querySelector<HTMLElement>(`[data-flight-id="${CSS.escape(activeId)}"]`);
    if (!scroller || !chip) return;
    const fade = 16;
    const inView =
      chip.offsetLeft >= scroller.scrollLeft + fade &&
      chip.offsetLeft + chip.offsetWidth <= scroller.scrollLeft + scroller.clientWidth - fade;
    if (inView) return;
    const left = Math.max(0, Math.min(chip.offsetLeft - 20, scroller.scrollWidth - scroller.clientWidth));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scroller.scrollTo({ left, behavior: reduce ? "auto" : "smooth" });
  }, [activeId, entries.length]);

  return (
    <nav aria-label="Flights you’re exploring" className={cn("@container -mx-5 flex items-center", className)}>
      <div
        ref={scrollerRef}
        className={cn(
          "relative flex min-w-0 flex-initial snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto overscroll-x-contain py-1 pl-5 pr-4",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          "[mask-image:linear-gradient(to_right,transparent,#000_16px,#000_calc(100%-16px),transparent)]",
        )}
      >
        {entries.map((entry, i) => {
          const { flight } = entry;
          const active = entry.meta.id === activeId;
          const label = exploreLabel(i);
          return (
            <button
              key={entry.meta.id}
              type="button"
              data-flight-id={entry.meta.id}
              aria-current={active ? "true" : undefined}
              aria-label={`${label}: ${flight.origin.code} to ${flight.destination.code}, ${chipDate(flight.input.date)}, departs ${formatTime12(flight.departTime)}, smoothness ${flight.smoothness.score}`}
              onClick={() => onSelect(entry.meta.id)}
              className={cn(
                CHIP,
                "gap-2.5 pl-4 pr-1.5 text-left",
                active
                  ? "bg-night-900 text-white shadow-lift"
                  : "bg-surface text-ink-900 shadow-soft ring-1 ring-inset ring-line hover:bg-canvas",
              )}
            >
              <span className="flex flex-col leading-none">
                <span className={cn("whitespace-nowrap text-[10.5px] font-semibold", active ? "text-white/65" : "text-ink-500")}>
                  {label} · <span className="tabular-nums">{formatTime12(flight.departTime)}</span>
                </span>
                <span className="mt-1 whitespace-nowrap text-[13px] font-bold tabular-nums">
                  {routeLabel(flight)} · {chipDate(flight.input.date)}
                </span>
              </span>
              <span
                aria-hidden
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-[12px] font-bold tabular-nums",
                  active ? "bg-white/[0.14] text-white" : "bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-100",
                )}
              >
                {flight.smoothness.score}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex shrink-0 gap-2 py-1 pr-5">
        <button
          type="button"
          onClick={full ? undefined : onAdd}
          aria-disabled={full || undefined}
          aria-label={full ? `Up to ${MAX_EXPLORED_FLIGHTS} flights — no more can be added` : "Another flight"}
          className={cn(
            CHIP,
            "w-11 justify-center gap-1.5 text-[13px] font-semibold",
            full
              ? "cursor-not-allowed border border-line text-ink-400 @min-[420px]:w-auto @min-[420px]:px-4"
              : "border border-dashed border-ink-300 text-ink-700 hover:bg-surface",
            !full && single && "@min-[380px]:w-auto @min-[380px]:px-4",
          )}
        >
          {full ? (
            <>
              <Plus aria-hidden className="size-4 @min-[420px]:hidden" />
              <span aria-hidden className="hidden @min-[420px]:inline">
                Up to {MAX_EXPLORED_FLIGHTS}
              </span>
            </>
          ) : (
            <>
              <Plus aria-hidden className="size-4" />
              {single ? (
                <span aria-hidden className="hidden @min-[380px]:inline">
                  Another flight
                </span>
              ) : null}
            </>
          )}
        </button>

        {single ? null : (
          <button
            type="button"
            onClick={onCompare}
            aria-label="Compare flights"
            className={cn(
              CHIP,
              "w-11 justify-center bg-breeze-50 text-[13px] font-semibold text-breeze-700 ring-1 ring-inset ring-breeze-100 hover:bg-breeze-100 @min-[375px]:w-auto @min-[375px]:px-3.5",
            )}
          >
            <ArrowLeftRight aria-hidden className="size-4 @min-[375px]:hidden" />
            <span aria-hidden className="hidden @min-[375px]:inline">
              Compare
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}
