import { useId } from "react";
import { cn } from "@/lib/cn";

/** The app mark (same drawing as app/icon.svg): a plane climbing over a sea-glass horizon on night navy. Decorative. */
export function BrandMark({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn("size-8 shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1b3a58" />
          <stop offset="1" stopColor="#0b1a2c" />
        </linearGradient>
        <linearGradient id={`${id}-sea`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9bdac9" />
          <stop offset="1" stopColor="#3c9e89" />
        </linearGradient>
        <clipPath id={`${id}-tile`}>
          <rect width="64" height="64" rx="15" />
        </clipPath>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${id}-sky)`} />
      <g clipPath={`url(#${id}-tile)`}>
        <circle cx="32" cy="92" r="52" fill={`url(#${id}-sea)`} />
      </g>
      <g fill="#f3f6f9">
        <rect x="28.5" y="8" width="7" height="34" rx="3.5" />
        <path d="M32 19 L9 34 V39.5 L32 32.5 L55 39.5 V34 Z" />
        <path d="M32 35.5 L22.5 43 V46.5 L32 44 L41.5 46.5 V43 Z" />
      </g>
    </svg>
  );
}
