import { cn } from "@/lib/cn";

/*
 * Version C: a small, calm stand-in for an airline logo — the IATA code on a
 * tinted tile. The colour is derived from the code, so each airline keeps it.
 * Decorative: the airline's name is always written next to it.
 */

const TILES = [
  "bg-night-900 text-white",
  "bg-calm-100 text-calm-700",
  "bg-breeze-100 text-breeze-700",
  "bg-dusk-100 text-dusk-600",
  "bg-sand-100 text-sand-700",
  "bg-breeze-500 text-white",
  "bg-calm-500 text-white",
] as const;

function tileFor(code: string): string {
  let h = 0;
  for (const ch of code) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return TILES[h % TILES.length]!;
}

interface AirlineMarkProps {
  code: string;
  size?: "sm" | "md";
  className?: string;
}

export function AirlineMark({ code, size = "md", className }: AirlineMarkProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-xl font-bold tracking-wide",
        size === "sm" ? "size-7 text-[10px]" : "size-10 text-xs",
        tileFor(code),
        className,
      )}
    >
      {code}
    </span>
  );
}
