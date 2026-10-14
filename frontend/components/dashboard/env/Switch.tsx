"use client";

import { Check } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type SwitchSize = "md" | "sm";

interface SwitchRowProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  /** Small line under the label. */
  description?: ReactNode;
  size?: SwitchSize;
  className?: string;
}

/**
 * Accessible switch: the whole row is one role="switch" button, so the touch
 * target is the full card width and at least 44px tall. The track on the
 * right is purely visual.
 */
export function SwitchRow({ checked, onChange, label, description, size = "md", className }: SwitchRowProps) {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex min-h-11 w-full select-none items-center gap-3 text-left transition-colors",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span
          id={labelId}
          className={cn(
            "block font-semibold leading-snug text-ink-900",
            size === "md" ? "text-[15px]" : "text-sm",
          )}
        >
          {label}
        </span>
        {description ? (
          <span id={descriptionId} className="mt-0.5 block text-xs leading-snug text-ink-500">
            {description}
          </span>
        ) : null}
      </span>
      <SwitchTrack checked={checked} size={size} />
    </button>
  );
}

function SwitchTrack({ checked, size }: { checked: boolean; size: SwitchSize }) {
  const md = size === "md";
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 rounded-full ring-1 ring-inset transition-colors duration-200",
        md ? "h-8 w-[52px]" : "h-7 w-11",
        checked ? "bg-calm-500 ring-calm-600/30" : "bg-line-strong ring-ink-300/40",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 flex items-center justify-center rounded-full bg-white text-calm-600 shadow-[0_1px_3px_rgb(14_26_43/0.25)] transition-transform duration-200",
          md ? "size-7" : "size-6",
          checked && (md ? "translate-x-5" : "translate-x-4"),
        )}
      >
        {checked ? <Check className={md ? "size-3.5" : "size-3"} strokeWidth={3} /> : null}
      </span>
    </span>
  );
}
