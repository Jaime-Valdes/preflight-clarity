"use client";

import { Plane, RotateCcw } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";

interface ErrorScreenProps {
  error: Error & { digest?: string };
  /** Re-fetches and re-renders the part of the page that failed. */
  retry: () => void;
}

/**
 * Route error boundary for everything inside the root layout: the study flow,
 * the preview and the results page. Calm wording, no blame, two ways out.
 * The study flow keeps its progress in this tab, so "Try again" normally
 * resumes where the participant was.
 */
export default function ErrorScreen({ error, retry }: ErrorScreenProps) {
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Screen className="justify-center">
      <Card className="animate-fade-up text-center">
        <div
          aria-hidden
          className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-100"
        >
          <Plane className="size-6" />
        </div>

        <h1 className="mt-5 text-2xl font-bold leading-tight text-ink-900">Something didn’t load</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
          This page hit a small snag on our side. Nothing you did caused it.
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
          If you were in the middle of the study, your answers so far are saved in this browser tab.
          Tap <span className="font-semibold text-ink-900">Try again</span> to pick up where you left off.
        </p>

        <div className="mt-6 flex flex-col gap-3">
          <Button block onClick={() => retry()} icon={<RotateCcw aria-hidden className="size-4" />}>
            Try again
          </Button>
          {/* Styled like <Button variant="secondary">. When the error happened on "/" itself, a
              soft navigation to the same route would leave this boundary in place, so reload
              instead: the study resumes from the progress kept in this tab. */}
          <Link
            href="/"
            onClick={(event) => {
              if (pathname === "/") {
                event.preventDefault();
                window.location.reload();
              }
            }}
            className="inline-flex h-14 w-full select-none items-center justify-center gap-2 rounded-full bg-surface px-6 text-base font-semibold text-ink-900 ring-1 ring-inset ring-line-strong transition-colors duration-200 hover:bg-canvas active:bg-line/60"
          >
            Back to start
          </Link>
        </div>

        {error.digest ? (
          <p className="mt-5 text-xs text-ink-400 tabular-nums">Reference {error.digest}</p>
        ) : null}
      </Card>
    </Screen>
  );
}
