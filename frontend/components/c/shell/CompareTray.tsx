"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import { formatShortDate, formatTime12 } from "@preflight/shared/dates";
import type { FlightOption } from "@preflight/shared/search";
import { AirlineMark } from "@/components/c/common/AirlineMark";
import { useCompareList } from "@/lib/c/compare-store";
import { useFlightSource, useHrefs, useTool } from "./ToolContext";
import { MAX_COMPARE, dateStatus, itemId, type CompareItem } from "@/lib/c/model";
import type { FlightSource } from "@/lib/flights/source";
import { cn } from "@/lib/cn";
import { useTodayISO } from "@/lib/hooks";

const TRAY_ID = "c-compare-tray";

/** While the tray is on screen, scrolling a focused element into view keeps it clear of the tray (WCAG 2.4.11). */
const TRAY_SCROLL_PADDING = `html:has(#${TRAY_ID}){scroll-padding-bottom:8.5rem}@media (min-width:1024px){html:has(#${TRAY_ID}){scroll-padding-bottom:6rem}}`;

/** The picked flight through the tool's source; null when it isn't found — or, in version D, while its day loads (the chip shows the key). */
function lookUp(item: CompareItem, source: FlightSource): FlightOption | null {
  try {
    return source.findOption({ origin: item.origin, destination: item.destination, date: item.date }, item.key) ?? null;
  } catch {
    return null;
  }
}

/**
 * After a compare toggle, the tray may appear (or change) right over the
 * control that was just used: scroll it back into view above the tray.
 * Call it from the toggle's click handler.
 */
export function keepClearOfTray(control: Element | null): void {
  requestAnimationFrame(() => {
    const tray = document.getElementById(TRAY_ID);
    if (!tray || !(control instanceof HTMLElement) || !control.isConnected) return;
    const overlap = control.getBoundingClientRect().bottom - tray.getBoundingClientRect().top;
    if (overlap > 0) window.scrollBy({ top: overlap + 16 });
  });
}

/** "Nov 26" */
function shortDate(iso: string): string {
  try {
    return formatShortDate(iso).replace(/^\w+, /, "");
  } catch {
    return iso;
  }
}

/** After a chip goes, focus the chip that took its place (or the last one); with none left, the page. */
function refocus(index: number) {
  requestAnimationFrame(() => {
    const buttons = document.querySelectorAll<HTMLElement>(`#${TRAY_ID} [data-tray-remove]`);
    const next = buttons[Math.min(index, buttons.length - 1)] ?? document.getElementById("c-main");
    next?.focus({ preventScroll: true });
  });
}

/**
 * Version C's compare tray: sticky at the bottom of every /c page except
 * /c/compare while at least one flight is picked. Each picked flight is a
 * chip (opens the flight; × removes it); "Compare (n)" opens the comparison
 * once two are picked. It sits in the page flow (sticky, not fixed), so at
 * the end of a page it never covers the last card.
 */
export function CompareTray() {
  const pathname = usePathname();
  const compare = useCompareList();
  const tool = useTool();
  const hrefs = useHrefs();
  const today = useTodayISO();
  const source = useFlightSource();
  const { prune } = compare;
  // Flights whose date has passed leave the list (they can't be shown or compared, and mustn't fill it).
  useEffect(() => {
    if (today) prune(today);
  }, [today, prune]);
  // Until the effect has run, they are neither shown nor counted.
  const items = useMemo(() => (today ? compare.items.filter((i) => i.date >= today) : compare.items), [compare.items, today]);
  const entries = useMemo(() => items.map((item) => ({ item, id: itemId(item), option: lookUp(item, source) })), [items, source]);
  // Version D: each picked flight's day loads from the store and its chip fills in (same shape, the time added). The generator is always ready.
  useEffect(() => {
    if (!today) return;
    for (const item of items) if (dateStatus(item.date, today) === "ok") source.ensure(item);
  }, [items, today, source]);

  if (pathname === `${tool.base}/compare` || items.length === 0) return null;

  const count = items.length;
  const note =
    count >= MAX_COMPARE ? `Up to ${MAX_COMPARE} flights` : count === 1 ? "Add one more to compare" : `${count} of ${MAX_COMPARE} picked`;

  return (
    <section
      id={TRAY_ID}
      aria-label="Flights to compare"
      className="sticky bottom-0 z-30 border-t border-line/80 bg-surface/95 shadow-[0_-12px_30px_-20px_rgb(14_26_43/0.35)] backdrop-blur-md"
    >
      <style>{TRAY_SCROLL_PADDING}</style>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-2 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-6 lg:flex-row lg:items-center lg:gap-4 lg:px-8 lg:py-3">
        <ul
          className={cn(
            "relative -mx-4 flex min-w-0 flex-1 snap-x scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 py-0.5 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:scroll-px-0 lg:px-0",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          )}
        >
          {entries.map(({ item, id, option }, index) => {
            const flightNumber = option?.flight.flightNumber ?? item.key;
            const airline = option?.flight.airline.code ?? item.key.slice(0, 2);
            const date = shortDate(item.date);
            return (
              <li key={id} className="flex shrink-0 snap-start items-center rounded-2xl bg-canvas ring-1 ring-inset ring-line">
                <Link
                  href={hrefs.flight(item)}
                  className="flex min-h-11 items-center gap-2 rounded-2xl py-1.5 pl-1.5 pr-1 text-ink-900 hover:bg-line/40"
                >
                  <AirlineMark code={airline} size="sm" />
                  <span className="flex flex-col leading-tight">
                    <span className="whitespace-nowrap text-[13px] font-bold tabular-nums">
                      {flightNumber}
                      {option ? <span className="font-semibold text-ink-500"> · {formatTime12(option.flight.departTime)}</span> : null}
                    </span>
                    <span className="whitespace-nowrap text-[11px] text-ink-500 tabular-nums">
                      {item.origin}
                      <span aria-hidden> → </span>
                      <span className="sr-only"> to </span>
                      {item.destination} · {date}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  data-tray-remove
                  onClick={() => {
                    compare.remove(id);
                    refocus(index);
                  }}
                  aria-label={`Remove ${flightNumber} on ${date} from compare`}
                  className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-line/50 hover:text-ink-900"
                >
                  <X aria-hidden className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex shrink-0 items-center gap-1.5">
          <p className="mr-auto min-w-0 text-xs leading-snug text-ink-500 lg:mr-2">{note}</p>
          <button
            type="button"
            onClick={() => {
              compare.clear();
              refocus(0);
            }}
            className="h-11 shrink-0 rounded-full px-3 text-sm font-semibold text-ink-500 transition-colors hover:bg-line/50 hover:text-ink-900"
          >
            Clear
          </button>
          {count >= 2 ? (
            <Link
              href={hrefs.compare(items)}
              className="inline-flex h-11 shrink-0 items-center rounded-full bg-night-900 px-5 text-sm font-semibold text-white shadow-lift transition-colors hover:bg-night-800 active:bg-night-950"
            >
              Compare ({count})
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-11 shrink-0 cursor-not-allowed items-center rounded-full bg-line/70 px-5 text-sm font-semibold text-ink-400"
            >
              Compare ({count})
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
