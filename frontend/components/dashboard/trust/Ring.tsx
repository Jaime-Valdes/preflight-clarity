import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface RingProps {
  /** 0..max */
  value: number;
  max?: number;
  /** Rendered size in px. */
  size?: number;
  stroke?: number;
  /** Accessible description, e.g. "Safety score 97 out of 100". */
  label: string;
  /** Centred content (the hero number). */
  children?: ReactNode;
  className?: string;
}

/** Soft progress ring: a calm-100 track with a calm-500 arc. */
export function Ring({ value, max = 100, size = 120, stroke = 10, label, children, className }: RingProps) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="size-full -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} className="fill-none stroke-calm-100" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="fill-none stroke-calm-500"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference * fraction} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
