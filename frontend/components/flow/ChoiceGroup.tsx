"use client";

import { Check } from "lucide-react";
import { useId, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { cn } from "@/lib/cn";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface BaseProps<T extends string> {
  /** The question; rendered as the group's label. */
  label: ReactNode;
  hint?: ReactNode;
  options: readonly ChoiceOption<T>[];
  /** 1 (default) = full-width rows, 2 = two-column grid for short labels. */
  columns?: 1 | 2;
  className?: string;
  /** When set, the question label becomes a programmatic focus target (tabIndex -1). */
  labelRef?: Ref<HTMLParagraphElement>;
}

interface SingleProps<T extends string> extends BaseProps<T> {
  kind: "single";
  value: T | null;
  onChange: (value: T) => void;
}

interface MultiProps<T extends string> extends BaseProps<T> {
  kind: "multi";
  values: readonly T[];
  onChange: (values: T[]) => void;
  /** Picking this option clears the others, and picking any other clears it ("None of these"). */
  exclusive?: T;
}

type ChoiceGroupProps<T extends string> = SingleProps<T> | MultiProps<T>;

/**
 * Tappable option rows. Single = radio group, multi = checkbox group with an
 * optional exclusive "None" option. Every option, including "None", has the
 * same visual weight.
 */
export function ChoiceGroup<T extends string>(props: ChoiceGroupProps<T>) {
  const labelId = useId();
  const hintId = useId();
  const { label, hint, options, columns = 1, className, labelRef } = props;
  const isMulti = props.kind === "multi";
  // Radio group: one Tab stop (the checked option, else the first) and arrow keys move + select.
  const anyChecked = props.kind === "single" && options.some((o) => o.value === props.value);

  function onRadioKeyDown(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    if (props.kind !== "single") return;
    const n = options.length;
    const target =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? (i - 1 + n) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    if (target < 0) return;
    e.preventDefault();
    props.onChange(options[target].value);
    const sibling = e.currentTarget.parentElement?.children[target];
    if (sibling instanceof HTMLElement) sibling.focus();
  }

  function isChecked(value: T): boolean {
    return isMulti ? props.values.includes(value) : props.value === value;
  }

  function toggle(value: T) {
    if (!isMulti) {
      props.onChange(value);
      return;
    }
    const { values, exclusive } = props;
    if (values.includes(value)) {
      props.onChange(values.filter((v) => v !== value));
    } else if (exclusive !== undefined && value === exclusive) {
      props.onChange([value]);
    } else {
      props.onChange([...values.filter((v) => v !== exclusive), value]);
    }
  }

  return (
    <div className={className}>
      <p
        id={labelId}
        ref={labelRef}
        tabIndex={labelRef ? -1 : undefined}
        className="text-[15px] font-semibold leading-snug text-ink-900 outline-none"
      >
        {label}
      </p>
      {hint ? (
        <p id={hintId} className="mt-1 text-[13px] leading-snug text-ink-500">
          {hint}
        </p>
      ) : null}
      <div
        role={isMulti ? "group" : "radiogroup"}
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        className={cn("mt-3 grid gap-2", columns === 2 ? "grid-cols-2" : "grid-cols-1")}
      >
        {options.map((opt, i) => {
          const checked = isChecked(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              role={isMulti ? "checkbox" : "radio"}
              aria-checked={checked}
              tabIndex={isMulti ? undefined : checked || (!anyChecked && i === 0) ? 0 : -1}
              onKeyDown={isMulti ? undefined : (e) => onRadioKeyDown(e, i)}
              onClick={() => toggle(opt.value)}
              className={cn(
                "flex min-h-12 items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[15px] leading-snug transition-colors duration-150",
                checked
                  ? "bg-night-900 text-white shadow-soft"
                  : "bg-surface text-ink-900 ring-1 ring-inset ring-line-strong hover:bg-canvas active:bg-line/60",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center ring-1 ring-inset",
                  isMulti ? "rounded-md" : "rounded-full",
                  checked ? "bg-white text-night-900 ring-white" : "bg-surface ring-ink-300",
                )}
              >
                {checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{opt.label}</span>
                {opt.hint ? (
                  <span className={cn("mt-0.5 block text-xs", checked ? "text-white/70" : "text-ink-500")}>
                    {opt.hint}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
