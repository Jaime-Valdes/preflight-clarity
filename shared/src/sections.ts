import type { DashboardPart, SectionId, Variant } from "./types";

/**
 * What a section is meant to give the participant. Internal only — never
 * shown to participants (it would prime them).
 */
export type Dimension = "predictability" | "control" | "trust";

export interface SectionMeta {
  id: SectionId;
  /** Participant-facing title. */
  title: string;
  dimension: Dimension;
}

/** Display order on the full dashboard (variant A) — same order as the brief. */
export const SECTIONS: readonly SectionMeta[] = [
  { id: "turbulence", title: "Turbulence forecast", dimension: "predictability" },
  { id: "pilot", title: "Who flies your plane", dimension: "trust" },
  { id: "aircraft", title: "Your aircraft", dimension: "trust" },
  { id: "airline", title: "Airline safety & comfort", dimension: "trust" },
  { id: "weather", title: "Weather", dimension: "predictability" },
  { id: "seat", title: "Best seat for smoothness", dimension: "control" },
  { id: "sounds", title: "What you'll hear & feel", dimension: "predictability" },
  { id: "compare", title: "Compare smoother options", dimension: "control" },
  { id: "alerts", title: "Forecast alerts", dimension: "control" },
];

export const SECTION_IDS: readonly SectionId[] = SECTIONS.map((s) => s.id);

/** Sections shown per variant, in display order. */
export const VARIANT_SECTIONS: Record<Variant, readonly SectionId[]> = {
  A: SECTION_IDS,
  B: ["turbulence"],
};

/** Labels used in the post-survey multi-selects and on the results page. */
export const PART_LABELS: Record<DashboardPart, string> = {
  summary: "Smoothness score & summary",
  turbulence: "Turbulence forecast",
  pilot: "Who flies your plane",
  aircraft: "Your aircraft",
  airline: "Airline safety & comfort",
  weather: "Weather",
  seat: "Best seat for smoothness",
  sounds: "What you'll hear & feel",
  compare: "Compare smoother options",
  alerts: "Forecast alerts",
};

export const ALL_PARTS: readonly DashboardPart[] = ["summary", ...SECTION_IDS];

/** Dashboard parts a participant in this variant actually saw. */
export function partsForVariant(variant: Variant): DashboardPart[] {
  return ["summary", ...VARIANT_SECTIONS[variant]];
}

export function sectionMeta(id: SectionId): SectionMeta {
  const meta = SECTIONS.find((s) => s.id === id);
  if (!meta) throw new Error(`Unknown section: ${id}`);
  return meta;
}

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && (SECTION_IDS as readonly string[]).includes(value);
}

export function isDashboardPart(value: unknown): value is DashboardPart {
  return value === "summary" || isSectionId(value);
}
