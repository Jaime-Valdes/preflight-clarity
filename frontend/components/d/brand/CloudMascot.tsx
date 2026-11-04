import { cn } from "@/lib/cn";

/*
 * The Cloud9 mascot for version D (docs/ui-d-theme.md): a soft, rounded cloud
 * with a thick ink outline, a cream fill, dot eyes that blink now and then,
 * a small smile and sun cheeks. Inline SVG, no assets. Floats slowly when
 * `float` is on; both motions end at rest under reduced motion.
 */

interface CloudMascotProps {
  /** Width in CSS; the drawing keeps its 5:4 shape. */
  className?: string;
  float?: boolean;
  /** Decorative by default; pass a label when it stands in for text (an empty state). */
  label?: string;
}

export function CloudMascot({ className, float = true, label }: CloudMascotProps) {
  return (
    <span className={cn("inline-block", float && "animate-d-float", className)}>
      <svg
        viewBox="0 0 120 96"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        className="block h-auto w-full overflow-visible"
      >
        {/* Body: one closed outline so the stroke never crosses itself. */}
        <path
          d="M24 74C8 74 6 54 20 50C16 36 32 26 42 35C44 17 68 13 75 30C87 23 103 34 97 50C111 52 111 74 96 74Z"
          fill="var(--color-cream)"
          stroke="var(--color-ink)"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        {/* Cheeks */}
        <ellipse cx="41" cy="59" rx="4.4" ry="2.9" fill="var(--color-sun)" />
        <ellipse cx="75" cy="59" rx="4.4" ry="2.9" fill="var(--color-sun)" />
        {/* Eyes: a blink scales them shut from their own centre. */}
        <g className="animate-d-blink" style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          <circle cx="49" cy="52" r="3.4" fill="var(--color-ink)" />
          <circle cx="67" cy="52" r="3.4" fill="var(--color-ink)" />
        </g>
        {/* Smile */}
        <path d="M52 60.5C55 64.5 61 64.5 64 60.5" fill="none" stroke="var(--color-ink)" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}
