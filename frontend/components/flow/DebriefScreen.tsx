"use client";

import { Bell, Info, MailCheck } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { ShareCard } from "./ShareCard";
import { Wordmark } from "./StepHeader";

/** What the product-interest form submits (docs/INTEREST.md). */
export interface DebriefSignup {
  email: string;
  /** "" if left blank. */
  firstName: string;
  /** Also open to a short follow-up chat. */
  interview: boolean;
}

interface DebriefScreenProps {
  /** Sign-up already submitted (e.g. after a reload). */
  signedUp: boolean;
  onSignup: (signup: DebriefSignup) => void;
  /** Team test sessions get a way to start over. */
  isTest?: boolean;
  onStartOver?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Thank-you + the illustrative-data reminder + the optional "notify me when it's live" sign-up. */
export function DebriefScreen({ signedUp, onSignup, isTest = false, onStartOver }: DebriefScreenProps) {
  const emailId = useId();
  const nameId = useId();
  const hintId = useId();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [interview, setInterview] = useState(false);
  const [attempted, setAttempted] = useState(false);
  /** When the sign-up went out: the shorter "on the list" card moves "Start a new test session" under the thumb. */
  const sentAt = useRef<number | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  /** The "on the list" card takes focus after a submit (the submit button is gone with the form). */
  const doneRef = useRef<HTMLParagraphElement>(null);
  /** "interest_cta_view" fires once per page view. */
  const ctaViewed = useRef(false);
  const valid = EMAIL_RE.test(email.trim());

  // Analytics (docs/ANALYTICS.md): the sign-up card scrolled into view. Only while the
  // form is offered — an "on the list" card after a reload is not a call to action.
  useEffect(() => {
    const el = cardRef.current;
    if (signedUp || !el || ctaViewed.current) return;
    const seen = () => {
      if (ctaViewed.current) return;
      ctaViewed.current = true;
      track("interest_cta_view", { source: "study", placement: "debrief" });
    };
    if (typeof IntersectionObserver === "undefined") {
      seen();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        seen();
        observer.disconnect();
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [signedUp]);

  // Focus moves to the "on the list" card once the submit from this page view lands, so keyboard
  // and screen-reader users are not dropped on <body>. Not after a reload (sentAt is null then).
  useEffect(() => {
    if (signedUp && sentAt.current !== null) doneRef.current?.focus({ preventScroll: true });
  }, [signedUp]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setAttempted(true);
      emailRef.current?.focus();
      return;
    }
    // A second tap before the "on the list" card renders must not create a second sign-up.
    if (sentAt.current !== null) return;
    sentAt.current = performance.now();
    onSignup({ email: email.trim(), firstName: firstName.trim().slice(0, 60), interview });
  }

  function startOver() {
    // Ignore the second half of a double tap on "Notify me when it's live".
    if (sentAt.current !== null && performance.now() - sentAt.current < 600) return;
    onStartOver?.();
  }

  const inputClass =
    "mt-1.5 h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong placeholder:text-ink-400 focus:ring-2 focus:ring-breeze-500 focus:outline-none";

  return (
    <Screen>
      <Wordmark className="animate-fade-up" />
      <div className="mt-9 animate-fade-up [animation-delay:60ms]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-calm-700">That&rsquo;s everything</p>
        <h1 tabIndex={-1} className="mt-1.5 text-[40px] font-bold leading-[1.08] tracking-[-0.02em] text-ink-900 outline-none">
          Thank you!
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
          Your answers help a student team understand what nervous flyers actually need before a flight.
        </p>
      </div>


      {/* The screen's one action: the product sign-up (docs/INTEREST.md). Same copy in A and B; optional. */}
      <div ref={cardRef} className="mt-6 animate-fade-up [animation-delay:120ms]">
        <Card className="!bg-calm-50 !ring-calm-100">
          {signedUp ? (
            <div className="flex items-start gap-3" role="status">
              <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface text-calm-700 ring-1 ring-inset ring-calm-100">
                <MailCheck className="size-4" />
              </span>
              <div>
                <p ref={doneRef} tabIndex={-1} className="text-[15px] font-semibold leading-snug text-ink-900 outline-none">
                  You&rsquo;re on the list.
                </p>
                <p className="mt-1 text-[13px] leading-snug text-ink-700">We&rsquo;ll email you once when it launches.</p>
                <p className="mt-1 text-[13px] leading-snug text-ink-500">We&rsquo;ll only use your name and email for this.</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="flex gap-3">
                <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface text-calm-700 ring-1 ring-inset ring-calm-100">
                  <Bell className="size-4" />
                </span>
                <div>
                  <h2 className="text-[17px] font-semibold leading-snug text-ink-900">Want this for your real flights?</h2>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-ink-700">
                    Cloud9 is a prototype today. We&rsquo;re building it into a free app. Leave your email
                    and we&rsquo;ll let you know when it&rsquo;s live &mdash; one email, no spam.
                  </p>
                </div>
              </div>
              <label htmlFor={nameId} className="mt-5 block text-[13px] font-semibold text-ink-700">
                First name <span className="font-normal text-ink-500">(optional)</span>
              </label>
              <input
                id={nameId}
                type="text"
                autoComplete="given-name"
                autoCapitalize="words"
                spellCheck={false}
                maxLength={60}
                placeholder="Alex"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={inputClass}
              />
              <label htmlFor={emailId} className="mt-3 block text-[13px] font-semibold text-ink-700">
                Email
              </label>
              <input
                ref={emailRef}
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
                className={inputClass}
              />
              <p id={hintId} className="mt-1.5 h-4 text-[13px] leading-snug text-sand-700" aria-live="polite">
                {attempted && !valid ? "That email doesn't look complete yet." : ""}
              </p>
              {/* Unticked by default; the whole row is the tap target. */}
              <label className="mt-2 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl py-2 text-[14px] leading-snug text-ink-700">
                <input
                  type="checkbox"
                  checked={interview}
                  onChange={(e) => setInterview(e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 cursor-pointer rounded-md accent-night-900"
                />
                <span>I&rsquo;m also open to a 15-minute chat about my experience</span>
              </label>
              <Button type="submit" size="md" block className="mt-3">
                Notify me when it&rsquo;s live
              </Button>
            </form>
          )}
        </Card>
      </div>

      {/* Pass it on (team ask 2026-10-26): the plain link, never this session's parameters. */}
      <ShareCard className="mt-3 animate-fade-up [animation-delay:180ms]" />

      <Card className="mt-3 animate-fade-up [animation-delay:240ms] !bg-breeze-50 !ring-breeze-100">
        <div className="flex gap-3">
          <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface text-breeze-700 ring-1 ring-inset ring-breeze-100">
            <Info className="size-4" />
          </span>
          <div>
            <p className="text-[15px] font-semibold leading-snug text-ink-900">A reminder about the data</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-700">
              Everything in the briefing was illustrative. None of it was a real forecast or real information about
              any flight. No alerts were set up, and no seat or flight was held or booked.
            </p>
          </div>
        </div>
      </Card>

      <p className="mt-8 text-center text-[15px] font-semibold text-ink-700 animate-fade-up [animation-delay:300ms]">
        You can close this page now.
      </p>
      <p className="mt-2 text-center text-xs text-ink-500">Prototype · illustrative data</p>

      {isTest && onStartOver ? (
        <button
          type="button"
          onClick={startOver}
          className="mx-auto mt-6 h-10 rounded-full px-4 text-[13px] font-semibold text-ink-500 underline-offset-4 hover:underline"
        >
          Start a new test session
        </button>
      ) : null}
    </Screen>
  );
}
