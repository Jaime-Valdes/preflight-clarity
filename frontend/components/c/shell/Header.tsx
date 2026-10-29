"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCompareList } from "@/lib/c/compare-store";
import { useTool } from "./ToolContext";
import { cn } from "@/lib/cn";
import { BrandTile } from "@/components/ui/BrandMark";

const NAV_LINK =
  "relative inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors sm:px-3.5";

/**
 * Version C top bar: the brand (home of the tool), "Flights" (search) and
 * "Compare" with the number of flights picked. Calm and quiet, not sticky —
 * the compare tray is the sticky element on these pages.
 */
export function Header() {
  const pathname = usePathname();
  const tool = useTool();
  const { items } = useCompareList();
  const count = items.length;
  const onCompare = pathname === `${tool.base}/compare`;
  const onFlights = !onCompare && pathname.startsWith(tool.base);

  return (
    <header className="border-b border-line/70 bg-surface/85 backdrop-blur-md">
      <a
        href="#c-main"
        className="sr-only rounded-full bg-night-900 px-4 py-2.5 text-sm font-semibold text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
      >
        Skip to content
      </a>
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-2 px-4 sm:px-6 lg:px-8">
        <Link
          href={tool.base}
          className="-ml-1 flex min-h-11 min-w-0 items-center gap-2.5 rounded-2xl px-1 text-ink-900"
          aria-label={`Cloud9, ${tool.name}`}
        >
          <BrandTile className="size-8" />
          <span className="text-[15px] font-bold leading-tight tracking-tight">Cloud9</span>
        </Link>
        <nav aria-label="Main" className="shrink-0">
          <ul className="flex items-center gap-0.5 sm:gap-1">
            <li>
              <Link
                href={tool.base}
                aria-current={pathname === tool.base ? "page" : onFlights ? "true" : undefined}
                className={cn(
                  NAV_LINK,
                  onFlights ? "bg-canvas text-ink-900 ring-1 ring-inset ring-line" : "text-ink-500 hover:bg-canvas hover:text-ink-900",
                )}
              >
                Flights
              </Link>
            </li>
            <li>
              <Link
                href={`${tool.base}/compare`}
                aria-current={onCompare ? "page" : undefined}
                className={cn(
                  NAV_LINK,
                  onCompare ? "bg-canvas text-ink-900 ring-1 ring-inset ring-line" : "text-ink-500 hover:bg-canvas hover:text-ink-900",
                )}
              >
                Compare
                {count > 0 ? (
                  <>
                    <span
                      aria-hidden
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-calm-500 px-1.5 text-[11px] font-bold text-white tabular-nums"
                    >
                      {count}
                    </span>
                    <span className="sr-only">
                      ({count} {count === 1 ? "flight" : "flights"} picked)
                    </span>
                  </>
                ) : null}
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
