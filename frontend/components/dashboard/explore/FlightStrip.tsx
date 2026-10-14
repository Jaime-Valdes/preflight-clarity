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
 * One chip per explored flight ("Your flight", "Option 2"…), then "+ Another
 * flight" and, with two or more flights, "Compare". Scrolls sideways inside
 * itself (never the page), with soft fades at the screen edges.
 */
export function FlightStrip({ entries, activeId, onSelect, onAdd, onCompare, className }: FlightStripProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const full = entries.length >= MAX_EXPLORED_FLIGHTS;

  // Keep the active chip in view (e.g. after adding a seventh-from-the-left flight).
  useEffect(() => {
    const scroller = scrollerRef.current;
    const chip = scroller?.querySelector<HTMLElement>(`[data-flight-id="${CSS.escape(activeId)}"]`);
    if (!scroller || !chip) return;
    const pad = 20;
    const left = chip.offsetLeft - pad;
    const right = chip.offsetLeft + chip.offsetWidth + pad - scroller.clientWidth;
    if (scroller.scrollLeft > left) scroller.scrollTo({ left, behavior: "smooth" });
    else if (scroller.scrollLeft < right) scroller.scrollTo({ left: right, behavior: "smooth" });
  }, [activeId, entries.length]);

  return (
    <nav aria-label="Flights you’re exploring" className={cn("-mx-5", className)}>
      <div
        ref={scrollerRef}
        className={cn(
          "relative flex snap-x snap-mandatory scroll-px-5 gap-2 overflow-x-auto overscroll-x-contain px-5 py-1",
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

        <button
          type="button"
          onClick={onAdd}
          disabled={full}
          className={cn(
            CHIP,
            "gap-1.5 px-4 text-[13px] font-semibold",
            full
              ? "cursor-not-allowed border border-line text-ink-400"
              : "border border-dashed border-ink-300 text-ink-700 hover:bg-surface",
          )}
        >
          {full ? (
            `Up to ${MAX_EXPLORED_FLIGHTS}`
          ) : (
            <>
              <Plus aria-hidden className="size-4" />
              Another flight
            </>
          )}
        </button>

        {entries.length >= 2 ? (
          <button
            type="button"
            onClick={onCompare}
            className={cn(CHIP, "gap-1.5 bg-breeze-50 px-4 text-[13px] font-semibold text-breeze-700 ring-1 ring-inset ring-breeze-100 hover:bg-breeze-100")}
          >
            <ArrowLeftRight aria-hidden className="size-4" />
            Compare
          </button>
        ) : null}
      </div>
    </nav>
  );
}
