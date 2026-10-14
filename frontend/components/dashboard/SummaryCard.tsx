"use client";

import { Info } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import type { Flight, ForecastStatus, Intensity, SectionContext } from "@preflight/shared/types";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";
import { COLORS, INTENSITY, PHASE_LABEL } from "@/lib/theme";

interface SummaryCardProps {
  flight: Flight;
  ctx: SectionContext;
  className?: string;
}

const RING = 104;
const STROKE = 9;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Short "how we know" line under the score. */
function basisLine(forecast: ForecastStatus): string {
  switch (forecast.mode) {
    case "history":
      return `${forecast.confidenceLabel} · based on route history`;
    case "outlook":
      return `${forecast.confidenceLabel} · seasonal outlook and route history`;
    case "forecast":
      return `${forecast.confidenceLabel} · latest forecast for your flight`;
  }
}

function ScoreRing({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const target = CIRCUMFERENCE * (1 - clamped / 100);
  const gradientId = `score-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const arcRef = useRef<SVGCircleElement>(null);

  // Gentle fill-in on mount (skipped when the viewer prefers reduced motion).
  useEffect(() => {
    const arc = arcRef.current;
    if (!arc || typeof arc.animate !== "function") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const animation = arc.animate(
      [{ strokeDashoffset: CIRCUMFERENCE }, { strokeDashoffset: target }],
      { duration: 1100, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
    return () => animation.cancel();
  }, [target]);

  return (
    <div
      role="img"
      aria-label={`Smoothness score ${clamped} out of 100`}
      className="relative shrink-0"
      style={{ width: RING, height: RING }}
    >
      <svg viewBox={`0 0 ${RING} ${RING}`} className="size-full -rotate-90" aria-hidden>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={COLORS.calm300} />
            <stop offset="100%" stopColor={COLORS.calm500} />
          </linearGradient>
        </defs>
        <circle cx={RING / 2} cy={RING / 2} r={RADIUS} fill="none" stroke={COLORS.calm100} strokeWidth={STROKE} />
        <circle
          ref={arcRef}
          cx={RING / 2}
          cy={RING / 2}
          r={RADIUS}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={target}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[32px] font-bold leading-none tracking-tight text-ink-900">{clamped}</span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">of 100</span>
      </div>
    </div>
  );
}

/**
 * The headline card: smoothness score ring, label, one-line summary, how the
 * estimate was made, and a five-phase intensity strip.
 */
export function SummaryCard({ flight, ctx, className }: SummaryCardProps) {
  const { smoothness, turbulence } = flight;
  const present = new Set<Intensity>(turbulence.phases.map((p) => p.intensity));
  const legend = (["none", "light", "moderate"] as const).filter((level) => present.has(level));

  return (
    <Card className={cn("p-5", className)}>
      <div className="flex items-center gap-4">
        <ScoreRing score={smoothness.score} />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Smoothness score</p>
          <p className="mt-1 text-xl font-bold leading-tight text-ink-900">{smoothness.label}</p>
          <p className="mt-1.5 text-xs text-ink-500">Higher is smoother</p>
        </div>
      </div>

      <p className="mt-4 text-[15px] leading-relaxed text-ink-700">{smoothness.summary}</p>
      <p className="mt-2.5 flex items-start gap-1.5 text-xs leading-snug text-ink-500">
        <Info aria-hidden className="mt-px size-3.5 shrink-0 text-breeze-500" />
        <span>{basisLine(ctx.forecast)}</span>
      </p>

      <div className="mt-4 border-t border-line/70 pt-4">
        <div className="flex gap-0.5" role="img" aria-label="Expected intensity by flight phase">
          {turbulence.phases.map((p) => (
            <span
              key={p.phase}
              className="h-2 flex-1 first:rounded-l-full last:rounded-r-full"
              style={{ background: INTENSITY[p.intensity].color }}
            />
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-5 text-center text-[10.5px] font-medium text-ink-500">
          {turbulence.phases.map((p) => (
            <span key={p.phase} className="truncate">
              {PHASE_LABEL[p.phase]}
            </span>
          ))}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-500">
          {legend.map((level) => (
            <li key={level} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: INTENSITY[level].color }} />
              {INTENSITY[level].label}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
