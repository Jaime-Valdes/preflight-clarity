"use client";

import { useId, useRef, useState } from "react";
import type { EasierAnswer } from "@preflight/shared/types";
import { D_LINK, D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { cn } from "@/lib/cn";
import { noteFeedbackSent, savePackRow, trackPack, usePackSession } from "@/lib/d/flightDayPack";
import { useArm } from "@/lib/d/priceArm";
import * as copy from "./copy";
import { ChoiceGroup, TextAnswer } from "./fields";

/*
 * "Tell us what you think" (docs/FLIGHT_DAY_PACK.md): a quiet text link under the main content of
 * the flight and compare pages. It opens inline (no modal, no route change) to one question with an
 * equal-weight "None of these" and one optional open question. Opening it sends d_feedback_open;
 * sending it saves a `general` d_feedback row and sends d_feedback_submitted with no answers in it.
 * The link is hidden for the rest of the session once the visitor has answered an open question in
 * the Flight Day Pack's steps, or has sent this. Client only, like the offer: nothing on the server.
 * The cloud gives it no reaction (`[data-d-feedback]` in components/d/cloud/reactions.ts).
 */

export function DFeedbackLink({ placement, className }: { placement: "flight" | "compare"; className?: string }) {
  const session = usePackSession();
  const arm = useArm();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [easier, setEasier] = useState<EasierAnswer | null>(null);
  const [moreUseful, setMoreUseful] = useState("");
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);

  // Answered here on this page: it stays (with its thank-you) until the visitor moves on.
  if (!session || !arm) return null;
  if (!sent && (session.openAnswered || session.feedbackSent)) return null;

  const answered = easier !== null || moreUseful.trim() !== "";

  const openPanel = () => {
    setOpen(true);
    trackPack("d_feedback_open", placement);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>("[data-step-title]")?.focus({ preventScroll: true }));
  };

  const send = () => {
    if (!answered) return;
    savePackRow({ kind: "general", placement, answers: { easier, moreUseful: moreUseful.trim() } });
    trackPack("d_feedback_submitted", placement);
    noteFeedbackSent();
    setSent(true);
  };

  if (!open) {
    return (
      <div data-d-feedback className={className}>
        <button type="button" onClick={openPanel} className={cn(D_LINK, "inline-flex min-h-11 items-center rounded-full px-2 text-[15px]")}>
          {copy.FEEDBACK_LINK}
        </button>
      </div>
    );
  }

  return (
    <section ref={panelRef} data-d-feedback aria-labelledby={titleId} className={cn("rounded-[24px] bg-surface p-5 shadow-soft sm:p-6", className)}>
      {sent ? (
        <p id={titleId} data-step-title tabIndex={-1} role="status" className="text-[17px] font-bold leading-snug text-ink outline-none">
          {copy.FEEDBACK_THANKS}
        </p>
      ) : (
        <>
          <h2 id={titleId} data-step-title tabIndex={-1} className="sr-only">
            {copy.FEEDBACK_LINK}
          </h2>
          <ChoiceGroup
            legend={copy.FEEDBACK_QUESTION}
            options={copy.EASIER_OPTIONS}
            value={easier ? [easier] : []}
            onChange={(next) => setEasier(next[0] ?? null)}
          />
          <TextAnswer label={copy.MORE_USEFUL_LABEL} value={moreUseful} onChange={setMoreUseful} className="mt-4" />
          <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4">
            <button
              type="button"
              onClick={send}
              aria-disabled={!answered}
              className={cn(D_PILL_PRIMARY, "h-12 w-full px-6 text-[16px] sm:w-auto")}
            >
              {copy.SEND}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className={cn(D_LINK, "inline-flex min-h-11 items-center justify-center rounded-full px-2 text-[15px] font-semibold text-ink-soft sm:justify-start")}
            >
              {copy.FEEDBACK_CLOSE}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
