import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** Remove the default padding (e.g. when the card hosts its own header). */
  flush?: boolean;
}

/** White rounded surface with a soft shadow — the base of every dashboard block. */
export function Card({ children, className, flush = false, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-3xl bg-surface shadow-soft ring-1 ring-line/80",
        !flush && "p-5",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
