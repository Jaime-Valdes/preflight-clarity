"use client";

import { RotateCcw, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { D_PILL_OUTLINE, D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { cn } from "@/lib/cn";

interface DErrorProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the part of the page that failed. */
  retry: () => void;
}

/**
 * Version D error boundary (inside the /d layout, so the header and the
 * compare tray stay): calm wording, no blame, two ways out. The compare list
 * and the priorities live in this browser, so nothing picked is lost. The same
 * paper card as not-found, with the cloud on its stage: it is never sad, it
 * simply waits (docs/ui-d-cinematic.md, "Compare and the small states").
 */
export default function DError({ error, retry }: DErrorProps) {
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section
      aria-labelledby="d-error-title"
      className="d-compare-rise mx-auto mt-4 max-w-xl rounded-[24px] bg-surface px-5 pb-7 pt-8 text-center shadow-soft sm:mt-8 sm:px-8"
    >
      <CloudMascot data-cloud-stage className="w-24" />
      <h1 id="d-error-title" className="mt-1.5 text-balance text-2xl font-extrabold leading-tight tracking-tight text-ink">
        This page didn’t load
      </h1>
      <p className="mx-auto mt-3 max-w-[44ch] text-[15px] leading-relaxed text-ink-soft">
        Something went wrong on our side while putting these flights together. Nothing you did caused it, and what
        you picked is still saved in this browser.
      </p>

      <div className="mx-auto mt-6 flex max-w-sm flex-col gap-3">
        <button type="button" onClick={() => retry()} className={cn(D_PILL_PRIMARY, "h-14 w-full select-none px-6 text-[17px]")}>
          Try again
          <RotateCcw aria-hidden className="size-5" />
        </button>
        {/* On /d itself a soft navigation to the same route would keep this boundary up: reload instead. */}
        <Link
          href="/d"
          onClick={(event) => {
            if (pathname === "/d") {
              event.preventDefault();
              window.location.reload();
            }
          }}
          className={cn(D_PILL_OUTLINE, "h-14 w-full select-none px-6 text-base")}
        >
          <Search aria-hidden className="size-4" />
          Back to the search
        </Link>
      </div>

      {error.digest ? <p className="mt-5 text-xs text-ink-mute tabular-nums">Reference {error.digest}</p> : null}
    </section>
  );
}
