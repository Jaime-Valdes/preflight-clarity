import { Compass } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";

export const metadata: Metadata = {
  title: "Page not found",
};

/** Shown for any URL the app doesn't know. Calm, with one obvious way out. */
export default function NotFound() {
  return (
    <Screen className="justify-center">
      <Card className="animate-fade-up text-center">
        <div
          aria-hidden
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100"
        >
          <Compass className="size-6" />
        </div>

        <h1 className="mt-5 text-2xl font-bold leading-tight text-ink-900">We couldn’t find that page</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
          The link may be incomplete or out of date. The study starts from the home page, and it
          takes about 5 minutes.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-full bg-night-900 px-6 text-base font-semibold text-white shadow-lift transition-colors duration-200 hover:bg-night-800 active:bg-night-950"
        >
          Back to start
        </Link>

        <p className="mt-5 text-xs leading-relaxed text-ink-400">
          If someone sent you this link, check that it was copied in full.
        </p>
      </Card>
    </Screen>
  );
}
