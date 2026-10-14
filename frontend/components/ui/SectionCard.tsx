"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { TONE_CLASSES, type Tone } from "@/lib/theme";

interface SectionCardProps {
  title: string;
  /** Lucide icon element, e.g. <Gauge />. Sized by the card. */
  icon: ReactNode;
  /** Tint of the icon badge. */
  tone?: Tone;
  /** One line under the title, visible while collapsed (a key fact, calm wording). */
  teaser?: ReactNode;
  open: boolean;
  onToggle: (next: boolean) => void;
  /** Section body. Mounted on first open, then kept mounted so closing animates. */
  children: ReactNode;
  className?: string;
}

/**
 * Collapsible dashboard section. The parent owns `open` so it can report
 * expand/collapse to the tracker.
 */
export function SectionCard({
  title,
  icon,
  tone = "calm",
  teaser,
  open,
  onToggle,
  children,
  className,
}: SectionCardProps) {
  const bodyId = useId();
  const [hasOpened, setHasOpened] = useState(open);
  if (open && !hasOpened) setHasOpened(true);
  const t = TONE_CLASSES[tone];

  return (
    <section
      className={cn(
        "rounded-3xl bg-surface shadow-soft ring-1 ring-line/80 transition-shadow duration-300",
        open && "shadow-lift",
        className,
      )}
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(!open)}
          className="flex w-full items-center gap-3.5 rounded-3xl px-4 py-4 text-left"
        >
          <span
            aria-hidden
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset [&_svg]:size-5",
              t.bg,
              t.text,
              t.ring,
            )}
          >
            {icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold leading-snug text-ink-900">{title}</span>
            {teaser ? (
              <span className="mt-0.5 block text-[13px] leading-snug text-ink-500">{teaser}</span>
            ) : null}
          </span>
          <ChevronDown
            aria-hidden
            className={cn(
              "size-5 shrink-0 text-ink-400 transition-transform duration-300",
              open && "rotate-180",
            )}
          />
        </button>
      </h2>
      <div
        id={bodyId}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        {/* The landmark sits on the inert element so collapsed sections add no empty region to the tree. */}
        <div role="region" aria-label={title} className="min-h-0 overflow-hidden" inert={!open}>
          {hasOpened ? <div className="px-4 pb-5 pt-1">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
