/** Layout-shaped placeholder shown while the records load (and before hydration). */
export function ResultsSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-6xl animate-pulse px-4 pb-16 pt-6 sm:px-6 sm:pt-10 lg:px-8"
      aria-busy="true"
      aria-label="Loading results"
    >
      <div className="h-3 w-44 rounded-full bg-line/80" />
      <div className="mt-3 h-8 w-40 rounded-full bg-line/80" />
      <div className="mt-3 h-3 w-64 rounded-full bg-line/60" />
      <div className="mt-6 flex flex-wrap gap-2">
        <div className="h-10 w-36 rounded-full bg-line/60" />
        <div className="h-10 w-44 rounded-full bg-line/60" />
        <div className="h-10 w-48 rounded-full bg-line/60" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-24 rounded-3xl bg-surface ring-1 ring-line/80" />
        ))}
      </div>
      <div className="mt-4 h-80 rounded-3xl bg-surface ring-1 ring-line/80" />
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-3xl bg-surface ring-1 ring-line/80" />
        <div className="h-72 rounded-3xl bg-surface ring-1 ring-line/80" />
      </div>
      <div className="mt-4 h-96 rounded-3xl bg-surface ring-1 ring-line/80" />
    </div>
  );
}
