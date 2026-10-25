import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ScreenProps {
  children: ReactNode;
  className?: string;
  /** Content pinned to the bottom (CTA buttons). Respects the iPhone home indicator. */
  footer?: ReactNode;
  /**
   * Laptop layout: from 1024 px the column widens to ~1000 px (the dashboard lays itself out in two
   * columns inside it, starting a little higher) and the footer's content stays centred at the phone
   * width. Default: the phone column everywhere.
   */
  wide?: boolean;
}

/**
 * Mobile-first page column (max ~440px, centred on larger screens) with an
 * optional sticky footer for the main call to action.
 */
export function Screen({ children, className, footer, wide = false }: ScreenProps) {
  return (
    <div className={cn("mx-auto flex min-h-dvh w-full max-w-[440px] flex-col", wide && "lg:max-w-[1000px]")}>
      <main
        className={cn(
          "flex flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))]",
          footer ? "pb-6" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          wide && "lg:pt-4",
          className,
        )}
      >
        {children}
      </main>
      {footer ? (
        <div className="sticky bottom-0 z-20 border-t border-line/70 bg-canvas/90 px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          {wide ? <div className="mx-auto lg:max-w-[400px]">{footer}</div> : footer}
        </div>
      ) : null}
    </div>
  );
}
