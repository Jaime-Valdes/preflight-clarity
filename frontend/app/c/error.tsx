"use client";

import { Plane, RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

interface CErrorProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the part of the page that failed. */
  retry: () => void;
}

/**
 * Version C error boundary (inside the /c layout, so the header and the
 * compare tray stay): calm wording, no blame, two ways out. The compare list
 * lives in this browser, so nothing picked is lost.
 */
export default function CError({ error, retry }: CErrorProps) {
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section
      aria-labelledby="c-error-title"
      className="mx-auto mt-4 max-w-xl animate-fade-up rounded-3xl bg-surface px-5 py-8 text-center shadow-soft ring-1 ring-line/80 sm:mt-8 sm:px-8"
    >
      <span
        aria-hidden
        className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-100"
      >
        <Plane className="size-6" />
      </span>
      <h1 id="c-error-title" className="mt-5 text-2xl font-bold leading-tight text-ink-900">
        This page didn’t load
      </h1>
      <p className="mx-auto mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-700">
        Something went wrong on our side while putting these flights together. Nothing you did caused it, and the
        flights you picked to compare are still saved in this browser.
      </p>

      <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-14 w-full select-none items-center justify-center gap-2 rounded-full bg-night-900 px-6 text-base font-semibold text-white shadow-lift transition-colors duration-200 hover:bg-night-800 active:bg-night-950"
        >
          Try again
          <RotateCcw aria-hidden className="size-4" />
        </button>
        {/* On /c itself a soft navigation to the same route would keep this boundary up: reload instead. */}
        <Link
          href="/c"
          onClick={(event) => {
            if (pathname === "/c") {
              event.preventDefault();
              window.location.reload();
            }
          }}
          className="inline-flex h-14 w-full select-none items-center justify-center gap-2 rounded-full bg-surface px-6 text-base font-semibold text-ink-900 ring-1 ring-inset ring-line-strong transition-colors duration-200 hover:bg-canvas active:bg-line/60"
        >
          <Search aria-hidden className="size-4 text-ink-500" />
          Back to flight search
        </Link>
      </div>

      {error.digest ? <p className="mt-5 text-xs text-ink-400 tabular-nums">Reference {error.digest}</p> : null}
    </section>
  );
}
