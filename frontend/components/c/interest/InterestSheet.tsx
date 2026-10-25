"use client";

import { MailCheck } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import type { Signup, SignupPlacement } from "@preflight/shared/types";
import { Sheet } from "@/components/c/common/Sheet";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/cn";
import { saveSignup } from "@/lib/storage";
import { isCTest, markSignedUp } from "./signupState";

/*
 * The "notify me when it's live" sheet (docs/INTEREST.md): first name
 * (optional), email (required), the interview checkbox, one button. Version C
 * (the default): on submit the sign-up is saved (localStorage mirror +
 * /api/signups), the browser is marked as signed up and the sheet shows
 * "You're on the list." The study's dashboard card passes `onSubmit` instead:
 * the sheet validates and hands the details to the host, which saves them to
 * the session record and the sign-ups list and tracks the event itself. Render
 * it only in response to the visitor (it portals on mount); it closes itself
 * through onClose, and the Sheet returns focus to whatever opened it.
 */

/** What the form hands over: the same shape the study's debrief form submits. */
export interface InterestSubmission {
  email: string;
  /** "" if left blank. */
  firstName: string;
  /** Also open to a short follow-up chat. */
  interview: boolean;
}

/** Same rule and copy as the study's debrief form. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_HINT = "That email doesn't look complete yet.";
const MAX_FIRST_NAME = 60;

// Typographic apostrophes (’), like the study's debrief and the rest of C's copy, so the
// shared strings read the same in both prototypes (and match the same PostHog click names).
export const INTEREST_TITLE = "Want this for your real flights?";
export const INTEREST_BODY =
  "Cloud9 is a prototype today. We’re building it into a free app. Leave your email and we’ll let you know when it’s live — one email, no spam.";
export const INTEREST_BUTTON = "Notify me when it’s live";
export const INTEREST_INTERVIEW = "I’m also open to a 15-minute chat about what I’d want from this";
/** The study's wording of the interview box (docs/INTEREST.md). */
export const INTEREST_INTERVIEW_STUDY = "I’m also open to a 15-minute chat about my experience";
export const INTEREST_DONE_TITLE = "You’re on the list.";
export const INTEREST_DONE_BODY = "We’ll email you once when it launches.";
/** The study adds this line under the "on the list" body. */
export const INTEREST_DONE_PRIVACY = "We’ll only use your name and email for this.";

const INPUT =
  "mt-1.5 h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-breeze-500";

interface InterestSheetProps {
  placement: SignupPlacement;
  /** What the visitor was looking at, e.g. "JFK → LAX · Nov 26 · 14 flights"; "" on the home. */
  context: string;
  onClose: () => void;
  /** Where focus goes on close when the opener is gone (it is, after a sign-up replaces it). */
  fallbackFocus?: () => HTMLElement | null;
  /**
   * The study: the host saves the sign-up (session record + sign-ups list), marks the browser and
   * tracks interest_signup; the sheet only validates, hands over the details and shows the done
   * state with the study's wording. Absent: version C's own saving.
   */
  onSubmit?: (submission: InterestSubmission) => void;
}

/** A v4 UUID; the one browser without crypto.randomUUID (old Safari) gets the same shape from getRandomValues. */
function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function InterestSheet({ placement, context, onClose, fallbackFocus, onSubmit }: InterestSheetProps) {
  const study = onSubmit !== undefined;
  const formId = useId();
  const nameId = useId();
  const emailId = useId();
  const hintId = useId();
  const interviewId = useId();
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [interview, setInterview] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [done, setDone] = useState(false);
  /** When the sign-up went out: the Done button (and the backdrop) land where the submit button was. */
  const submittedAt = useRef<number | null>(null);
  const valid = EMAIL_RE.test(email.trim());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setAttempted(true);
      document.getElementById(emailId)?.focus();
      return;
    }
    // A second tap before the done state renders must not create a second sign-up.
    if (submittedAt.current !== null) return;
    if (onSubmit) {
      onSubmit({ email: email.trim(), firstName: firstName.trim().slice(0, MAX_FIRST_NAME), interview });
      finishSubmit();
      return;
    }
    const createdAt = new Date().toISOString();
    const signup: Signup = {
      schemaVersion: 1,
      id: newId(),
      createdAt,
      source: "c",
      placement,
      email: email.trim(),
      firstName: firstName.trim().slice(0, MAX_FIRST_NAME),
      waitlist: true,
      interview,
      sessionId: null,
      variant: null,
      isTest: isCTest(),
      participant: "",
      context,
      page: window.location.pathname,
    };
    void saveSignup(signup);
    markSignedUp(createdAt);
    track("interest_signup", { source: "c", placement, interview, is_test: signup.isTest });
    finishSubmit();
  }

  function finishSubmit() {
    submittedAt.current = performance.now();
    setDone(true);
    // The submit button is gone with the form: focus moves to the sheet's (new) title, which announces it.
    requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-sheet-title]")?.focus({ preventScroll: true }));
  }

  function closeDone() {
    // Ignore the second half of a double tap on "Notify me when it's live" (same window as the study's debrief).
    if (submittedAt.current !== null && performance.now() - submittedAt.current < 600) return;
    onClose();
  }

  if (done) {
    return (
      <Sheet title={INTEREST_DONE_TITLE} onClose={closeDone} fallbackFocus={fallbackFocus}>
        <div className="flex items-start gap-3 pt-1">
          <span
            aria-hidden
            className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-100"
          >
            <MailCheck className="size-5" />
          </span>
          <div className="min-w-0 pt-1.5">
            <p role="status" className="text-[15px] leading-relaxed text-ink-700">
              {INTEREST_DONE_BODY}
            </p>
            {study ? <p className="mt-1 text-[13px] leading-snug text-ink-500">{INTEREST_DONE_PRIVACY}</p> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={closeDone}
          className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-full bg-surface px-5 text-sm font-semibold text-ink-900 ring-1 ring-inset ring-line-strong transition-colors hover:bg-canvas active:bg-line/60"
        >
          Done
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet
      title={INTEREST_TITLE}
      description={INTEREST_BODY}
      onClose={onClose}
      fallbackFocus={fallbackFocus}
      footer={
        <button
          type="submit"
          form={formId}
          className="inline-flex h-12 w-full items-center justify-center rounded-full bg-night-900 px-5 text-[15px] font-semibold text-white shadow-lift transition-colors hover:bg-night-800 active:bg-night-950"
        >
          {INTEREST_BUTTON}
        </button>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="pt-1">
        <label htmlFor={nameId} className="mt-2 block text-[13px] font-semibold text-ink-700">
          First name <span className="font-normal text-ink-500">(optional)</span>
        </label>
        {/* No type attribute (a plain text input): the Sheet hides its footer and description while a
            `[type=text]` is focused on a short screen, which is for the search sheet's comboboxes, not
            for the one short field here — the submit button stays in view while the name is typed. */}
        <input
          id={nameId}
          autoComplete="given-name"
          autoCapitalize="words"
          spellCheck={false}
          maxLength={MAX_FIRST_NAME}
          placeholder="Alex"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className={INPUT}
        />
        <label htmlFor={emailId} className="mt-3 block text-[13px] font-semibold text-ink-700">
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
          className={INPUT}
        />
        <p id={hintId} className="mt-1.5 min-h-4 text-[13px] leading-snug text-sand-700" aria-live="polite">
          {attempted && !valid ? EMAIL_HINT : ""}
        </p>
        <label
          htmlFor={interviewId}
          className={cn(
            "mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl px-1 py-2 text-[14px] leading-snug text-ink-700",
            "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-breeze-500",
          )}
        >
          <input
            id={interviewId}
            type="checkbox"
            checked={interview}
            onChange={(e) => setInterview(e.target.checked)}
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-night-900 focus:outline-none"
          />
          <span>{study ? INTEREST_INTERVIEW_STUDY : INTEREST_INTERVIEW}</span>
        </label>
        {/* Pressing Enter in a field submits through the footer's button (same form id); nothing to add here. */}
      </form>
    </Sheet>
  );
}
