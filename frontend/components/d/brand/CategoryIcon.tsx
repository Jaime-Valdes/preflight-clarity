import { Armchair, Plane, PlaneTakeoff, Waves, type LucideIcon } from "lucide-react";
import type { RatingCategory } from "@preflight/shared/ratings";
import { cn } from "@/lib/cn";

/** One outlined icon per rating category, in the mascot's ink-line style. */
const ICONS: Record<RatingCategory, LucideIcon> = {
  cruise: Waves,
  takeoff_landing: PlaneTakeoff,
  aircraft: Plane,
  space: Armchair,
};

export function CategoryIcon({ category, size = "md", className }: { category: RatingCategory; size?: "sm" | "md"; className?: string }) {
  const Icon = ICONS[category];
  return <Icon aria-hidden strokeWidth={2.25} className={cn(size === "sm" ? "size-4" : "size-5", "shrink-0 text-ink", className)} />;
}
