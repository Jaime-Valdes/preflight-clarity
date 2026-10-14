import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE_CLASSES, type Tone } from "@/lib/theme";

interface PillProps {
  children: ReactNode;
  tone?: Tone;
  /** Optional leading icon, e.g. <Check className="size-3.5" />. */
  icon?: ReactNode;
  className?: string;
}

/** Small rounded label: "Up to date", "Wide-body", "Light bumps". */
export function Pill({ children, tone = "neutral", icon, className }: PillProps) {
  const t = TONE_CLASSES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
        t.bg,
        t.text,
        t.ring,
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
