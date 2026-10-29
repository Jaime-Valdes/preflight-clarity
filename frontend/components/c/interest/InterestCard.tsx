"use client";

import { MailCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { SignupPlacement, SignupSource } from "@preflight/shared/types";
import { track } from "@/lib/analytics";
import { useTool } from "@/components/c/shell/ToolContext";
import { cn } from "@/lib/cn";
import {
  INTEREST_BODY,
  INTEREST_BUTTON,
  INTEREST_DONE_BODY,
  INTEREST_DONE_PRIVACY,
  INTEREST_DONE_TITLE,
  INTEREST_TITLE,
  InterestSheet,
  type InterestSubmission,
} from "./InterestSheet";
import { registerContext, useSignedUp } from "./signupState";

/*
 * The sign-up card (docs/INTEREST.md): the contract's title and body with one
 * "Notify me when it's live" button that opens the sign-up sheet; once signed
 * up it shows "You're on the list." instead. Logs interest_cta_view once per
 * mount when it scrolls into view (only while the form is offered).
 *
 * Version C (default): at the bottom of every /c page; "signed up" is this
 * browser's flag (localStorage), the sheet saves the sign-up itself and the
 * card registers its context line for the footer's link. The study's dashboard
 * passes `study`: "signed up" comes from the session (and the submit made
 * here), and the host saves the sign-up — the copy is the same.
 */

/** The study's card: the host owns the sign-up (frontend/components/flow/StudyFlow.tsx). */
export interface StudySignup {
  /** Already signed up in this session (e.g. after a reload). */
  signedUp: boolean;
  onSubmit: (submission: InterestSubmission) => void;
  /**
   * The sign-up sheet closed (Done, the backdrop, Escape or back). The sheet's buttons sit where
   * the dashboard's "I'm done exploring" is, so the host can ignore the tail of a double tap.
   */
  onSheetClose?: () => void;
}

interface InterestCardProps {
  placement: SignupPlacement;
  /** What the visitor is looking at, e.g. "JFK → LAX · Nov 26 · 14 flights"; "" on the home. */
  context: string;
  study?: StudySignup;
  /** Keep the phone layout (text above a full-width button) at every width — for a narrow column. Default: a row from `sm`. */
  stack?: boolean;
  className?: string;
}

export function InterestCard({ placement, context, study, stack = false, className }: InterestCardProps) {
  const browserSignedUp = useSignedUp();
  /** The study: a submit from this card shows the done state at once, before the session state catches up. */
  const [submitted, setSubmitted] = useState(false);
  const signedUp = study ? study.signedUp || submitted : browserSignedUp;
  const tool = useTool();
  const source: SignupSource = study ? "study" : tool.source;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  /** interest_cta_view fires once per mount. */
  const seenRef = useRef(false);
  const onSheetClose = study?.onSheetClose;

  /** Every way the sheet closes goes through here, so the study's host hears about each one. */
  const closeSheet = () => {
    setOpen(false);
    onSheetClose?.();
  };

  // Back/forward (another page under the sheet) closes it.
  useEffect(() => {
    const close = () => {
      setOpen(false);
      onSheetClose?.();
    };
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, [onSheetClose]);

  // Version C: the footer's "Get early access" link sends the same context line as this card.
  const registers = !study;
  useEffect(() => (registers ? registerContext(context) : undefined), [registers, context]);

  // Seen once per page view: the first time the card is on screen. Only while the form is offered
  // (like the study's debrief card) — an "on the list" card is not a call to action. The study
  // counts a view the way its debrief card does (40 % of the card showing), so the two placements
  // compare; version C keeps counting from the first pixel.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || signedUp || seenRef.current) return;
    const seen = () => {
      if (seenRef.current) return;
      seenRef.current = true;
      track("interest_cta_view", { source, placement });
    };
    if (typeof IntersectionObserver === "undefined") {
      seen();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        seen();
      },
      source === "study" ? { threshold: 0.4 } : undefined,
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [placement, signedUp, source]);

  return (
    <section
      ref={rootRef}
      aria-labelledby={`c-interest-${placement}`}
      tabIndex={-1}
      className={cn(
        "rounded-3xl bg-surface p-5 shadow-soft ring-1 ring-line/80 outline-none",
        !stack && "sm:flex sm:items-center sm:gap-6 sm:p-6",
        className,
      )}
    >
      {signedUp ? (
        <div className={cn("flex items-start gap-3", !stack && "sm:items-center")}>
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
            {study ? <p className="mt-1 text-[13px] leading-snug text-ink-500">{INTEREST_DONE_PRIVACY}</p> : null}
          </div>
        </div>
      ) : (
        <>
          <div className={cn("flex min-w-0 flex-1 items-start gap-3", !stack && "sm:gap-4")}>
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
            className={cn(
              "mt-4 inline-flex h-12 w-full shrink-0 items-center justify-center rounded-full bg-night-900 px-5 text-[15px] font-semibold text-white shadow-lift transition-colors hover:bg-night-800 active:bg-night-950",
              !stack && "sm:mt-0 sm:h-11 sm:w-auto sm:text-sm",
            )}
          >
            {INTEREST_BUTTON}
          </button>
        </>
      )}

      {open ? (
        <InterestSheet
          placement={placement}
          context={context}
          onClose={closeSheet}
          fallbackFocus={() => rootRef.current}
          onSubmit={
            study
              ? (submission) => {
                  setSubmitted(true);
                  study.onSubmit(submission);
                }
              : undefined
          }
        />
      ) : null}
    </section>
  );
}
