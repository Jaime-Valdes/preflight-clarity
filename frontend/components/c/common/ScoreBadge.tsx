import { COLORS } from "@/lib/theme";
import { cn } from "@/lib/cn";

/*
 * Version C: compact smoothness score — a small calm ring with the number,
 * and optionally the label next to it. Same palette as the dashboard's ring
 * (always calm: a lower score is never shown as alarming).
 */

interface ScoreBadgeProps {
  score: number;
  /** "Very smooth" | "Mostly smooth" | "Some bumps expected" */
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZES = { sm: 36, md: 48, lg: 64 } as const;

export function ScoreBadge({ score, label, size = "md", className }: ScoreBadgeProps) {
  const value = Math.max(0, Math.min(100, Math.round(score)));
  const px = SIZES[size];
  const stroke = size === "sm" ? 3.5 : 4.5;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="relative inline-grid shrink-0 place-items-center" style={{ width: px, height: px }}>
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} aria-hidden className="-rotate-90">
          <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke={COLORS.calm100} strokeWidth={stroke} />
          <circle
            cx={px / 2}
            cy={px / 2}
            r={r}
            fill="none"
            stroke={COLORS.calm500}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(c * value) / 100} ${c}`}
          />
        </svg>
        <span
          className={cn(
            "absolute font-bold tabular-nums text-ink-900",
            size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-lg",
          )}
        >
          {value}
        </span>
      </span>
      <span className="sr-only">Smoothness score {value} out of 100{label ? `, ${label}` : ""}</span>
      {label ? (
        <span aria-hidden className="text-sm font-semibold leading-tight text-ink-700">
          {label}
        </span>
      ) : null}
    </span>
  );
}
