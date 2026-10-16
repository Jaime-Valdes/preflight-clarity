import { Compass, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Version C "not found" (inside the /c layout): shown when a /c page calls
 * notFound(). Calm, with one obvious way out.
 */
export default function CNotFound() {
  return (
    <>
      {/* A nested not-found's `metadata` isn't applied, so the tab would keep the home title: React hoists this one. */}
      <title>Page not found · Pre-Flight Clarity</title>
      <section
        aria-labelledby="c-not-found-title"
        className="mx-auto mt-4 max-w-xl animate-fade-up rounded-3xl bg-surface px-5 py-8 text-center shadow-soft ring-1 ring-line/80 sm:mt-8 sm:px-8"
      >
        <span
          aria-hidden
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100"
        >
          <Compass className="size-6" />
        </span>
        <h1 id="c-not-found-title" className="mt-5 text-2xl font-bold leading-tight text-ink-900">
          We couldn’t find that page
        </h1>
        <p className="mx-auto mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-700">
          The link may be incomplete or out of date. Start a new search to see the nonstop flights for a route and day,
          and compare them side by side.
        </p>

        <Link
          href="/c"
          className="mx-auto mt-6 inline-flex h-14 w-full max-w-sm items-center justify-center gap-2 rounded-full bg-night-900 px-6 text-base font-semibold text-white shadow-lift transition-colors duration-200 hover:bg-night-800 active:bg-night-950"
        >
          <Search aria-hidden className="size-4" />
          Back to flight search
        </Link>

        <p className="mt-5 text-xs leading-relaxed text-ink-400">
          If someone sent you this link, check that it was copied in full.
        </p>
      </section>
    </>
  );
}
