import { Compass } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

interface NoticeProps {
  title: string;
  children: ReactNode;
  /** Links or buttons, stacked on phones, side by side from sm. */
  actions: ReactNode;
  icon?: ReactNode;
  className?: string;
}

/**
 * Version C: a calm full-page message (a link that is incomplete, a flight
 * that isn't on the schedule, a date outside the range) with one obvious way on.
 * Carries the page's only <h1>.
 */
export function Notice({ title, children, actions, icon, className }: NoticeProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[600px] pb-6 pt-2 sm:pt-8", className)}>
      <Card className="animate-fade-up text-center sm:p-8">
        <div
          aria-hidden
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100 [&_svg]:size-6"
        >
          {icon ?? <Compass />}
        </div>
        <h1 className="mt-5 text-2xl font-bold leading-tight text-ink-900 text-balance">{title}</h1>
        <div className="mt-3 text-[15px] leading-relaxed text-ink-700 text-pretty">{children}</div>
        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">{actions}</div>
      </Card>
    </div>
  );
}
