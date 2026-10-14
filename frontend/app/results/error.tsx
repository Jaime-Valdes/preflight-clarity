"use client";

import { CloudOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

/** Error boundary for /results. Calm wording; the digest helps match server logs. */
export default function ResultsError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
}) {
  const tryAgain = retry ?? reset;
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10">
      <Card className="w-full text-center">
        <span
          aria-hidden
          className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100"
        >
          <CloudOff className="size-5" />
        </span>
        <h1 className="mt-4 text-lg font-bold text-ink-900">Something went wrong while loading the results</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-700">
          Nothing was lost — the sessions are still stored. Try again in a moment.
        </p>
        {error.digest ? <p className="mt-2 font-mono text-xs text-ink-400">ref {error.digest}</p> : null}
        {tryAgain ? (
          <Button className="mt-5" size="md" onClick={() => tryAgain()}>
            Try again
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
