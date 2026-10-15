/** Placeholder rows under the column headers. */
const ROWS = 6;

/**
 * Version C: calm placeholder with the compare page's silhouette — the page's
 * Suspense fallback (static shell) and the state until the client knows
 * today's date and the compare list. No hooks, so it renders on the server.
 */
export function CompareSkeleton() {
  return (
    <div role="status" aria-label="Loading the comparison" className="animate-pulse">
      <div className="h-7 w-48 rounded-full bg-line" />
      <div className="mt-3 h-3 w-64 max-w-full rounded-full bg-line/80" />
      <div className="mt-6 overflow-hidden rounded-3xl bg-surface shadow-soft ring-1 ring-line/80">
        <div className="grid grid-cols-[80px_1fr_1fr] gap-x-3 px-3 py-4 sm:grid-cols-[9.5rem_1fr_1fr] sm:px-4 lg:grid-cols-[12rem_1fr_1fr]">
          <div />
          {[0, 1].map((i) => (
            <div key={i}>
              <div className="size-7 rounded-xl bg-line" />
              <div className="mt-3 h-3 w-24 max-w-full rounded-full bg-line" />
              <div className="mt-2 h-2.5 w-14 rounded-full bg-line/80" />
              <div className="mt-5 h-5 w-16 rounded-full bg-line" />
              <div className="mt-4 size-9 rounded-full border-[3.5px] border-calm-100" />
              <div className="mt-4 h-10 w-full rounded-full bg-canvas" />
            </div>
          ))}
        </div>
        {Array.from({ length: ROWS }, (_, i) => (
          <div
            key={i}
            className="grid grid-cols-[80px_1fr_1fr] gap-x-3 border-t border-line/70 px-3 py-3.5 sm:grid-cols-[9.5rem_1fr_1fr] sm:px-4 lg:grid-cols-[12rem_1fr_1fr]"
          >
            <div className="h-2.5 w-14 rounded-full bg-line/80" />
            <div className="h-3 w-20 max-w-full rounded-full bg-line" />
            <div className="h-3 w-16 max-w-full rounded-full bg-line" />
          </div>
        ))}
      </div>
    </div>
  );
}
