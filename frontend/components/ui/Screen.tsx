import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

interface ScreenProps {
  children: ReactNode;
  className?: string;
  /** Content pinned to the bottom (CTA buttons). Respects the iPhone home indicator. */
  footer?: ReactNode;
}

/**
 * Mobile-first page column (max ~440px, centred on larger screens) with an
 * optional sticky footer for the main call to action.
 */
export function Screen({ children, className, footer }: ScreenProps) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col">
      <main
        className={cn(
          "flex flex-1 flex-col px-5 pt-[max(1.5rem,env(safe-area-inset-top))]",
          footer ? "pb-6" : "pb-[max(1.5rem,env(safe-area-inset-bottom))]",
          className,
        )}
      >
        {children}
      </main>
      {footer ? (
        <div className="sticky bottom-0 z-20 border-t border-line/70 bg-canvas/90 px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
