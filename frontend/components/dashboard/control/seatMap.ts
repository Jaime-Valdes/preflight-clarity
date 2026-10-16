import type { SeatMap, SeatZone } from "@preflight/shared/types";

/*
 * Pure helpers for the seat-map section: seat classification, copy and the
 * CSS-grid geometry of the map. No React, no DOM — easy to unit-test.
 */

export type SeatKind = "window" | "aisle" | "middle";
export type WingPosition = "Over the wing" | "Ahead of the wing" | "Behind the wing";

export const KIND_LABEL: Record<SeatKind, string> = {
  window: "Window",
  aisle: "Aisle",
  middle: "Middle",
};

/** Short zone wording for the seat detail line. */
export const ZONE_SHORT: Record<SeatZone, string> = {
  smoothest: "Smoothest zone",
  smooth: "Smooth zone",
  more_motion: "A little more motion",
};

/** Window / aisle / middle for every seat letter, derived from the aisle grouping. */
export function seatKinds(groups: string[][]): Map<string, SeatKind> {
  const kinds = new Map<string, SeatKind>();
  groups.forEach((group, gi) => {
    group.forEach((letter, li) => {
      const isWindow = (gi === 0 && li === 0) || (gi === groups.length - 1 && li === group.length - 1);
      const isAisle = (gi > 0 && li === 0) || (gi < groups.length - 1 && li === group.length - 1);
      kinds.set(letter, isWindow ? "window" : isAisle ? "aisle" : "middle");
    });
  });
  return kinds;
}

const SEAT_ID = /^(\d+)([A-Z])$/;

/** "22A" → { row: 22, letter: "A" }; null for anything else. */
export function parseSeatId(id: string): { row: number; letter: string } | null {
  const m = SEAT_ID.exec(id);
  return m ? { row: Number(m[1]), letter: m[2] } : null;
}

export function wingPosition(row: number, map: Pick<SeatMap, "wingStartRow" | "wingEndRow">): WingPosition {
  if (row < map.wingStartRow) return "Ahead of the wing";
  if (row > map.wingEndRow) return "Behind the wing";
  return "Over the wing";
}

export interface SeatInfo {
  id: string;
  row: number;
  letter: string;
  kind: SeatKind;
  zone: SeatZone;
  exit: boolean;
  position: WingPosition;
  occupied: boolean;
  /** 0-based rank among the recommended seats, or -1. */
  rank: number;
}

/** Everything the UI says about one seat; null if the id is not on this map. */
export function describeSeat(map: SeatMap, id: string): SeatInfo | null {
  const parsed = parseSeatId(id);
  if (!parsed) return null;
  const row = map.rows.find((r) => r.row === parsed.row);
  const kind = seatKinds(map.columnGroups).get(parsed.letter);
  if (!row || !kind) return null;
  return {
    id,
    row: row.row,
    letter: parsed.letter,
    kind,
    zone: row.zone,
    exit: row.exit,
    position: wingPosition(row.row, map),
    occupied: map.occupied.includes(id),
    rank: map.recommended.indexOf(id),
  };
}

/** ["Window", "Over the wing", "Exit row", "Smoothest zone"] — joined with " · " after "Seat 15A". */
export function seatDetailParts(info: SeatInfo): string[] {
  const parts = [KIND_LABEL[info.kind], info.position];
  if (info.exit) parts.push("Exit row");
  parts.push(ZONE_SHORT[info.zone]);
  return parts;
}

/** "Seat 15A · Window · Over the wing · Smoothest zone" */
export function seatDetailLine(info: SeatInfo): string {
  return [`Seat ${info.id}`, ...seatDetailParts(info)].join(" · ");
}

/** Row the map should centre on when it first opens: the top pick, else the middle of the wing. */
export function focusRowFor(map: SeatMap): number | null {
  const pick = map.recommended[0] ? parseSeatId(map.recommended[0]) : null;
  if (pick) return pick.row;
  const wingRows = map.rows.filter((r) => r.row >= map.wingStartRow && r.row <= map.wingEndRow);
  if (wingRows.length > 0) return wingRows[Math.floor(wingRows.length / 2)].row;
  return map.rows[0]?.row ?? null;
}

/** Collapsed-header line: "Smoothest: rows 14–19, over the wing". */
export function seatTeaserLine(map: SeatMap): string {
  if (map.wingStartRow === map.wingEndRow) return `Smoothest: row ${map.wingStartRow}, over the wing`;
  return `Smoothest: rows ${map.wingStartRow}–${map.wingEndRow}, over the wing`;
}

// ── Grid geometry ───────────────────────────────────────────────────────────
// One CSS grid: [wing strip] [seats…] [aisle] [seats…] ([aisle] [seats…]) [wing strip].
// Seats are fluid (1fr each) down to MIN_SEAT_PX, so they stay tappable; below
// that (a 3-4-3 wide-body at 320–340px) the map scrolls sideways inside its own
// box (gridMinWidth). Aisles keep room for a two-digit row number; the wing
// strips host the wing shape and the exit markers.

const WING_MIN_PX = 14;
const AISLE_MIN_PX = 22;
/** Smallest seat button: the map scrolls sideways inside its box rather than shrink seats below this. */
export const MIN_SEAT_PX = 24;

export const WING_COL = `minmax(${WING_MIN_PX}px, 0.55fr)`;
export const AISLE_COL = `minmax(${AISLE_MIN_PX}px, 0.8fr)`;
export const SEAT_COL = `minmax(${MIN_SEAT_PX}px, 1fr)`;

/** Upper bound on seat size so a 3-3 narrow-body doesn't balloon on wide screens. */
export const MAX_SEAT_PX = 36;
export const GRID_COLUMN_GAP_PX = 2;

export function gridTemplate(groups: string[][]): string {
  const inner = groups.map((g) => `repeat(${g.length}, ${SEAT_COL})`).join(` ${AISLE_COL} `);
  return `${WING_COL} ${inner} ${WING_COL}`;
}

export function seatCount(groups: string[][]): number {
  return groups.reduce((n, g) => n + g.length, 0);
}

/** Total grid columns: wing strips + seats + aisles. */
export function gridColumnCount(groups: string[][]): number {
  return seatCount(groups) + Math.max(0, groups.length - 1) + 2;
}

/** 1-based CSS grid column of a seat letter (column 1 is the left wing strip); -1 if unknown. */
export function seatColumn(groups: string[][], letter: string): number {
  let col = 2;
  for (const group of groups) {
    const i = group.indexOf(letter);
    if (i >= 0) return col + i;
    col += group.length + 1;
  }
  return -1;
}

/** Width in px at which seats reach MAX_SEAT_PX; the grid is centred below that. */
export function gridMaxWidth(groups: string[][]): number {
  const seats = seatCount(groups);
  const aisles = Math.max(0, groups.length - 1);
  const cols = gridColumnCount(groups);
  return seats * MAX_SEAT_PX + aisles * 30 + 2 * 22 + (cols - 1) * GRID_COLUMN_GAP_PX;
}

/**
 * Width in px (including the grid's 4px side padding) below which seats would drop under
 * MIN_SEAT_PX: the grid keeps this width and its box scrolls sideways instead.
 */
export function gridMinWidth(groups: string[][]): number {
  const seats = seatCount(groups);
  const aisles = Math.max(0, groups.length - 1);
  const cols = gridColumnCount(groups);
  return seats * MIN_SEAT_PX + aisles * AISLE_MIN_PX + 2 * WING_MIN_PX + (cols - 1) * GRID_COLUMN_GAP_PX + 8;
}

/** "#3c9e89" + 0.35 → "rgb(60 158 137 / 0.35)" (falls back to the input for non-hex). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${alpha})`;
}
