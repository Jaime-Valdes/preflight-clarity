import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "soft";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  /** Stretch to the container width (default for primary CTAs on mobile). */
  block?: boolean;
  /** Trailing icon, e.g. <ArrowRight className="size-4" />. */
  icon?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-night-900 text-white shadow-lift hover:bg-night-800 active:bg-night-950 disabled:bg-ink-300 disabled:shadow-none",
  secondary:
    "bg-surface text-ink-900 ring-1 ring-inset ring-line-strong hover:bg-canvas active:bg-line/60 disabled:text-ink-300",
  soft: "bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-100 hover:bg-calm-100 disabled:opacity-50",
  ghost: "bg-transparent text-ink-500 hover:bg-line/50 hover:text-ink-900 disabled:opacity-40",
};

const SIZES: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-6 text-base",
};

export function Button({
  children,
  variant = "primary",
  size = "lg",
  block = false,
  icon,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-200 disabled:cursor-not-allowed",
        VARIANTS[variant],
        SIZES[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {children}
      {icon}
    </button>
  );
}
