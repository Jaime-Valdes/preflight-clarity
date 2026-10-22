import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/*
 * Small presentational pieces shared by the results blocks. No hooks, so the
 * same components work inside the server-rendered page and the client
 * dashboard.
 */

/**
 * Chart colours (values mirror app/globals.css). Pre/post is one hue in two
 * steps (an ordinal pair); better/same/worse are two soft hues around a
 * neutral midpoint (the change bars colour by hypothesis direction). Soft by
 * design — the visible value labels and the responses table carry every
 * number the fills do.
 */
export const SERIES = {
  pre: "#6aa2d4", // breeze-400
  post: "#2d5680", // breeze-700
  same: "#aab6c5", // ink-300
  better: "#3c9e89", // calm-500
  worse: "#c98f3f", // sand-500
  magnitude: "#4a87c0", // breeze-500 — single-series bars
} as const;

const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const DATE_ONLY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "Oct 12, 2:05 PM" in the viewer's time zone (render only after hydration). */
export function formatDateTime(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? DATE_TIME.format(t) : "—";
}

/** "Oct 12" in the viewer's time zone. */
export function formatDateShort(iso: string): string {
  const t = Date.parse(iso);
  return Number.isFinite(t) ? DATE_ONLY.format(t) : "—";
}

interface BlockProps {
  title: string;
  subtitle?: ReactNode;
  /** Right-hand slot in the header: a segmented control or a legend. */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

/** A results card: title, optional subtitle, optional control, then content. */
export function Block({ title, subtitle, aside, children, className, id }: BlockProps) {
  return (
    <Card id={id} className={cn("flex min-w-0 flex-col gap-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-[1_1_12rem]">
          <h2 className="text-base font-bold leading-snug text-ink-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-[13px] leading-snug text-ink-500">{subtitle}</p> : null}
        </div>
        {aside ? <div className="max-w-full shrink-0">{aside}</div> : null}
      </div>
      {children}
    </Card>
  );
}

interface SegmentedProps<T extends string> {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the group. */
  label: string;
}

/** Pill-shaped segmented control (pressed-state buttons, no hooks). */
export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-canvas p-1 ring-1 ring-inset ring-line">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              // The ::before fills the group's padding so the tap target reaches 44 px.
              "relative h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
              selected ? "bg-surface text-ink-900 shadow-soft ring-1 ring-line/80" : "text-ink-500 hover:text-ink-900",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Colour-key legend: a small swatch beside each series name. */
export function Legend({ items, className }: { items: ReadonlyArray<{ color: string; label: string }>; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500", className)}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Headline number tile. Proportional figures on purpose (tabular only in tables). */
export function Kpi({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <Card className="px-4 py-4 sm:px-5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-2 text-[26px] font-bold leading-none text-ink-900">{value}</div>
      {hint ? <div className="mt-2 text-xs leading-snug text-ink-500">{hint}</div> : null}
    </Card>
  );
}

interface HBarProps {
  /** 0–1 share of the track to fill. */
  pct: number | null;
  color: string;
  className?: string;
  /** Tailwind height class, e.g. "h-2". */
  height?: string;
}

/** Thin horizontal bar on a recessive track. */
export function HBar({ pct, color, className, height = "h-2.5" }: HBarProps) {
  const width = pct === null ? 0 : Math.max(0, Math.min(1, pct)) * 100;
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line/60", height, className)}>
      <div className="h-full rounded-full" style={{ width: `${width}%`, background: color }} />
    </div>
  );
}

/** Small number tile inside a block: label, value, one-line hint. */
export function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl bg-canvas/70 px-3.5 py-3 ring-1 ring-inset ring-line/70">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-lg font-bold leading-tight text-ink-900">{value}</div>
      <div className="mt-0.5 text-xs leading-snug text-ink-500">{hint}</div>
    </div>
  );
}

/** Bar + value label row used by the small horizontal bar lists. */
export function BarRow({
  label,
  hint,
  pct,
  scale = 1,
  color,
  value,
}: {
  label: ReactNode;
  hint?: ReactNode;
  pct: number | null;
  /** Share that fills the whole track (lets the longest bar use the width). */
  scale?: number;
  color: string;
  value: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
      <div className="min-w-0 text-sm text-ink-700">
        <span className="block truncate">{label}</span>
        {hint ? <span className="block text-xs text-ink-400">{hint}</span> : null}
      </div>
      <div className="order-last col-span-2 sm:order-none sm:col-span-1">
        <HBar pct={pct === null ? null : pct / Math.max(scale, 1e-9)} color={color} height="h-2" />
      </div>
      <div className="whitespace-nowrap text-right text-sm text-ink-900 tabular-nums">{value}</div>
    </div>
  );
}

export function EmptyNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "rounded-2xl bg-canvas/70 px-4 py-6 text-center text-sm text-ink-500 ring-1 ring-inset ring-line/70",
        className,
      )}
    >
      {children}
    </p>
  );
}

const NOTICE_TONES = {
  breeze: "bg-breeze-50 text-breeze-700 ring-breeze-100",
  sand: "bg-sand-50 text-sand-700 ring-sand-100",
  calm: "bg-calm-50 text-calm-700 ring-calm-100",
} as const;

/** Soft banner for storage / data-source notes. Never alarming. */
export function Notice({
  icon,
  children,
  tone = "breeze",
}: {
  icon?: ReactNode;
  children: ReactNode;
  tone?: keyof typeof NOTICE_TONES;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-start gap-3 rounded-2xl px-4 py-3 text-sm leading-snug ring-1 ring-inset [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        NOTICE_TONES[tone],
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

/**
 * Text colour for an anxiety change (post − pre): teal when it dropped, sand
 * when it rose, neutral when it is null or rounds to 0.0 at one decimal.
 */
export function deltaClass(change: number | null): string {
  if (change === null || Math.abs(change) < 0.05) return "text-ink-500";
  return change < 0 ? "text-calm-700" : "text-sand-700";
}

/** Compact "Label · value" pair for detail panels. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink-900">{children}</dd>
    </div>
  );
}
