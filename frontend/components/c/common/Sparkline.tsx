import type { TurbulencePoint } from "@preflight/shared/types";
import { COLORS } from "@/lib/theme";
import { cn } from "@/lib/cn";

/*
 * Version C: a tiny turbulence timeline for result cards — expected motion
 * from takeoff to landing (level 0 smooth … 2 moderate). Plain SVG so a page
 * of results stays light. Decorative unless `label` is given.
 */

interface SparklineProps {
  points: readonly TurbulencePoint[];
  /** Drawing width in px; with `fluid`, the width of the coordinate space (the SVG then fills its container). */
  width?: number;
  height?: number;
  /** Stretch to the container's width (the line keeps its thickness). */
  fluid?: boolean;
  /** Text alternative; omit when the same facts are written next to it. */
  label?: string;
  className?: string;
}

export function Sparkline({ points, width = 120, height = 28, fluid = false, label, className }: SparklineProps) {
  if (points.length < 2) return null;
  const last = points[points.length - 1]!.minute || 1;
  const pad = 2;
  const x = (minute: number) => pad + ((width - pad * 2) * minute) / last;
  // Level 2 (moderate) reaches the top; smooth air sits on the baseline.
  const y = (level: number) => height - pad - ((height - pad * 2) * Math.min(2, Math.max(0, level))) / 2;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.minute).toFixed(1)},${y(p.level).toFixed(1)}`).join("");
  const area = `${line}L${x(last).toFixed(1)},${height - pad}L${x(0).toFixed(1)},${height - pad}Z`;
  // A stretched drawing must not stretch its strokes.
  const stroke = fluid ? ({ vectorEffect: "non-scaling-stroke" } as const) : {};
  return (
    <svg
      width={fluid ? "100%" : width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio={fluid ? "none" : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", fluid && "block", className)}
    >
      <line x1={pad} x2={width - pad} y1={y(1)} y2={y(1)} stroke={COLORS.line} strokeDasharray="2 3" {...stroke} />
      <path d={area} fill={COLORS.calm100} opacity={0.7} />
      <path d={line} fill="none" stroke={COLORS.calm500} strokeWidth={1.6} strokeLinejoin="round" {...stroke} />
    </svg>
  );
}
