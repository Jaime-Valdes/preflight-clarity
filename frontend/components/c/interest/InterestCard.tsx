"use client";

import { MailCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { INTEREST_BODY, INTEREST_BUTTON, INTEREST_DONE_BODY, INTEREST_DONE_TITLE, INTEREST_TITLE, InterestSheet } from "./InterestSheet";
import { registerContext, useSignedUp, type CPlacement } from "./signupState";

/*
 * Version C's sign-up card (docs/INTEREST.md), at the bottom of every /c page
 * after the page's own content: the contract's title and body with one
 * "Notify me when it's live" button that opens the sign-up sheet. Once this
 * browser has signed up it shows "You're on the list." instead. Logs
 * interest_cta_view once per mount when it scrolls into view.
 */

interface InterestCardProps {
  placement: CPlacement;
  /** What the visitor is looking at, e.g. "JFK → LAX · Nov 26 · 14 flights"; "" on the home. */
  context: string;
  className?: string;
}

export function InterestCard({ placement, context, className }: InterestCardProps) {
  const signedUp = useSignedUp();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);

  // Back/forward (another page under the sheet) closes it.
  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);

  // The footer's "Get early access" link sends the same context line as this card.
  useEffect(() => registerContext(context), [context]);

  // Seen once per page view: the first time any part of the card is on screen. Only while the
  // form is offered (like the study's card) — an "on the list" card is not a call to action.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || signedUp) return;
    const seen = () => track("interest_cta_view", { source: "c", placement });
    if (typeof IntersectionObserver === "undefined") {
      seen();
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      seen();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [placement, signedUp]);

  return (
    <section
      ref={rootRef}
      aria-labelledby={`c-interest-${placement}`}
      tabIndex={-1}
      className={cn(
        "rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80 outline-none sm:p-6",
        "sm:flex sm:items-center sm:gap-6",
        className,
      )}
    >
      {signedUp ? (
        <div className="flex items-start gap-3 sm:items-center">
          <span
            aria-hidden
            className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-100 sm:mt-0"
          >
            <MailCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <h2 id={`c-interest-${placement}`} className="text-[17px] font-bold leading-snug text-ink-900">
              {INTEREST_DONE_TITLE}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">{INTEREST_DONE_BODY}</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 items-start gap-3 sm:gap-4">
            <span
              aria-hidden
              className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-2xl bg-dusk-50 text-dusk-700 ring-1 ring-inset ring-dusk-100"
            >
              <Sparkles className="size-5" />
            </span>
            <div className="min-w-0">
              <h2 id={`c-interest-${placement}`} className="text-[17px] font-bold leading-snug text-ink-900 text-balance">
                {INTEREST_TITLE}
              </h2>
              <p className="mt-1.5 max-w-[56ch] text-sm leading-relaxed text-ink-700">{INTEREST_BODY}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            className="mt-4 inline-flex h-12 w-full shrink-0 items-center justify-center rounded-full bg-night-900 px-5 text-[15px] font-semibold text-white shadow-lift transition-colors hover:bg-night-800 active:bg-night-950 sm:mt-0 sm:h-11 sm:w-auto sm:text-sm"
          >
            {INTEREST_BUTTON}
          </button>
        </>
      )}

      {open ? (
        <InterestSheet
          placement={placement}
          context={context}
          onClose={() => setOpen(false)}
          fallbackFocus={() => rootRef.current}
        />
      ) : null}
    </section>
  );
}
