/** Placeholder rows, one per section on the flight page. */
const SECTION_ROWS = 7;

/**
 * Version C: calm placeholder with the flight page's silhouette — shown as the
 * page's Suspense fallback (static shell) and until the client knows today's
 * date. No hooks, so it renders on the server.
 */
export function FlightSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[640px] lg:max-w-none">
      <div role="status" aria-label="Loading flight details" className="animate-pulse">
        <div className="flex h-11 items-center">
          <div className="h-3 w-56 rounded-full bg-line" />
        </div>
        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-8">
          <div className="h-[318px] rounded-3xl bg-night-900/90 lg:col-start-1 lg:row-start-1" />
          <div className="flex flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1">
            <div className="rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80">
              <div className="flex items-center gap-4">
                <div className="size-[104px] shrink-0 rounded-full border-[9px] border-calm-100" />
                <div className="flex-1">
                  <div className="h-2.5 w-24 rounded-full bg-line" />
                  <div className="mt-3 h-4 w-32 rounded-full bg-line" />
                  <div className="mt-3 h-2.5 w-28 rounded-full bg-line/80" />
                </div>
              </div>
              <div className="mt-5 h-3 w-full rounded-full bg-line/80" />
              <div className="mt-2 h-3 w-2/3 rounded-full bg-line/80" />
            </div>
            <div className="rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80">
              <div className="h-2.5 w-16 rounded-full bg-line" />
              <div className="mt-3 h-7 w-24 rounded-full bg-line" />
              <div className="mt-5 h-11 w-full rounded-full bg-ink-300/40" />
            </div>
          </div>
          <div className="flex flex-col gap-3 lg:col-start-1">
            {Array.from({ length: SECTION_ROWS }, (_, i) => (
              <div key={i} className="flex items-center gap-3.5 rounded-3xl bg-surface px-4 py-4 shadow-soft ring-1 ring-line/80">
                <div className="size-11 shrink-0 rounded-2xl bg-canvas" />
                <div className="flex-1">
                  <div className="h-3 w-36 rounded-full bg-line" />
                  <div className="mt-2 h-2.5 w-48 max-w-full rounded-full bg-line/80" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
