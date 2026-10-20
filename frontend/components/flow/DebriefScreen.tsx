"use client";

import { Info, MailCheck } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { Wordmark } from "./StepHeader";

interface DebriefScreenProps {
  /** Email already submitted (e.g. after a reload). */
  emailSent: boolean;
  onEmail: (email: string, firstName: string) => void;
  /** Team test sessions get a way to start over. */
  isTest?: boolean;
  onStartOver?: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Thank-you + the illustrative-data reminder + optional first name and follow-up email. */
export function DebriefScreen({ emailSent, onEmail, isTest = false, onStartOver }: DebriefScreenProps) {
  const emailId = useId();
  const nameId = useId();
  const hintId = useId();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [attempted, setAttempted] = useState(false);
  /** When the email went out: the shorter "thanks" card moves "Start a new test session" under the thumb. */
  const sentAt = useRef<number | null>(null);
  const valid = EMAIL_RE.test(email.trim());

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) {
      setAttempted(true);
      return;
    }
    sentAt.current = performance.now();
    onEmail(email.trim(), firstName.trim().slice(0, 60));
  }

  function startOver() {
    // Ignore the second half of a double tap on "Count me in".
    if (sentAt.current !== null && performance.now() - sentAt.current < 600) return;
    onStartOver?.();
  }

  return (
    <Screen>
      <Wordmark className="animate-fade-up" />
      <div className="mt-9 animate-fade-up [animation-delay:60ms]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-calm-700">Thank you</p>
        <h1 tabIndex={-1} className="mt-1.5 text-[28px] font-bold leading-[1.12] tracking-[-0.01em] text-ink-900 outline-none">
          That&rsquo;s everything
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
          Thanks for taking part. Your answers help a student team understand what nervous flyers actually need
          before a flight.
        </p>
      </div>

      <Card className="mt-6 animate-fade-up [animation-delay:120ms] !bg-breeze-50 !ring-breeze-100">
        <div className="flex gap-3">
          <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface text-breeze-700 ring-1 ring-inset ring-breeze-100">
            <Info className="size-4" />
          </span>
          <div>
            <p className="text-[15px] font-semibold leading-snug text-ink-900">A reminder about the data</p>
            <p className="mt-1.5 text-[14px] leading-relaxed text-ink-700">
              Everything in the briefing was illustrative. It previewed how a briefing would look the day before
              departure (or on the day, for a flight today), for an example flight on your route. The forecast, who flies your plane, the aircraft, the
              scores and the alternative flights were all generated for this study. None of it was a real forecast
              or real information about any flight. No alerts were set up, and no seat or flight was held or booked.
            </p>
          </div>
        </div>
      </Card>

      <Card className="mt-3 animate-fade-up [animation-delay:180ms]">
        {emailSent ? (
          <div className="flex items-start gap-3" role="status">
            <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-calm-50 text-calm-700 ring-1 ring-inset ring-calm-100">
              <MailCheck className="size-4" />
            </span>
            <div>
              <p className="text-[15px] font-semibold leading-snug text-ink-900">Thanks — we may reach out.</p>
              <p className="mt-1 text-[13px] leading-snug text-ink-500">We&rsquo;ll only use your name and email for this study.</p>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <p className="text-[15px] font-semibold leading-snug text-ink-900">Open to a short follow-up chat?</p>
            <p className="mt-1 text-[13px] leading-snug text-ink-500">
              Optional. Leave your first name and email and we may invite you to a 15-minute interview. They&rsquo;re
              stored with your answers.
            </p>
            <label htmlFor={nameId} className="mt-4 block text-[13px] font-semibold text-ink-700">
              First name
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
              className="mt-1.5 h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong placeholder:text-ink-400 focus:ring-2 focus:ring-breeze-500 focus:outline-none"
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
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby={hintId}
              className="mt-1.5 h-12 w-full rounded-2xl bg-surface px-4 text-[15px] text-ink-900 shadow-soft ring-1 ring-inset ring-line-strong placeholder:text-ink-400 focus:ring-2 focus:ring-breeze-500 focus:outline-none"
            />
            <p id={hintId} className="mt-1.5 h-4 text-[13px] leading-snug text-sand-700" aria-live="polite">
              {attempted && !valid ? "That email doesn't look complete yet." : ""}
            </p>
            <Button type="submit" variant="secondary" size="md" block className="mt-2">
              Count me in
            </Button>
          </form>
        )}
      </Card>

      <p className="mt-8 text-center text-[15px] font-semibold text-ink-700 animate-fade-up [animation-delay:240ms]">
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
