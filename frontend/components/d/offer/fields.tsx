"use client";

import { useId, type ReactNode } from "react";
import { D_PILL_OUTLINE, D_PILL_SELECTED } from "@/components/d/brand/buttons";
import { cn } from "@/lib/cn";
import { OPTIONAL } from "./copy";

/*
 * Small form pieces for the Flight Day Pack card and the general feedback (docs/FLIGHT_DAY_PACK.md),
 * in D's look: paper fields with one ring (D's theme makes them 16 px and adds the sky halo on focus),
 * choices as outline pills that take the selected look when on (royal, never a rating colour), and
 * every option the same size and weight, "None of these" included.
 */

/** The same field as the sign-up sheet's (components/c/interest/InterestSheet.tsx). */
export const FIELD =
  "mt-1.5 h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-breeze-500";

export const LABEL = "block text-[13px] font-semibold text-ink-700";

export function Optional() {
  return <span className="font-normal text-ink-500"> {OPTIONAL}</span>;
}

/** A free-text answer, at most 1,000 characters. */
export function TextAnswer({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL}>
        {label}
        <Optional />
      </label>
      <textarea
        id={id}
        rows={3}
        maxLength={1000}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(FIELD, "h-auto min-h-24 resize-y py-3 leading-relaxed")}
      />
    </div>
  );
}

/**
 * A set of equal pills: one choice (radios) or several (checkboxes). Native inputs, visually hidden,
 * so the keyboard and screen readers get the real thing; the pill shows the state.
 */
export function ChoiceGroup<K extends string>({
  legend,
  help,
  options,
  multiple = false,
  value,
  onChange,
  className,
}: {
  legend: ReactNode;
  help?: string;
  options: readonly { key: K; label: string }[];
  multiple?: boolean;
  value: readonly K[];
  onChange: (next: K[]) => void;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={className}>
      <legend className="text-[15px] font-bold leading-snug text-ink">{legend}</legend>
      {help ? <p className="mt-0.5 text-[13px] leading-snug text-ink-mute">{help}</p> : null}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o.key);
          return (
            <label
              key={o.key}
              className={cn(
                on ? D_PILL_SELECTED : D_PILL_OUTLINE,
                "min-h-11 cursor-pointer px-4 py-2 text-[14px] leading-tight has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-ink",
              )}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={name}
                value={o.key}
                checked={on}
                onChange={() => onChange(multiple ? (on ? value.filter((k) => k !== o.key) : [...value, o.key]) : on ? [] : [o.key])}
                // A radio can't be unticked by tapping it again; a second tap on the chosen pill clears it.
                onClick={multiple || !on ? undefined : () => onChange([])}
                className="sr-only"
              />
              {o.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
