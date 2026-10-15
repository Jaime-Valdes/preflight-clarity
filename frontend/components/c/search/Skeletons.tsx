import { cn } from "@/lib/cn";

/*
 * Placeholders for /c/search while the query string and today's date are not
 * known yet (prerender, hydration). Same boxes as the real page, so nothing
 * jumps when it arrives.
 */

function Bar({ className }: { className?: string }) {
  return <div className={cn("rounded-full bg-line/70", className)} />;
}

export function ResultCardSkeleton() {
  return (
    <div className="rounded-3xl bg-surface p-4 shadow-soft ring-1 ring-line/80 sm:p-5">
      <div className="flex flex-col gap-4 md:flex-row md:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="size-10 shrink-0 rounded-xl bg-line/70" />
            <div className="flex-1">
              <Bar className="h-4 w-36" />
              <Bar className="mt-2 h-3 w-16" />
            </div>
            <Bar className="h-5 w-14 md:hidden" />
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Bar className="h-5 w-20" />
            <Bar className="h-px flex-1" />
            <Bar className="h-5 w-20" />
          </div>
          <Bar className="mt-5 h-3.5 w-44" />
          <Bar className="mt-2.5 h-3 w-60 max-w-full" />
        </div>
        <div className="h-[7.5rem] rounded-2xl bg-canvas/70 ring-1 ring-inset ring-line/70 md:h-auto md:w-48 md:self-stretch xl:w-56" />
        <div className="flex items-center justify-between gap-2 border-t border-line/70 pt-3 md:w-32 md:flex-col md:items-stretch md:justify-center md:border-l md:border-t-0 md:pl-5 md:pt-0 xl:w-36">
          <Bar className="h-11 w-28 md:w-auto" />
          <Bar className="h-11 w-24 md:w-auto" />
        </div>
      </div>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5" aria-busy="true">
      <p className="sr-only" role="status">
        Loading flights…
      </p>
      <div aria-hidden className="rounded-3xl bg-surface p-4 shadow-soft ring-1 ring-line/80 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div>
            <Bar className="h-6 w-64 max-w-full" />
            <Bar className="mt-2.5 h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Bar className="h-11 w-24" />
            <Bar className="h-11 w-28" />
          </div>
        </div>
      </div>
      <div aria-hidden>
        <div className="-mx-4 flex gap-2 overflow-hidden px-4 py-1 sm:-mx-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-7 lg:px-0">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-[6.25rem] min-w-[5.5rem] flex-1 rounded-2xl bg-surface ring-1 ring-inset ring-line/80 lg:min-w-0" />
          ))}
        </div>
        <Bar className="mt-2.5 h-3 w-60" />
      </div>
      <div aria-hidden className="lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-6">
        <div className="hidden h-[34rem] rounded-3xl bg-surface shadow-soft ring-1 ring-line/80 lg:block" />
        <div>
          <div className="flex gap-1.5 overflow-hidden py-1">
            {[108, 96, 84, 140].map((w) => (
              <div key={w} className="h-11 shrink-0 rounded-full bg-surface ring-1 ring-inset ring-line/80" style={{ width: w }} />
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <Bar className="h-4 w-64 max-w-[70%]" />
            <Bar className="h-11 w-28 lg:hidden" />
          </div>
          <div className="mt-3 flex flex-col gap-3">
            <ResultCardSkeleton />
            <ResultCardSkeleton />
            <ResultCardSkeleton />
          </div>
        </div>
      </div>
    </div>
  );
}
