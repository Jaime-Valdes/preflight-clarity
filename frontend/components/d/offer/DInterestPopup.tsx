"use client";

import { MailCheck, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { Signup } from "@preflight/shared/types";
import {
  INTEREST_BODY,
  INTEREST_BUTTON,
  INTEREST_DONE_BODY,
  INTEREST_DONE_TITLE,
  INTEREST_INTERVIEW,
  INTEREST_TITLE,
} from "@/components/c/interest/InterestSheet";
import { INTEREST_KEY, markSignedUp } from "@/components/c/interest/signupState";
import { D_LINK, D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { transitionRunning } from "@/components/d/motion/motion";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { isTestRun, newUuid, offerSurfaceOpen } from "@/lib/d/flightDayPack";
import { hasSearched } from "@/lib/d/landing";
import { saveSignup } from "@/lib/storage";
import { NO_THANKS } from "./copy";
import { DModal } from "./DModal";
import { FIELD, LABEL, Optional } from "./fields";
import { PrivacyNote } from "./PrivacyNote";

/*
 * The waitlist as a dialog (docs/INTEREST.md, placement `d_popup`; iteration 2 of docs/FLIGHT_DAY_PACK.md, the
 * owner's request of 2026-11-19): D's "Want this for your real flights?" card, with the same copy and form,
 * centred over a dimmed page after 30 s of this tab's visible time on D's pages (counted across page moves),
 * counted only from the browser's first search (landing v3, 2026-11-27: never over the landing before one).
 * The visitor signs up or says "No thanks" (Escape counts as "No thanks"); no ✕, the backdrop does nothing.
 *
 * Once per browser (localStorage, marked when it opens), and never for a browser that has already signed up.
 * It never stacks: it waits while a Flight Day Pack pop-in or dialog is open or mid-flow, while a page
 * transition runs and while a form field has the focus. Sends interest_cta_view and interest_signup with
 * placement d_popup, and interest_dismiss on "No thanks". The inline cards are unchanged.
 */

/** Visible time on D's pages in this tab (sessionStorage, ms). */
const VISIBLE_KEY = "pfc.d.visible.v1";
/** The dialog has been shown in this browser (localStorage). */
export const POPUP_KEY = "pfc.d.popup.v1";
/** It opens after this much visible time. */
export const POPUP_AFTER_MS = 30_000;
const TICK_MS = 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_HINT = "That email doesn’t look complete yet.";
const MAX_FIRST_NAME = 60;

function read(store: Storage, key: string): string | null {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

function write(store: Storage, key: string, value: string): void {
  try {
    store.setItem(key, value);
  } catch {
    // Storage blocked: this page only.
  }
}

/** A field has the focus: never interrupt typing. */
function typing(): boolean {
  const el = document.activeElement;
  return el instanceof HTMLElement && (el.matches("input, textarea, select") || el.isContentEditable);
}

/** From D's layout: counts the visible time and opens the dialog when it is due. */
export function DInterestPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (read(localStorage, POPUP_KEY) || read(localStorage, INTEREST_KEY)) return;
    let last = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const step = Math.min(now - last, TICK_MS * 1.5);
      last = now;
      if (document.visibilityState !== "visible") return;
      // Landing v3: nothing before the visitor's first search, so the landing page is never covered.
      // The 30 s count only starts once they have opened results (lib/d/landing.ts).
      if (!hasSearched()) return;
      const total = Number(read(sessionStorage, VISIBLE_KEY)) + step;
      write(sessionStorage, VISIBLE_KEY, String(Math.round(total)));
      if (total < POPUP_AFTER_MS) return;
      if (read(localStorage, POPUP_KEY) || read(localStorage, INTEREST_KEY)) {
        window.clearInterval(timer);
        return;
      }
      if (offerSurfaceOpen() || transitionRunning() || typing()) return;
      window.clearInterval(timer);
      write(localStorage, POPUP_KEY, new Date().toISOString());
      setOpen(true);
    }, TICK_MS);
    const onVisible = () => {
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!open) return null;
  return <PopupDialog onClose={() => setOpen(false)} />;
}

function PopupDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId();
  const emailId = useId();
  const hintId = useId();
  const nameId = useId();
  const interviewId = useId();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [interview, setInterview] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState(false);
  const sent = useRef(false);
  const valid = EMAIL_RE.test(email.trim());

  useEffect(() => {
    track("interest_cta_view", { source: "d", placement: "d_popup" });
  }, []);

  const noThanks = () => {
    track("interest_dismiss", { placement: "d_popup" });
    onClose();
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setAttempted(true);
      document.getElementById(emailId)?.focus();
      return;
    }
    if (sent.current) return;
    sent.current = true;
    const createdAt = new Date().toISOString();
    const signup: Signup = {
      schemaVersion: 1,
      id: newUuid(),
      createdAt,
      source: "d",
      placement: "d_popup",
      email: email.trim(),
      firstName: firstName.trim().slice(0, MAX_FIRST_NAME),
      waitlist: true,
      interview,
      sessionId: null,
      variant: null,
      isTest: isTestRun(),
      participant: "",
      context: "",
      page: window.location.pathname,
    };
    void saveSignup(signup);
    markSignedUp(createdAt, "d");
    track("interest_signup", { source: "d", placement: "d_popup", interview, is_test: signup.isTest });
    setDone(true);
    requestAnimationFrame(() => document.getElementById(titleId)?.focus({ preventScroll: true }));
  }

  return (
    <DModal label={done ? INTEREST_DONE_TITLE : INTEREST_TITLE} onEscape={done ? onClose : noThanks}>
      <section data-d-offer aria-labelledby={titleId} className="overflow-y-auto overscroll-contain rounded-[24px] bg-surface p-5 shadow-lift sm:p-6">
        {done ? (
          <>
            <div className="flex items-start gap-3" role="status">
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky text-ink ring-2 ring-ink [&_svg]:size-5">
                <MailCheck />
              </span>
              <div className="min-w-0">
                <h2 id={titleId} data-step-title tabIndex={-1} className="text-[20px] font-extrabold leading-snug tracking-tight text-ink outline-none">
                  {INTEREST_DONE_TITLE}
                </h2>
                <p className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">{INTEREST_DONE_BODY}</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className={cn(D_PILL_PRIMARY, "mt-5 h-12 w-full px-6 text-[16px]")}>
              Close
            </button>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream text-ink ring-2 ring-ink [&_svg]:size-5">
                <Sparkles />
              </span>
              <h2 id={titleId} data-step-title tabIndex={-1} className="pt-1.5 text-[20px] font-extrabold leading-snug tracking-tight text-ink outline-none sm:text-[22px]">
                {INTEREST_TITLE}
              </h2>
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{INTEREST_BODY}</p>
            <label htmlFor={emailId} className={cn(LABEL, "mt-4")}>
              Email
            </label>
            <input
              id={emailId}
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              spellCheck={false}
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={hintId}
              aria-invalid={attempted && !valid ? true : undefined}
              className={FIELD}
            />
            <p id={hintId} className="mt-1.5 min-h-4 text-[13px] leading-snug text-ink-soft" aria-live="polite">
              {attempted && !valid ? EMAIL_HINT : ""}
            </p>
            <label htmlFor={nameId} className={cn(LABEL, "mt-1")}>
              First name
              <Optional />
            </label>
            <input
              id={nameId}
              autoComplete="given-name"
              autoCapitalize="words"
              spellCheck={false}
              maxLength={MAX_FIRST_NAME}
              placeholder="Alex"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={FIELD}
            />
            <label
              htmlFor={interviewId}
              className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl px-1 py-2 text-[14px] leading-snug text-ink-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-breeze-500"
            >
              <input
                id={interviewId}
                type="checkbox"
                checked={interview}
                onChange={(e) => setInterview(e.target.checked)}
                className="mt-0.5 size-5 shrink-0 cursor-pointer accent-night-900 focus:outline-none"
              />
              <span>{INTEREST_INTERVIEW}</span>
            </label>
            <div className="mt-4 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4">
              <button type="submit" className={cn(D_PILL_PRIMARY, "h-12 w-full px-6 text-[16px] sm:w-auto")}>
                {INTEREST_BUTTON}
              </button>
              <button
                type="button"
                onClick={noThanks}
                className={cn(D_LINK, "inline-flex min-h-11 items-center justify-center rounded-full px-2 text-[15px] font-semibold text-ink-soft sm:justify-start")}
              >
                {NO_THANKS}
              </button>
            </div>
            <PrivacyNote />
          </form>
        )}
      </section>
    </DModal>
  );
}
