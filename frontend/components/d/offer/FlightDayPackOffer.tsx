"use client";

import { Bell, MapPinned, MessageSquareText, Plus, Sparkles } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { addDays } from "@preflight/shared/dates";
import type { DismissReason, OfferPlacement, PackItem, PlanChoice, Signup } from "@preflight/shared/types";
import { INTEREST_INTERVIEW } from "@/components/c/interest/InterestSheet";
import { D_LINK, D_PILL_PRIMARY } from "@/components/d/brand/buttons";
import { transitionRunning, whenTransitionEnds } from "@/components/d/motion/motion";
import { cn } from "@/lib/cn";
import {
  claimResults,
  closeOffer,
  isTestRun,
  markPricingAsked,
  markViewed,
  newUuid,
  noteOpenAnswer,
  noteSurface,
  pickButton,
  pickedOnThisLoad,
  pricingAsked,
  resultsCardAllowed,
  savePackRow,
  sessionUtms,
  trackPack,
  usePackSession,
} from "@/lib/d/flightDayPack";
import { ARM_PRICE, useArm, type ArmState } from "@/lib/d/priceArm";
import { loadLocalSignups, saveSignup } from "@/lib/storage";
import { useTodayISO } from "@/lib/hooks";
import * as copy from "./copy";
import { DModal } from "./DModal";
import { ChoiceGroup, FIELD, LABEL, Optional, TextAnswer } from "./fields";

/*
 * The Flight Day Pack offer (docs/FLIGHT_DAY_PACK.md), iteration 2 (2026-11-19, the owner's request): two
 * surfaces in a light sunset orange (app/d/d-offer-sunset.css; the owner lifted D's "never a pop-up" and
 * "never orange" rules for these two only).
 *
 * - `results`: a panel that slides in from the right 5 s after the visitor first scrolls the results, fixed
 *   to the screen over the list. Not modal: the page stays usable. It closes only through its own steps.
 * - `after_pick`: a dialog over a dimmed page right after "I'd pick this flight" (flight and compare pages).
 *   It must be answered: "Add to flight – $X" or "No thanks" (Escape counts as "No thanks"); no ✕, and the
 *   backdrop does nothing.
 *
 * Once per placement per session, the results panel never after the after_pick dialog, and gone for the
 * session after either choice. The card is the same for every flight and every search: it is given only its
 * placement and which page it is on. It exists only on the client (the price arm has no server value). The
 * cloud gives it no reaction (`[data-d-offer]` in components/d/cloud/reactions.ts), "Add" and "No thanks"
 * alike. "Add" is an honest fake door: nothing is ever charged or asked for.
 */

type Stage = "offer" | "join" | "items" | "dismiss" | "pricing" | "thanks";
type Path = "join" | "dismiss" | "skip";

/** Same rule as the sign-up sheet's. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FIRST_NAME = 60;
/** The results panel waits this long after the visitor's first scroll of the results. */
export const POP_IN_DELAY_MS = 5000;

// ── results: the pop-in ─────────────────────────────────────────────────────

/**
 * The results panel. `ready`: the day's flights are on screen. `context`: which search it is for
 * ("results:JFK.LAX.2026-11-26"); it never shows on another one in the same session.
 */
export function FlightDayPackPopIn({ context, ready }: { context: string; ready: boolean }) {
  const session = usePackSession();
  const arm = useArm();
  const [engaged, setEngaged] = useState(false);
  const [due, setDue] = useState(false);
  const [closed, setClosed] = useState(false);
  const allowed = session !== null && arm !== null && (engaged || resultsCardAllowed(session, context));

  // 5 s after the first scroll (once the flights are there), and never during a page transition.
  useEffect(() => {
    if (!ready || !allowed || due) return;
    let timer: number | undefined;
    let cancelWait: (() => void) | undefined;
    const start = () => {
      window.removeEventListener("scroll", start);
      timer = window.setTimeout(() => {
        cancelWait = whenTransitionEnds(() => setDue(true));
      }, POP_IN_DELAY_MS);
    };
    window.addEventListener("scroll", start, { passive: true });
    return () => {
      window.removeEventListener("scroll", start);
      window.clearTimeout(timer);
      cancelWait?.();
    };
  }, [ready, allowed, due]);

  useEffect(() => {
    if (due && allowed && !closed) claimResults(context);
  }, [due, allowed, closed, context]);

  if (!due || !allowed || closed || !arm) return null;
  return (
    <PopInPanel>
      <OfferFlow placement="results" arm={arm} onEngage={() => setEngaged(true)} onClose={() => setClosed(true)} />
    </PopInPanel>
  );
}

/** Fixed over the results, from the right; clear of the header and of the compare tray. */
function PopInPanel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bottom, setBottom] = useState(16);
  useEffect(() => {
    noteSurface(true);
    return () => noteSurface(false);
  }, []);
  // Above the compare tray when it shows (it is sticky at the bottom of the screen).
  useEffect(() => {
    const measure = () => {
      const tray = document.getElementById("c-compare-tray");
      const box = tray?.getBoundingClientRect();
      const covered = box && box.height > 0 && box.top < window.innerHeight ? window.innerHeight - box.top : 0;
      setBottom(Math.max(16, Math.round(covered) + 12));
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    const tray = document.getElementById("c-compare-tray");
    if (tray && observer) observer.observe(tray);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
    };
  }, []);
  const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>('[data-theme="d"]');
  const panel = (
    <div
      ref={ref}
      className="d-offer-popin fixed right-0 z-[45] w-[88vw] max-w-[400px] sm:right-6 sm:w-[392px]"
      style={{ bottom }}
    >
      {children}
    </div>
  );
  // In D's root, outside <main>, like the dialogs: above the page and the companion cloud.
  return root ? createPortal(panel, root) : panel;
}

// ── after_pick: the dialog ──────────────────────────────────────────────────

/** The after_pick dialog for this page ("flight:JFK.LAX.2026-11-26.DL1423" or "compare"). */
export function FlightDayPackModal({ context }: { context: string }) {
  const session = usePackSession();
  const arm = useArm();
  const [engaged, setEngaged] = useState(false);
  const [closed, setClosed] = useState(false);
  const open =
    session !== null &&
    arm !== null &&
    !closed &&
    session.shown.after_pick === context &&
    pickedOnThisLoad(context) &&
    (engaged || !session.closed);
  if (!open || !arm) return null;
  return (
    <DModal sunset label={copy.OFFER_DIALOG_LABEL} onReturnFocus={pickButton}>
      <OfferFlow placement="after_pick" arm={arm} onEngage={() => setEngaged(true)} onClose={() => setClosed(true)} />
    </DModal>
  );
}

// ── The flow, the same on both surfaces ─────────────────────────────────────

function OfferFlow({
  placement,
  arm,
  onEngage,
  onClose,
}: {
  placement: OfferPlacement;
  arm: ArmState;
  onEngage: () => void;
  onClose: () => void;
}) {
  const price = ARM_PRICE[arm.arm].label;
  const titleId = useId();
  const rootRef = useRef<HTMLElement>(null);
  const [stage, setStage] = useState<Stage>("offer");
  const [path, setPath] = useState<Path>("skip");
  /** "No thanks" was chosen and its answer isn't sent yet (sent on Done, or when the visitor leaves). */
  const dismissRef = useRef<{ reason: DismissReason | null; text: string } | null>(null);
  const [reason, setReason] = useState<DismissReason | null>(null);
  const [anythingElse, setAnythingElse] = useState("");

  // Seen once it has finished arriving (the pop-in's slide or fade; the dialog's open), once per placement
  // per session, and never while a page transition covers it.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let cancelWait: (() => void) | undefined;
    const seen = () => {
      if (transitionRunning()) {
        cancelWait = whenTransitionEnds(seen);
        return;
      }
      if (markViewed(placement)) trackPack("d_addon_view", placement);
    };
    const host = el.closest(".d-offer-popin");
    const animating = host?.getAnimations?.().filter((a) => a.playState === "running") ?? [];
    let gone = false;
    if (animating.length) void Promise.all(animating.map((a) => a.finished)).then(() => !gone && seen(), () => !gone && seen());
    else seen();
    return () => {
      gone = true;
      cancelWait?.();
    };
  }, [placement]);

  /** Send what "No thanks" collected: the reason's key (or none_given) and, when anything was answered, the row. */
  const finishDismiss = () => {
    const pending = dismissRef.current;
    if (!pending) return;
    dismissRef.current = null;
    trackPack("d_addon_dismiss", placement, { reason: pending.reason ?? "none_given" });
    const text = pending.text.trim();
    if (pending.reason || text) savePackRow({ kind: "addon_dismiss", placement, answers: { reason: pending.reason, anythingElse: text } });
    if (text) noteOpenAnswer();
  };
  const finishRef = useRef(finishDismiss);
  useEffect(() => {
    finishRef.current = finishDismiss;
  });
  // Leaving the page (another page, or the tab closing) with "No thanks" unanswered still counts it.
  useEffect(() => {
    const onHide = () => finishRef.current();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      finishRef.current();
    };
  }, []);

  /** Move on, and take the focus to the new step's heading so a screen reader hears where it is. */
  const go = (next: Stage) => {
    if (next === "pricing") markPricingAsked();
    setStage(next);
    requestAnimationFrame(() => {
      const root = rootRef.current;
      root?.querySelector<HTMLElement>("[data-step-title]")?.focus({ preventScroll: true });
      root?.closest<HTMLElement>("[data-d-offer-scroll]")?.scrollTo({ top: 0 });
    });
  };
  const afterAnswers = () => go(pricingAsked() ? "thanks" : "pricing");

  const add = () => {
    trackPack("d_addon_click", placement);
    onEngage();
    closeOffer();
    setPath("skip");
    go("join");
  };
  const noThanks = () => {
    onEngage();
    closeOffer();
    dismissRef.current = { reason: null, text: "" };
    setPath("dismiss");
    go("dismiss");
  };
  const doneDismiss = () => {
    finishDismiss();
    afterAnswers();
  };

  // Escape: "No thanks" at the choice, and the step's own way on (Skip, Done, Close) after it.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (stage === "offer") noThanks();
    else if (stage === "join") afterAnswers();
    else if (stage === "items") afterAnswers();
    else if (stage === "dismiss") doneDismiss();
    else if (stage === "pricing") go("thanks");
    else onClose();
  };

  return (
    <section
      ref={rootRef}
      data-d-offer
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="d-offer-sunset max-h-[inherit] overflow-y-auto overscroll-contain rounded-[24px] p-5 shadow-lift sm:p-6"
      data-d-offer-scroll
    >
      {stage === "offer" ? (
        <Offer titleId={titleId} price={price} onAdd={add} onNoThanks={noThanks} />
      ) : stage === "join" ? (
        <Join
          titleId={titleId}
          placement={placement}
          arm={arm}
          onJoined={() => {
            setPath("join");
            go("items");
          }}
          onSkip={afterAnswers}
        />
      ) : stage === "items" ? (
        <Items titleId={titleId} placement={placement} onDone={afterAnswers} />
      ) : stage === "dismiss" ? (
        <Dismiss
          titleId={titleId}
          reason={reason}
          text={anythingElse}
          onReason={(r) => {
            setReason(r);
            if (dismissRef.current) dismissRef.current.reason = r;
          }}
          onText={(t) => {
            setAnythingElse(t);
            if (dismissRef.current) dismissRef.current.text = t;
          }}
          onDone={doneDismiss}
        />
      ) : stage === "pricing" ? (
        <Pricing titleId={titleId} placement={placement} onDone={() => go("thanks")} />
      ) : (
        <Thanks titleId={titleId} joined={path === "join"} onClose={onClose} />
      )}
    </section>
  );
}

// ── The steps ───────────────────────────────────────────────────────────────

const ITEM_ICONS = { walkthrough: <MapPinned />, forecast_alerts: <Bell />, landed_text: <MessageSquareText /> } as const;

function StepTitle({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} data-step-title tabIndex={-1} className="rounded-md text-[20px] font-extrabold leading-snug tracking-tight text-ink outline-none sm:text-[22px]">
      {children}
    </h2>
  );
}

/** The quiet secondary: a plain underlined text button. */
const QUIET = cn(D_LINK, "inline-flex min-h-11 items-center rounded-full px-2 text-[15px] font-semibold text-ink-soft");
const PRIMARY = cn(D_PILL_PRIMARY, "h-12 w-full px-6 text-[16px] sm:w-auto");

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-5 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-4">{children}</div>;
}

function Offer({ titleId, price, onAdd, onNoThanks }: { titleId: string; price: string; onAdd: () => void; onNoThanks: () => void }) {
  return (
    <>
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-cream text-ink ring-2 ring-ink [&_svg]:size-5">
          <Sparkles />
        </span>
        <div className="min-w-0">
          <StepTitle id={titleId}>{copy.OFFER_TITLE}</StepTitle>
          <p className="mt-0.5 text-[15px] font-bold leading-snug text-ink-soft tabular-nums">{copy.offerLine(price)}</p>
        </div>
      </div>
      <ul className="mt-4 flex flex-col gap-3">
        {copy.OFFER_ITEMS.map((item) => (
          <li key={item.key} className="flex items-start gap-3">
            <span aria-hidden className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-sky text-ink [&_svg]:size-4">
              {ITEM_ICONS[item.key]}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold leading-snug text-ink">{item.title}</span>
              {item.detail ? <span className="mt-0.5 block text-[13px] leading-snug text-ink-mute">{item.detail}</span> : null}
            </span>
          </li>
        ))}
        <li className="flex items-center gap-3">
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center text-ink-soft [&_svg]:size-4">
            <Plus />
          </span>
          <span className="text-[15px] font-semibold leading-snug text-ink-soft">{copy.AND_MORE}</span>
        </li>
      </ul>
      <Actions>
        <button type="button" onClick={onAdd} className={PRIMARY}>
          {copy.addLabel(price)}
        </button>
        <button type="button" onClick={onNoThanks} className={cn(QUIET, "justify-center sm:justify-start")}>
          {copy.NO_THANKS}
        </button>
      </Actions>
    </>
  );
}

function Join({
  titleId,
  placement,
  arm,
  onJoined,
  onSkip,
}: {
  titleId: string;
  placement: OfferPlacement;
  arm: ArmState;
  onJoined: () => void;
  onSkip: () => void;
}) {
  const today = useTodayISO();
  const emailId = useId();
  const hintId = useId();
  const nameId = useId();
  const dateId = useId();
  const dateHintId = useId();
  const interviewId = useId();
  // Prefilled with the email this browser already signed up with, if any (the latest sign-up saved here).
  const [email, setEmail] = useState(() => loadLocalSignups()[0]?.email ?? "");
  const [firstName, setFirstName] = useState("");
  const [interview, setInterview] = useState(false);
  const [flightDate, setFlightDate] = useState("");
  const [attempted, setAttempted] = useState(false);
  const sent = useRef(false);
  const valid = EMAIL_RE.test(email.trim());
  const max = today ? addDays(today, 365) : undefined;
  const dateOk = flightDate === "" || (today !== null && max !== undefined && flightDate >= today && flightDate <= max);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid || !dateOk) {
      setAttempted(true);
      document.getElementById(!valid ? emailId : dateId)?.focus();
      return;
    }
    // A second tap before the next step renders must not send a second sign-up.
    if (sent.current) return;
    sent.current = true;
    const utms = sessionUtms();
    const signup: Signup = {
      schemaVersion: 1,
      id: newUuid(),
      createdAt: new Date().toISOString(),
      source: "d",
      placement: "d_addon",
      email: email.trim(),
      firstName: firstName.trim().slice(0, MAX_FIRST_NAME),
      waitlist: true,
      interview,
      sessionId: null,
      variant: null,
      isTest: isTestRun(),
      participant: "",
      context: `Flight Day Pack · ${ARM_PRICE[arm.arm].label} per trip · ${placement === "after_pick" ? "after a pick" : "in the results"}`,
      page: window.location.pathname,
      priceArm: arm.arm,
      ...(arm.forced ? { armForced: true as const } : {}),
      offerPlacement: placement,
      ...(flightDate ? { flightDate } : {}),
      ...(utms.utmSource ? { utmSource: utms.utmSource } : {}),
      ...(utms.utmMedium ? { utmMedium: utms.utmMedium } : {}),
      ...(utms.utmCampaign ? { utmCampaign: utms.utmCampaign } : {}),
    };
    void saveSignup(signup);
    trackPack("d_addon_waitlist", placement);
    onJoined();
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepTitle id={titleId}>{copy.JOIN_TITLE}</StepTitle>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{copy.JOIN_BODY}</p>

      <label htmlFor={emailId} className={cn(LABEL, "mt-4")}>
        {copy.EMAIL_LABEL}
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
        {attempted && !valid ? copy.EMAIL_HINT : ""}
      </p>

      <label htmlFor={nameId} className={cn(LABEL, "mt-1")}>
        {copy.NAME_LABEL}
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

      <label htmlFor={dateId} className={cn(LABEL, "mt-3")}>
        {copy.FLIGHT_DATE_LABEL}
        <Optional />
      </label>
      <input
        id={dateId}
        type="date"
        min={today ?? undefined}
        max={max}
        value={flightDate}
        onChange={(e) => setFlightDate(e.target.value)}
        aria-describedby={dateHintId}
        aria-invalid={attempted && !dateOk ? true : undefined}
        className={cn(FIELD, "appearance-none")}
      />
      <p id={dateHintId} className="mt-1.5 min-h-4 text-[13px] leading-snug text-ink-soft" aria-live="polite">
        {attempted && !dateOk ? copy.FLIGHT_DATE_HINT : ""}
      </p>

      <label
        htmlFor={interviewId}
        className="mt-1 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl px-1 py-2 text-[14px] leading-snug text-ink-700 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-breeze-500"
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

      <Actions>
        <button type="submit" className={PRIMARY}>
          {copy.JOIN_BUTTON}
        </button>
        <button type="button" onClick={onSkip} className={cn(QUIET, "justify-center sm:justify-start")}>
          {copy.NOT_NOW}
        </button>
      </Actions>
    </form>
  );
}

function Items({ titleId, placement, onDone }: { titleId: string; placement: OfferPlacement; onDone: () => void }) {
  const [items, setItems] = useState<PackItem[]>([]);
  const [worthIt, setWorthIt] = useState("");

  // "None of these" clears the others, and any other clears it.
  const choose = (next: PackItem[]) => {
    const added = next.find((k) => !items.includes(k));
    if (added === "none") setItems(["none"]);
    else setItems(next.filter((k) => k !== "none"));
  };

  const send = () => {
    const text = worthIt.trim();
    if (items.length) trackPack("d_addon_items", placement, { items: items.join(",") });
    if (items.length || text) savePackRow({ kind: "addon_join", placement, answers: { items, worthIt: text } });
    if (text) noteOpenAnswer();
    onDone();
  };

  return (
    <>
      <p className="text-[14px] font-bold leading-snug text-ink-soft">{copy.ITEMS_DONE}</p>
      <div className="mt-3">
        <StepTitle id={titleId}>{copy.ITEMS_QUESTION}</StepTitle>
      </div>
      <ChoiceGroup
        legend={<span className="sr-only">{copy.ITEMS_QUESTION}</span>}
        help={copy.ITEMS_HELP}
        multiple
        options={(["walkthrough", "forecast_alerts", "landed_text", "none"] as const).map((key) => ({ key, label: copy.ITEM_LABELS[key] }))}
        value={items}
        onChange={choose}
        className="mt-1"
      />
      <TextAnswer label={copy.WORTH_IT_LABEL} value={worthIt} onChange={setWorthIt} className="mt-4" />
      <Actions>
        <button type="button" onClick={send} className={PRIMARY}>
          {copy.SEND}
        </button>
        <button type="button" onClick={onDone} className={cn(QUIET, "justify-center sm:justify-start")}>
          {copy.SKIP}
        </button>
      </Actions>
    </>
  );
}

function Dismiss({
  titleId,
  reason,
  text,
  onReason,
  onText,
  onDone,
}: {
  titleId: string;
  reason: DismissReason | null;
  text: string;
  onReason: (r: DismissReason | null) => void;
  onText: (t: string) => void;
  onDone: () => void;
}) {
  return (
    <>
      <StepTitle id={titleId}>{copy.DISMISS_TITLE}</StepTitle>
      <ChoiceGroup
        legend={<span className="text-[15px] font-normal text-ink-soft">{copy.DISMISS_BODY}</span>}
        options={copy.DISMISS_REASONS}
        value={reason ? [reason] : []}
        onChange={(next) => onReason(next[0] ?? null)}
        className="mt-1"
      />
      <TextAnswer label={copy.ANYTHING_ELSE_LABEL} value={text} onChange={onText} className="mt-4" />
      <Actions>
        <button type="button" onClick={onDone} className={PRIMARY}>
          {copy.DONE}
        </button>
      </Actions>
    </>
  );
}

/** "$4.50", "4,5", " 12 " → dollars to the cent; "" → null; anything else (or outside $0–$500) → NaN. */
function parseDollars(raw: string): number | null {
  const cleaned = raw.trim().replace(/^\$\s*/, "").replace(/\s+/g, "");
  if (cleaned === "") return null;
  const normal = cleaned.includes(".") ? cleaned : cleaned.replace(",", ".");
  if (!/^\d+(\.\d*)?$|^\.\d+$/.test(normal)) return Number.NaN;
  const n = Number(normal);
  if (!Number.isFinite(n) || n < 0 || n > 500) return Number.NaN;
  return Math.round(n * 100) / 100;
}

type PriceKey = (typeof copy.PRICE_QUESTIONS)[number]["key"];

function Pricing({ titleId, placement, onDone }: { titleId: string; placement: OfferPlacement; onDone: () => void }) {
  const baseId = useId();
  const [values, setValues] = useState<Record<PriceKey, string>>({ tooCheap: "", bargain: "", gettingExpensive: "", tooExpensive: "" });
  const [plan, setPlan] = useState<PlanChoice | null>(null);
  const [attempted, setAttempted] = useState(false);
  const parsed = Object.fromEntries(copy.PRICE_QUESTIONS.map((q) => [q.key, parseDollars(values[q.key])])) as Record<PriceKey, number | null>;
  const bad = copy.PRICE_QUESTIONS.filter((q) => Number.isNaN(parsed[q.key])).map((q) => q.key);

  const send = () => {
    if (bad.length) {
      setAttempted(true);
      document.getElementById(`${baseId}-${bad[0]}`)?.focus();
      return;
    }
    const answered = copy.PRICE_QUESTIONS.filter((q) => parsed[q.key] !== null).length + (plan ? 1 : 0);
    trackPack("d_pricing_answered", placement, { questions_answered: answered });
    if (answered > 0) {
      savePackRow({
        kind: "pricing",
        placement,
        answers: {
          tooCheap: parsed.tooCheap,
          bargain: parsed.bargain,
          gettingExpensive: parsed.gettingExpensive,
          tooExpensive: parsed.tooExpensive,
          plan,
        },
      });
    }
    onDone();
  };

  return (
    <>
      <StepTitle id={titleId}>{copy.PRICING_TITLE}</StepTitle>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-soft">{copy.PRICING_BODY}</p>
      <fieldset className="mt-4">
        <legend className="text-[15px] font-bold leading-snug text-ink">{copy.PRICING_LEAD}</legend>
        <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {copy.PRICE_QUESTIONS.map((q) => {
            const id = `${baseId}-${q.key}`;
            const invalid = attempted && bad.includes(q.key);
            return (
              <div key={q.key} className="min-w-0">
                <label htmlFor={id} className={LABEL}>
                  {q.label}
                </label>
                <div className="relative">
                  <span aria-hidden className="pointer-events-none absolute left-4 top-1/2 mt-[3px] -translate-y-1/2 text-[16px] font-semibold text-ink-mute">
                    $
                  </span>
                  <input
                    id={id}
                    inputMode="decimal"
                    autoComplete="off"
                    enterKeyHint="next"
                    value={values[q.key]}
                    onChange={(e) => setValues((v) => ({ ...v, [q.key]: e.target.value }))}
                    aria-invalid={invalid ? true : undefined}
                    aria-describedby={invalid ? `${baseId}-hint` : undefined}
                    className={cn(FIELD, "pl-8 tabular-nums")}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p id={`${baseId}-hint`} className="mt-1.5 min-h-4 text-[13px] leading-snug text-ink-soft" aria-live="polite">
          {attempted && bad.length ? copy.PRICE_HINT : ""}
        </p>
      </fieldset>
      <ChoiceGroup
        legend={copy.PLAN_QUESTION}
        options={copy.PLAN_OPTIONS}
        value={plan ? [plan] : []}
        onChange={(next) => setPlan(next[0] ?? null)}
        className="mt-2"
      />
      <Actions>
        <button type="button" onClick={send} className={PRIMARY}>
          {copy.SEND}
        </button>
        <button type="button" onClick={onDone} className={cn(QUIET, "justify-center sm:justify-start")}>
          {copy.SKIP}
        </button>
      </Actions>
    </>
  );
}

function Thanks({ titleId, joined, onClose }: { titleId: string; joined: boolean; onClose: () => void }) {
  return (
    <>
    <div className="flex items-start gap-3" role="status">
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-sky text-ink ring-2 ring-ink [&_svg]:size-5">
        <Sparkles />
      </span>
      <div className="min-w-0">
        <StepTitle id={titleId}>{copy.THANKS_TITLE}</StepTitle>
        <p className="mt-0.5 text-[15px] leading-relaxed text-ink-soft">{joined ? copy.THANKS_JOINED : copy.THANKS_OTHER}</p>
      </div>
    </div>
    <Actions>
      <button type="button" onClick={onClose} className={PRIMARY}>
        {copy.CLOSE}
      </button>
    </Actions>
    </>
  );
}
