import { cn } from "@/lib/cn";

/** "Cloud 9" in the intro's hand-lettered spirit: the type we already load, set tight, with a sun swash underneath. */
export function DWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block", className)}>
      <span className="relative z-10 text-[26px] font-extrabold leading-none tracking-[-0.03em] text-ink">Cloud 9</span>
      <svg aria-hidden viewBox="0 0 96 14" className="absolute -bottom-1.5 left-0 h-3.5 w-full overflow-visible">
        <path d="M2 10C24 3 48 2 94 8" fill="none" stroke="var(--color-sun)" strokeWidth="6" strokeLinecap="round" />
      </svg>
    </span>
  );
}
