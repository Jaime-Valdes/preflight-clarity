import { cn } from "@/lib/cn";

interface TextAreaProps {
  id: string;
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  className?: string;
}

/** Labelled free-text box in the flow's field style. */
export function TextArea({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  rows = 3,
  maxLength = 600,
  className,
}: TextAreaProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-[15px] font-semibold leading-snug text-ink-900">
        {label}
      </label>
      {hint ? <p className="mt-1 text-[13px] leading-snug text-ink-500">{hint}</p> : null}
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        maxLength={maxLength}
        className={cn(
          "mt-2.5 w-full resize-none rounded-2xl bg-surface px-4 py-3 text-[15px] leading-relaxed text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong placeholder:text-ink-400 focus:ring-2 focus:ring-breeze-400 focus:outline-none",
        )}
      />
    </div>
  );
}
