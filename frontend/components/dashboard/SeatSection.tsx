"use client";

import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Star } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { Flight, SeatMap, SeatZone, SectionContext, SectionProps } from "@preflight/shared/types";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { COLORS, SEAT_ZONE } from "@/lib/theme";
import { useTracker } from "@/lib/tracking";
import { useExplore, useFlightState } from "./explore/context";
import {
  describeSeat,
  focusRowFor,
  gridColumnCount,
  gridMaxWidth,
  gridMinWidth,
  gridTemplate,
  GRID_COLUMN_GAP_PX,
  KIND_LABEL,
  parseSeatId,
  seatColumn,
  seatDetailParts,
  seatKinds,
  seatTeaserLine,
  withAlpha,
} from "./control/seatMap";

/** The map scrolls inside its own box above this many rows. */
const COLLAPSE_ABOVE_ROWS = 12;
const MAP_MAX_HEIGHT_PX = 420;

// ── Section body ────────────────────────────────────────────────────────────

export function SeatSection({ flight, ctx }: SectionProps) {
  const { seatMap } = flight;
  // Seat availability is as of the moment the briefing describes: the study's preview shows the day
  // before the flight (or the day itself for a flight today); version C shows today.
  const dayBefore = ctx.preview === true && ctx.daysUntil >= 1;
  const openNow = dayBefore ? "open the day before" : "open right now";
  const tracker = useTracker();
  // Version C (and an explored option in the study) is not the visitor's booked flight.
  const ownFlight = useExplore()?.showingOwnFlight ?? true;
  // Kept per explored flight, so switching away and back doesn't reset them.
  const [selected, setSelected] = useFlightState<string | null>("seat.selected", null);
  const [chosen, setChosen] = useFlightState<string | null>("seat.chosen", null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const pick = seatMap.recommended[0] ?? null;
  const focusId = selected ?? pick;
  const focus = focusId ? describeSeat(seatMap, focusId) : null;
  const otherPicks = seatMap.recommended.filter((id) => id !== focusId);
  // The generator falls back to seats off the wing when every over-wing seat is unavailable.
  const pickInfo = pick ? describeSeat(seatMap, pick) : null;
  const pickOverWing = pickInfo !== null && pickInfo.zone === "smoothest";
  const othersSmoothest = otherPicks.every((id) => describeSeat(seatMap, id)?.zone === "smoothest");
  const isChosen = focusId !== null && chosen === focusId;
  const rows = seatMap.rows;
  const firstRow = rows[0]?.row;
  const lastRow = rows[rows.length - 1]?.row;
  const canCollapse = rows.length > COLLAPSE_ABOVE_ROWS;

  // Open the map on the recommended rows (the top pick, else the middle of the wing).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const row = focusRowFor(seatMap);
    // A wide-body on a very narrow screen scrolls sideways too: bring the top pick into view.
    if (row !== null) centerRow(container, row, false, seatMap.recommended[0]);
  }, [seatMap]);

  function handleSeatTap(id: string, occupied: boolean) {
    if (occupied) return;
    setSelected(id);
    tracker?.event("seat_selected", "seat", id);
  }

  function handlePickTap(id: string) {
    handleSeatTap(id, false);
    const row = parseSeatId(id)?.row;
    const container = scrollRef.current;
    if (row !== undefined && container) centerRow(container, row, !prefersReducedMotion(), id);
  }

  function handleChoose() {
    if (!focusId) return;
    setChosen(focusId);
    tracker?.event("seat_choose_tapped", "seat", focusId);
  }

  function handleWhy() {
    const next = !whyOpen;
    setWhyOpen(next);
    if (next) tracker?.event("seat_why_opened", "seat");
  }

  function handleShowAll() {
    const next = !showAll;
    setShowAll(next);
    tracker?.event(next ? "seat_map_expanded" : "seat_map_collapsed", "seat");
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm leading-relaxed text-ink-700">
          On this {flight.aircraft.fullName}, the smoothest seats are over the wing in{" "}
          <span className="whitespace-nowrap tabular-nums">
            {seatMap.wingStartRow === seatMap.wingEndRow
              ? `row ${seatMap.wingStartRow}`
              : `rows ${seatMap.wingStartRow}–${seatMap.wingEndRow}`}
          </span>
          .{" "}
          {pick === null
            ? "Open seats in that zone are shaded on the map."
            : pickOverWing
              ? `The best seats ${openNow} are starred on the map.`
              : `Those are unavailable ${dayBefore ? "the day before" : "right now"}, so the best open seats nearby are starred on the map.`}
        </p>
        <p className="mt-1 text-xs leading-snug text-ink-500">
          {dayBefore ? "As of the day before departure" : "As of today"} — seats change until check-in.
        </p>
        <button
          type="button"
          aria-expanded={whyOpen}
          onClick={handleWhy}
          className="-ml-1 mt-0.5 inline-flex min-h-11 items-center gap-1 rounded-full px-1 text-sm font-semibold text-calm-700 transition-colors hover:text-calm-800"
        >
          Why over the wing?
          <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-300", whyOpen && "rotate-180")} />
        </button>
        {whyOpen ? (
          <p className="rounded-2xl bg-calm-50 px-4 py-3 text-sm leading-relaxed text-calm-800 ring-1 ring-inset ring-calm-100">
            {seatMap.why}
          </p>
        ) : null}
      </div>

      {/* Focused seat: our pick until the participant taps a seat. */}
      <div className="rounded-2xl bg-canvas/70 p-4 ring-1 ring-inset ring-line/70">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          {selected ? "Your selection" : "Our pick"}
        </div>
        {focus ? (
          <>
            <p className="mt-0.5 text-sm leading-snug text-ink-700">
              <span className="block text-lg font-bold leading-tight text-ink-900 tabular-nums">Seat {focus.id}</span>
              <span className="mt-1 block">{seatDetailParts(focus).join(" · ")}</span>
            </p>
            <div className="mt-3">
              <Button
                size="md"
                block
                variant={isChosen ? "soft" : "secondary"}
                aria-pressed={isChosen}
                onClick={handleChoose}
                icon={isChosen ? <Check aria-hidden className="size-4" strokeWidth={2.5} /> : undefined}
              >
                {isChosen ? "Selected" : "Select this seat"}
              </Button>
              {isChosen ? (
                <p className="mt-2 text-center text-xs text-ink-500">
                  {ownFlight ? <>Noted here for you — your booking isn&rsquo;t changed.</> : "Noted here only — nothing is booked."}
                </p>
              ) : null}
            </div>
            {otherPicks.length > 0 ? (
              <div className="mt-3">
                <div className="text-xs text-ink-500">{othersSmoothest ? `Also smooth and ${openNow}` : `Also ${openNow}`}</div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {otherPicks.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => handlePickTap(id)}
                      className="inline-flex h-11 items-center gap-1 rounded-full bg-surface px-3.5 text-[13px] font-semibold text-calm-700 ring-1 ring-inset ring-calm-100 transition-colors hover:bg-calm-50 tabular-nums"
                    >
                      <Star aria-hidden className="size-3" fill="currentColor" strokeWidth={1.5} />
                      {id}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <p className="mt-1 text-sm leading-snug text-ink-700">Tap an open seat on the map to see how it compares.</p>
        )}
      </div>

      {/* The map */}
      {rows.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            <span className="inline-flex items-center gap-0.5">
              <ChevronUp aria-hidden className="size-3.5" />
              Front of the plane
            </span>
            <span className="tabular-nums">
              Rows {firstRow}–{lastRow} · {flight.aircraft.seatLayout}
            </span>
          </div>
          <div className="relative">
            <SeatMapGrid
              seatMap={seatMap}
              selectedId={selected}
              collapsed={canCollapse && !showAll}
              scrollRef={scrollRef}
              onSeatTap={handleSeatTap}
            />
            {canCollapse && !showAll ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-10 rounded-b-2xl bg-gradient-to-t from-surface to-transparent"
              />
            ) : null}
          </div>
          {canCollapse ? (
            <div className="mt-1 flex justify-center">
              <Button variant="ghost" size="md" onClick={handleShowAll} aria-expanded={showAll}>
                {showAll ? "Show fewer rows" : `Show all ${rows.length} rows`}
                <ChevronDown aria-hidden className={cn("size-4 transition-transform duration-300", showAll && "rotate-180")} />
              </Button>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-ink-500">The seat map for this aircraft isn&rsquo;t available yet.</p>
      )}

      <Legend openNow={openNow} />
    </div>
  );
}

/** One calm line for the collapsed header. */
export function seatTeaser(flight: Flight, ctx: SectionContext): string {
  void ctx;
  return seatTeaserLine(flight.seatMap);
}

// ── Seat map grid ───────────────────────────────────────────────────────────

interface SeatMapGridProps {
  seatMap: SeatMap;
  selectedId: string | null;
  collapsed: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onSeatTap: (id: string, occupied: boolean) => void;
}

function SeatMapGrid({ seatMap, selectedId, collapsed, scrollRef, onSeatTap }: SeatMapGridProps) {
  const groups = seatMap.columnGroups;
  const rows = seatMap.rows;
  const kinds = seatKinds(groups);
  const template = gridTemplate(groups);
  const colCount = gridColumnCount(groups);
  const occupied = new Set(seatMap.occupied);
  const recommended = new Set(seatMap.recommended);

  let wingStart = -1;
  let wingEnd = -1;
  rows.forEach((r, i) => {
    if (r.row >= seatMap.wingStartRow && r.row <= seatMap.wingEndRow) {
      if (wingStart < 0) wingStart = i;
      wingEnd = i;
    }
  });
  const hasWing = wingStart >= 0;

  return (
    <div
      ref={scrollRef}
      role="group"
      aria-label="Seat map"
      className="relative overflow-auto overscroll-contain rounded-2xl bg-canvas/70 ring-1 ring-inset ring-line/60"
      style={{ maxHeight: collapsed ? MAP_MAX_HEIGHT_PX : undefined, scrollbarWidth: "thin" }}
    >
      <div
        className="relative mx-auto grid px-1 pb-4"
        style={{
          gridTemplateColumns: template,
          gridTemplateRows: `auto repeat(${rows.length}, auto)`,
          columnGap: GRID_COLUMN_GAP_PX,
          rowGap: 3,
          maxWidth: gridMaxWidth(groups),
          minWidth: gridMinWidth(groups),
        }}
      >
        {/* Fuselage */}
        <div
          aria-hidden
          className="-my-1.5 rounded-[22px] bg-surface shadow-soft ring-1 ring-inset ring-line/80"
          style={{ gridColumn: "2 / -2", gridRow: `2 / ${rows.length + 2}` }}
        />

        {/* Column letters — sticky while the map scrolls */}
        <div
          className="sticky top-0 z-20 grid border-b border-line/80 bg-canvas/95 pb-1 pt-1 backdrop-blur-sm"
          style={{ gridColumn: "1 / -1", gridRow: 1, gridTemplateColumns: template, columnGap: GRID_COLUMN_GAP_PX }}
        >
          {groups.flat().map((letter) => (
            <div
              key={letter}
              className="text-center text-[10px] font-semibold leading-4 text-ink-500"
              style={{ gridColumn: seatColumn(groups, letter) }}
            >
              {letter}
            </div>
          ))}
        </div>

        {hasWing ? (
          <>
            <Wing side="left" style={{ gridColumn: 1, gridRow: `${wingStart + 2} / ${wingEnd + 3}` }} />
            <Wing side="right" style={{ gridColumn: colCount, gridRow: `${wingStart + 2} / ${wingEnd + 3}` }} />
          </>
        ) : null}

        {rows.map((r, i) => {
          const gridRow = i + 2;
          const cells: ReactNode[] = [];
          let col = 2;
          groups.forEach((group, gi) => {
            for (const letter of group) {
              const id = `${r.row}${letter}`;
              const isOccupied = occupied.has(id);
              const isRecommended = recommended.has(id);
              const isSelected = selectedId === id;
              const kind = kinds.get(letter) ?? "middle";
              const label = isOccupied
                ? `Seat ${id}, unavailable`
                : `Seat ${id}, ${KIND_LABEL[kind].toLowerCase()}${isRecommended ? ", recommended" : ""}`;
              cells.push(
                <button
                  key={id}
                  type="button"
                  data-seat={id}
                  disabled={isOccupied}
                  aria-label={label}
                  aria-pressed={isSelected}
                  onClick={() => onSeatTap(id, isOccupied)}
                  className={cn(
                    "relative flex aspect-square items-center justify-center rounded-[5px] rounded-t-[7px] transition-transform duration-150",
                    isSelected ? "z-20" : "z-10",
                    !isOccupied && "active:scale-95",
                  )}
                  style={{ gridColumn: col, gridRow, ...seatStyle(r.zone, isOccupied, isRecommended, isSelected) }}
                >
                  {isSelected ? (
                    <Check aria-hidden className="size-[62%] text-white" strokeWidth={3} />
                  ) : isRecommended ? (
                    <Star aria-hidden className="size-[56%] text-calm-700" fill="currentColor" strokeWidth={1.5} />
                  ) : null}
                </button>,
              );
              col += 1;
            }
            if (gi < groups.length - 1) {
              cells.push(
                <div
                  key={`aisle-${gi}`}
                  data-row={gi === 0 ? r.row : undefined}
                  aria-hidden
                  className="z-10 flex items-center justify-center text-[10px] font-semibold text-ink-400 tabular-nums"
                  style={{ gridColumn: col, gridRow }}
                >
                  {r.row}
                </div>,
              );
              col += 1;
            }
          });
          if (r.exit) {
            cells.push(
              <ExitMarker key="exit-l" side="left" style={{ gridColumn: 1, gridRow }} />,
              <ExitMarker key="exit-r" side="right" style={{ gridColumn: colCount, gridRow }} />,
            );
          }
          return <Fragment key={r.row}>{cells}</Fragment>;
        })}
      </div>
    </div>
  );
}

function seatStyle(zone: SeatZone, occupied: boolean, recommended: boolean, selected: boolean): CSSProperties {
  if (selected) {
    return {
      background: COLORS.calm500,
      boxShadow: `0 0 0 2px ${COLORS.surface}, 0 0 0 4px ${COLORS.calm500}`,
    };
  }
  if (occupied) return { background: "#d9e0e8" };
  const z = SEAT_ZONE[zone];
  if (recommended) {
    return { background: z.fill, boxShadow: `inset 0 0 0 2px ${COLORS.calm500}` };
  }
  return {
    background: z.fill,
    boxShadow: `inset 0 0 0 1px ${withAlpha(z.stroke, 0.5)}, inset 0 -2px 0 ${withAlpha(z.stroke, 0.4)}`,
  };
}

/** Soft swept wing drawn in the strip beside the wing rows. */
function Wing({ side, style }: { side: "left" | "right"; style: CSSProperties }) {
  const points = side === "left" ? "100,0 0,46 0,100 100,100" : "0,0 100,46 100,100 0,100";
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="z-0 h-full w-full"
      style={{ ...style, marginRight: side === "left" ? -(GRID_COLUMN_GAP_PX + 1) : undefined, marginLeft: side === "right" ? -(GRID_COLUMN_GAP_PX + 1) : undefined }}
    >
      <polygon
        points={points}
        fill={SEAT_ZONE.smoothest.fill}
        stroke={COLORS.calm300}
        strokeWidth={1}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function ExitMarker({ side, style }: { side: "left" | "right"; style: CSSProperties }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div aria-hidden className="z-10 flex items-center justify-center" style={style}>
      <Icon className="size-3.5 text-calm-700" strokeWidth={3} />
    </div>
  );
}

// ── Legend ──────────────────────────────────────────────────────────────────

function Legend({ openNow }: { openNow: string }) {
  const zones: SeatZone[] = ["smoothest", "smooth", "more_motion"];
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs leading-snug text-ink-700">
      {zones.map((zone) => (
        <li key={zone} className="flex items-center gap-2">
          <Swatch style={seatStyle(zone, false, false, false)} />
          <span>{SEAT_ZONE[zone].label}</span>
        </li>
      ))}
      <li className="flex items-center gap-2">
        <Swatch style={seatStyle("smoothest", false, true, false)}>
          <Star aria-hidden className="size-2.5 text-calm-700" fill="currentColor" strokeWidth={1.5} />
        </Swatch>
        <span>Recommended · {openNow}</span>
      </li>
      <li className="flex items-center gap-2">
        <Swatch style={seatStyle("smooth", true, false, false)} />
        <span>Unavailable</span>
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden className="flex size-4 shrink-0 items-center justify-center">
          <ChevronLeft className="size-3.5 text-calm-700" strokeWidth={3} />
        </span>
        <span>Exit row</span>
      </li>
    </ul>
  );
}

function Swatch({ style, children }: { style: CSSProperties; children?: ReactNode }) {
  return (
    <span aria-hidden className="flex size-4 shrink-0 items-center justify-center rounded-[3px] rounded-t-[4px]" style={style}>
      {children}
    </span>
  );
}

// ── Scrolling ───────────────────────────────────────────────────────────────

/**
 * Scroll the map so `row` sits in the middle of the visible box — and, when the map is wider than
 * its box (a wide-body on a narrow screen), so seat `seatId` sits in the middle sideways.
 */
function centerRow(container: HTMLDivElement, row: number, smooth: boolean, seatId?: string) {
  const target = container.querySelector<HTMLElement>(`[data-row="${row}"]`);
  if (!target) return;
  const c = container.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  const top = t.top - c.top + container.scrollTop - (container.clientHeight - t.height) / 2;
  let left = container.scrollLeft;
  const seat = seatId ? container.querySelector<HTMLElement>(`[data-seat="${seatId}"]`) : null;
  if (seat && container.scrollWidth > container.clientWidth) {
    const s = seat.getBoundingClientRect();
    left = s.left - c.left + container.scrollLeft - (container.clientWidth - s.width) / 2;
  }
  container.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: smooth ? "smooth" : "auto" });
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
