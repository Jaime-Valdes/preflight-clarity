import type { FlightPhase, Intensity, SeatZone, SoundMoment } from "@preflight/shared/types";

/*
 * Design tokens that JavaScript needs (charts, inline SVG). Tailwind classes
 * use the matching CSS variables in app/globals.css. Palette rule: calm and
 * soft. Never red/rose/orange; the strongest "caution" colour is soft sand.
 */

export type Tone = "calm" | "breeze" | "dusk" | "sand" | "neutral";

/** Tailwind class bundles for tinted chips, pills and icon badges. */
export const TONE_CLASSES: Record<Tone, { bg: string; text: string; ring: string; solid: string }> = {
  calm: { bg: "bg-calm-50", text: "text-calm-700", ring: "ring-calm-100", solid: "bg-calm-500" },
  breeze: { bg: "bg-breeze-50", text: "text-breeze-700", ring: "ring-breeze-100", solid: "bg-breeze-500" },
  dusk: { bg: "bg-dusk-50", text: "text-dusk-700", ring: "ring-dusk-100", solid: "bg-dusk-500" },
  sand: { bg: "bg-sand-50", text: "text-sand-700", ring: "ring-sand-100", solid: "bg-sand-400" },
  neutral: { bg: "bg-canvas", text: "text-ink-700", ring: "ring-line", solid: "bg-ink-400" },
};

/** Raw colour values (mirror app/globals.css) for Recharts and SVG. */
export const COLORS = {
  ink900: "#0e1a2b",
  ink700: "#2f3f55",
  ink500: "#5f6f85",
  ink400: "#8493a7",
  ink300: "#aab6c5",
  line: "#e3e9f0",
  canvas: "#f3f6f9",
  surface: "#ffffff",
  night900: "#10243a",
  calm100: "#d5efe8",
  calm300: "#85cdbb",
  calm500: "#3c9e89",
  calm700: "#26685b",
  breeze100: "#dbe9f7",
  breeze300: "#93bde3",
  breeze400: "#6aa2d4",
  breeze500: "#4a87c0",
  breeze700: "#2d5680",
  dusk100: "#e8e4f6",
  dusk400: "#9d8fd6",
  dusk600: "#6a59ab",
  sand100: "#f8ebd2",
  sand300: "#eac283",
  sand400: "#dfa95c",
  sand500: "#c98f3f",
  sand700: "#845b27",
} as const;

export const INTENSITY: Record<
  Intensity,
  { label: string; short: string; color: string; soft: string; text: string; tone: Tone; level: number }
> = {
  none: { label: "Smooth", short: "Smooth", color: COLORS.calm300, soft: "#e6f5f0", text: COLORS.calm700, tone: "calm", level: 0 },
  light: { label: "Light bumps", short: "Light", color: COLORS.breeze300, soft: "#e6f0fa", text: COLORS.breeze700, tone: "breeze", level: 1 },
  moderate: { label: "Moderate bumps", short: "Moderate", color: COLORS.sand300, soft: "#fbf0dc", text: COLORS.sand700, tone: "sand", level: 2 },
};

/** Maps a continuous 0–2 turbulence level to its band. */
export function intensityForLevel(level: number): Intensity {
  if (level < 0.5) return "none";
  if (level < 1.5) return "light";
  return "moderate";
}

export const PHASE_LABEL: Record<FlightPhase, string> = {
  takeoff: "Takeoff",
  climb: "Climb",
  cruise: "Cruise",
  descent: "Descent",
  landing: "Landing",
};

export const PHASE_ORDER: readonly FlightPhase[] = ["takeoff", "climb", "cruise", "descent", "landing"];

export const SOUND_MOMENT_LABEL: Record<SoundMoment, string> = {
  boarding: "Boarding",
  taxi: "Taxi",
  takeoff: "Takeoff",
  climb: "Climb",
  cruise: "Cruise",
  descent: "Descent",
  landing: "Landing",
};

export const SEAT_ZONE: Record<SeatZone, { label: string; fill: string; stroke: string; tone: Tone }> = {
  smoothest: { label: "Smoothest · over the wing", fill: "#cfeee4", stroke: COLORS.calm500, tone: "calm" },
  smooth: { label: "Smooth · forward cabin", fill: "#e3eef9", stroke: COLORS.breeze300, tone: "breeze" },
  more_motion: { label: "A little more motion · rear cabin", fill: "#f1f4f8", stroke: COLORS.ink300, tone: "neutral" },
};

/** Shared Recharts styling. */
export const CHART = {
  grid: COLORS.line,
  axis: COLORS.ink400,
  tick: { fill: COLORS.ink500, fontSize: 11 },
  tooltip: {
    contentStyle: {
      borderRadius: 14,
      border: `1px solid ${COLORS.line}`,
      boxShadow: "0 10px 30px -14px rgb(14 26 43 / 0.25)",
      fontSize: 12,
      padding: "8px 10px",
    },
    labelStyle: { color: COLORS.ink500, fontWeight: 600 },
  },
} as const;
