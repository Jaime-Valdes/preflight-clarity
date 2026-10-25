import { cn } from "@/lib/cn";

/*
 * The Cloud9 mark: a chubby, slightly lopsided cloud with a content face
 * (closed eyes, a small smile, calm-teal cheeks). One geometry, in a 64-unit
 * box, drawn with solid-fill circles, rects, ellipses and paths only, so the
 * same shapes render in the browser and in next/og (app/apple-icon.tsx and the
 * share images). app/icon.svg is the same cloud without the face: at 16px the
 * face smears, so the browser tab shows the plain cloud and the face appears
 * from 24px up (headers, home-screen icon, link previews).
 */

export type MarkTone = "onNavy" | "onLight";

const CLOUD: Record<MarkTone, string> = { onNavy: "#f3f6f9", onLight: "#10243a" };
const INK: Record<MarkTone, string> = { onNavy: "#10243a", onLight: "#f3f6f9" };
/** calm-300: the cheeks, the one accent in both tones. */
const BLUSH = "#85cdbb";

/** The shapes alone, for callers that draw their own `<svg viewBox="0 0 64 64">` (next/og). */
export function CloudMarkShapes({ tone = "onNavy", face = true }: { tone?: MarkTone; face?: boolean }) {
  const cloud = CLOUD[tone];
  const ink = INK[tone];
  return (
    <>
      <circle cx="39" cy="27" r="13" fill={cloud} />
      <circle cx="18" cy="33" r="10" fill={cloud} />
      <circle cx="14" cy="43" r="6" fill={cloud} />
      <circle cx="49" cy="41.5" r="7.5" fill={cloud} />
      <rect x="14" y="33" width="35" height="16" fill={cloud} />
      {face ? (
        <>
          {/* Closed eyes: thick arcs with round caps, each one closed subpath. */}
          <path d="M21.06 33.29 A7 7 0 0 1 32.94 33.29 A2.2 2.2 0 0 1 29.2 35.62 A2.6 2.6 0 0 0 24.8 35.62 A2.2 2.2 0 0 1 21.06 33.29 Z" fill={ink} />
          <path d="M36.06 33.29 A7 7 0 0 1 47.94 33.29 A2.2 2.2 0 0 1 44.2 35.62 A2.6 2.6 0 0 0 39.8 35.62 A2.2 2.2 0 0 1 36.06 33.29 Z" fill={ink} />
          <ellipse cx="20" cy="42" rx="3.2" ry="2.6" fill={BLUSH} />
          <ellipse cx="48" cy="42" rx="3.2" ry="2.6" fill={BLUSH} />
          <path d="M30.54 44.46 A5.6 5.6 0 0 0 38.46 44.46 A1.6 1.6 0 0 0 36.2 42.2 A2.4 2.4 0 0 1 32.8 42.2 A1.6 1.6 0 0 0 30.54 44.46 Z" fill={ink} />
        </>
      ) : null}
    </>
  );
}

interface CloudMarkProps {
  /** `onNavy` (default) is the white cloud for dark tiles; `onLight` the navy cloud for light surfaces. */
  tone?: MarkTone;
  face?: boolean;
  className?: string;
}

/** The mark as an inline SVG. Decorative: the product name is always written out beside it. */
export function CloudMark({ tone = "onNavy", face = true, className }: CloudMarkProps) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("shrink-0", className)}>
      <CloudMarkShapes tone={tone} face={face} />
    </svg>
  );
}

/** The mark on its night-navy rounded tile (the same drawing as the app icon), for headers. Size it with a `size-*` class. */
export function BrandTile({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-night-900 shadow-soft",
        className,
      )}
    >
      {/* Slightly larger than the tile so the cloud fills it the way the favicon does. */}
      <CloudMark className="size-[112%]" />
    </span>
  );
}
