import type { BodyType } from "@preflight/shared/types";
import { cn } from "@/lib/cn";

interface PlaneSilhouetteProps {
  bodyType: BodyType;
  /** Used for the accessible label, e.g. "Airbus A321neo". */
  name: string;
  className?: string;
}

/*
 * Simple top-down airliner silhouettes in soft breeze tones. Both share a
 * 200×220 viewBox; the wide-body has a wider fuselage, longer wings and
 * bigger engines, and is rendered visibly larger.
 */
const SHAPES: Record<
  BodyType,
  { fuselage: string; wings: string[]; tails: string[]; engines: Array<{ x: number; y: number; w: number; h: number }>; fin: { x: number; y: number; w: number; h: number }; cockpit: { x: number; y: number; w: number; h: number } }
> = {
  narrow: {
    fuselage: "M100 6 C108 6 111 18 111 34 L111 158 C111 176 107 194 100 206 C93 194 89 176 89 158 L89 34 C89 18 92 6 100 6 Z",
    wings: ["M89 86 L14 146 L14 155 L89 112 Z", "M111 86 L186 146 L186 155 L111 112 Z"],
    tails: ["M91 172 L62 196 L62 202 L91 190 Z", "M109 172 L138 196 L138 202 L109 190 Z"],
    engines: [
      { x: 52, y: 100, w: 12, h: 34 },
      { x: 136, y: 100, w: 12, h: 34 },
    ],
    fin: { x: 99, y: 160, w: 2, h: 34 },
    cockpit: { x: 94, y: 18, w: 12, h: 7 },
  },
  wide: {
    fuselage: "M100 4 C111 4 115 18 115 36 L115 160 C115 180 109 198 100 212 C91 198 85 180 85 160 L85 36 C85 18 89 4 100 4 Z",
    wings: ["M85 84 L4 150 L4 160 L85 116 Z", "M115 84 L196 150 L196 160 L115 116 Z"],
    tails: ["M87 176 L52 204 L52 211 L87 196 Z", "M113 176 L148 204 L148 211 L113 196 Z"],
    engines: [
      { x: 46, y: 100, w: 16, h: 40 },
      { x: 138, y: 100, w: 16, h: 40 },
    ],
    fin: { x: 98.5, y: 164, w: 3, h: 36 },
    cockpit: { x: 92, y: 18, w: 16, h: 8 },
  },
};

export function PlaneSilhouette({ bodyType, name, className }: PlaneSilhouetteProps) {
  const s = SHAPES[bodyType];
  const wide = bodyType === "wide";
  return (
    <svg
      viewBox="0 0 200 220"
      role="img"
      aria-label={`${name} seen from above`}
      className={cn("h-auto max-w-full", wide ? "w-[236px]" : "w-[164px]", className)}
    >
      <g className="stroke-breeze-300" strokeWidth={1.5} strokeLinejoin="round">
        {s.wings.map((d) => (
          <path key={d} d={d} className="fill-breeze-50" />
        ))}
        {s.tails.map((d) => (
          <path key={d} d={d} className="fill-breeze-50" />
        ))}
        {s.engines.map((e) => (
          <rect key={e.x} x={e.x} y={e.y} width={e.w} height={e.h} rx={e.w / 2} className="fill-breeze-200" />
        ))}
        <path d={s.fuselage} className="fill-breeze-100" />
      </g>
      <rect x={s.fin.x} y={s.fin.y} width={s.fin.w} height={s.fin.h} rx={1} className="fill-breeze-300" />
      <rect x={s.cockpit.x} y={s.cockpit.y} width={s.cockpit.w} height={s.cockpit.h} rx={3.5} className="fill-breeze-300" />
    </svg>
  );
}
