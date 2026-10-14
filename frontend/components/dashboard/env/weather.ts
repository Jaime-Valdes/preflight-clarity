import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import type { WeatherCondition, WeatherReport } from "@preflight/shared/types";
import type { Tone } from "@/lib/theme";

/*
 * Presentation helpers for the Weather section: which icon and tint a
 * generated WeatherReport gets, plus small formatting helpers. Pure.
 */

const DAY_ICON: Record<WeatherCondition, LucideIcon> = {
  clear: Sun,
  mostly_clear: CloudSun,
  partly_cloudy: CloudSun,
  cloudy: Cloud,
  light_rain: CloudDrizzle,
  showers: CloudRain,
  fog: CloudFog,
  light_snow: CloudSnow,
  breezy: Wind,
};

/** Moon variants for the sky conditions where "sun" would look wrong at night. */
const NIGHT_ICON: Partial<Record<WeatherCondition, LucideIcon>> = {
  clear: Moon,
  mostly_clear: CloudMoon,
  partly_cloudy: CloudMoon,
};

/** Rough night check from a local "HH:MM" — only used to pick a moon icon. */
export function isNight(localTime: string): boolean {
  const hour = Number(localTime.split(":")[0]);
  return Number.isFinite(hour) && (hour < 6 || hour >= 20);
}

export function conditionIcon(report: WeatherReport): LucideIcon {
  const night = isNight(report.localTime);
  return (night ? NIGHT_ICON[report.condition] : undefined) ?? DAY_ICON[report.condition] ?? Cloud;
}

/** Teal when the weather has no effect on the flight, sky blue for a minor one. Never anything stronger. */
export function conditionTone(report: WeatherReport): Tone {
  return report.impact === "none" ? "calm" : "breeze";
}

/** Very light background tint for a weather card, keyed by its tone. */
export const CARD_TINT: Record<Tone, string> = {
  calm: "bg-linear-to-b from-calm-50/70 to-canvas/40",
  breeze: "bg-linear-to-b from-breeze-50/70 to-canvas/40",
  dusk: "bg-linear-to-b from-dusk-50/70 to-canvas/40",
  sand: "bg-linear-to-b from-sand-50/70 to-canvas/40",
  neutral: "bg-canvas/70",
};

/** Where a compass point sits, in degrees clockwise from north. */
const COMPASS_DEGREES: Record<string, number> = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSW: 202.5,
  SW: 225,
  WSW: 247.5,
  W: 270,
  WNW: 292.5,
  NW: 315,
  NNW: 337.5,
};

/**
 * Rotation for an "up" arrow so it points where the wind is blowing *to*
 * (wind from the south → arrow points north), the convention weather apps use.
 * Null for a direction we don't recognise.
 */
export function windArrowRotation(windDir: string): number | null {
  const from = COMPASS_DEGREES[windDir.trim().toUpperCase()];
  return from === undefined ? null : (from + 180) % 360;
}

/** "Rain" for everything except snow. */
export function precipLabel(condition: WeatherCondition): string {
  return condition === "light_snow" ? "Snow" : "Rain";
}

/** "next day", "2 days later", "day before" — or null when arrival is on the departure date. */
export function dayOffsetLabel(offset: number): string | null {
  if (!Number.isFinite(offset) || offset === 0) return null;
  if (offset === 1) return "next day";
  if (offset === -1) return "day before";
  return offset > 1 ? `${offset} days later` : `${-offset} days before`;
}
