import { CalendarClock } from "lucide-react";
import { cn } from "@/lib/cn";
import { marker, type PendingItem } from "@/components/c/common/availability";

interface PendingNoteProps {
  item: PendingItem;
  /** Departure date ("YYYY-MM-DD"). */
  date: string;
  /** Overrides the subject: "Smoothness score", "Turbulence timeline"… */
  subject?: string;
  /** "inline": one small line (lists, table cells). "block": a quiet tile. */
  variant?: "inline" | "block";
  className?: string;
}

/**
 * Version C: calm marker for a flight-specific item that doesn't exist yet at
 * this distance from departure — "Turbulence forecast from Tue, Nov 24 · 2 days
 * before departure". Never a made-up value (docs/FEASIBILITY.md).
 */
export function PendingNote({ item, date, subject, variant = "inline", className }: PendingNoteProps) {
  const m = marker(item, date, subject);
  if (variant === "block") {
    return (
      <div className={cn("flex items-start gap-3 rounded-2xl bg-breeze-50/70 p-3.5 ring-1 ring-inset ring-breeze-100", className)}>
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface text-breeze-700 ring-1 ring-inset ring-breeze-100"
        >
          <CalendarClock className="size-[18px]" />
        </span>
        <p className="min-w-0 text-sm leading-snug">
          <span className="block font-semibold text-ink-900">
            {m.subject} from <span className="whitespace-nowrap">{m.from}</span>
          </span>
          <span className="sr-only">, </span>
          <span className="mt-0.5 block text-xs text-ink-500">{m.lead}</span>
        </p>
      </div>
    );
  }
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-snug text-ink-500", className)}>
      <CalendarClock aria-hidden className="mt-px size-3.5 shrink-0 text-breeze-700" />
      <span className="min-w-0">
        <span className="font-semibold text-ink-700">
          {m.subject} from <span className="whitespace-nowrap">{m.from}</span>
        </span>
        <span> · {m.lead}</span>
      </span>
    </p>
  );
}
