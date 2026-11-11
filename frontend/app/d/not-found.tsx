import { Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Version D "not found" (inside the /d layout): shown when a /d page calls
 * notFound(). Calm, with one obvious way out: the same paper card as the other
 * small states, the cloud on its stage, one royal pill
 * (docs/ui-d-cinematic.md, "Compare and the small states").
 */
export default function DNotFound() {
  return (
    <>
      {/* A nested not-found's `metadata` isn't applied, so the tab would keep the home title: React hoists this one. */}
      <title>Page not found · Cloud9</title>
      <section
        aria-labelledby="d-not-found-title"
        className="d-compare-rise mx-auto mt-4 max-w-xl rounded-[24px] bg-surface px-5 pb-7 pt-8 text-center shadow-soft sm:mt-8 sm:px-8"
      >
        <CloudMascot data-cloud-stage className="w-24" />
        <h1 id="d-not-found-title" className="mt-1.5 text-balance text-2xl font-extrabold leading-tight tracking-tight text-ink">
          We couldn’t find that page
        </h1>
        <p className="mx-auto mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-soft">
          The link may be incomplete or out of date. Start a new search to see the nonstop flights for a route and day,
          rated for what matters to you.
        </p>

        <Link href="/d" className={cn(D_PILL_PRIMARY, "mt-6 h-14 w-full max-w-sm px-6 text-[17px]")}>
          <Search aria-hidden className="size-5" />
          Back to the search
        </Link>

        <p className="mt-5 text-xs leading-relaxed text-ink-mute">
          If someone sent you this link, check that it was copied in full.
        </p>
      </section>
    </>
  );
}
