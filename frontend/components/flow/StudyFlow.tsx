"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { setContext, track } from "@/lib/analytics";
import { daysBetween, formatShortDate, isISODate, toISODate } from "@preflight/shared/dates";
import { generateFlight, normalizeInput } from "@preflight/shared/fakeFlight";
import { previewDaysUntil, summarizeFlight } from "@preflight/shared/forecast";
import type { DashboardMetrics, Flight, FlightInput, FlightSummary, SignupPlacement } from "@preflight/shared/types";
import { Dashboard } from "@/components/dashboard/Dashboard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";
import { useHydrated, useQueryParam, useTodayISO } from "@/lib/hooks";
import {
  buildRecord,
  canTraverse,
  clearFlowState,
  createSession,
  initialFlowState,
  loadFlowState,
  markSaved,
  newSessionId,
  pushesHistory,
  reduceFlow,
  saveFlowState,
  type FlowAction,
  type FlowScreen,
  type FlowState,
  screenIndex,
} from "@/lib/session";
import { saveSession, saveSignup } from "@/lib/storage";
import { INTEREST_KEY } from "@/components/c/interest/signupState";
import { DebriefScreen, type DebriefSignup } from "./DebriefScreen";
import { EMPTY_SETUP, FlightSetupScreen } from "./FlightSetupScreen";
import { PostHabitsScreen } from "./PostHabitsScreen";
import { PostPartsScreen } from "./PostPartsScreen";
import { PreFlyingScreen } from "./PreFlyingScreen";
import { PreparingFlight } from "./PreparingFlight";
import { POST_QUESTIONS, PRE_QUESTIONS, RatingsScreen } from "./RatingsScreen";
import { Wordmark } from "./StepHeader";
import { WelcomeScreen } from "./WelcomeScreen";

/*
 * The participant flow: one client-side state machine.
 *
 *   welcome → pre-survey (ratings → about your flying) → your flight (setup) →
 *   preparing → dashboard → post-survey (ratings → parts → habits) → debrief
 *
 * State lives in `FlowState` (lib/session.ts), is persisted to sessionStorage
 * after every change (so a reload resumes), and is saved to the backend at
 * each step boundary, on dashboard checkpoints and, with a beacon, whenever
 * the page is hidden.
 */

interface HistoryEntry {
  pfcScreen?: FlowScreen;
}

const PERSIST_DEBOUNCE_MS = 150;

export function StudyFlow() {
  const hydrated = useHydrated();
  if (!hydrated) return <Splash />;
  return <StudyFlowClient />;
}

/** Server-rendered placeholder shown until the client can read its saved session. */
function Splash() {
  return (
    <Screen>
      <div className="flex flex-1 items-center justify-center pb-16">
        <Wordmark className="opacity-70" />
      </div>
    </Screen>
  );
}

type Generated = { ok: true; flight: Flight } | { ok: false };

function tryGenerate(input: FlightInput): Generated {
  try {
    return { ok: true, flight: generateFlight(normalizeInput(input)) };
  } catch {
    return { ok: false };
  }
}

/**
 * A tap within this window of a screen change is the second half of a double
 * tap on the previous screen's button (every step's primary button sits in the
 * same sticky-footer spot), not a decision about the new screen.
 */
const SCREEN_SETTLE_MS = 400;

/** "LAX → JFK · Sat, Oct 31" for the post-survey reminder chip; null if the reference flight is unknown. */
function referenceFlightLabel(input: FlightInput | null, summary: FlightSummary | null): string | null {
  if (!input && !summary) return null;
  const route = summary?.route || (input ? `${input.origin} → ${input.destination}` : "");
  const date = input && isISODate(input.date) ? formatShortDate(input.date) : "";
  return [route, date].filter(Boolean).join(" · ") || null;
}

function resolveInitialState(forcedVariant: string | null, isTest: boolean): FlowState {
  const saved = loadFlowState();
  if (!saved) return initialFlowState();
  if (!saved.session) return saved;
  // Team convenience: forcing a different variant, or opening ?test=1 over a real session, starts fresh.
  const forced = forcedVariant?.trim().toUpperCase();
  if ((forced === "A" || forced === "B") && saved.session.variant !== forced) return initialFlowState();
  if (isTest && !saved.session.isTest) return initialFlowState();
  return saved;
}

function StudyFlowClient() {
  const forcedVariant = useQueryParam("v");
  const isTest = useQueryParam("test") === "1";
  const participant = useQueryParam("p");
  const today = useTodayISO();

  const [state, setState] = useState<FlowState>(() => resolveInitialState(forcedVariant, isTest));
  const latest = useRef(state);
  const persistTimer = useRef<number | null>(null);
  const lastBeaconed = useRef<FlowState | null>(null);
  /** performance.now() of the last screen change (double-tap guard). */
  const screenChangedAt = useRef(0);
  /** Screen whose heading last received focus (none on initial mount / resume). */
  const focusedScreen = useRef<string | null>(null);
  /** Set while deliberately discarding the session, so the page-hide flush doesn't resurrect it. */
  const leaving = useRef(false);
  const [prepFailed, setPrepFailed] = useState(false);
  const [prepAttempt, setPrepAttempt] = useState(0);

  const persistNow = useCallback((next: FlowState) => {
    if (persistTimer.current !== null) {
      window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    saveFlowState(next);
  }, []);

  const persistSoon = useCallback(() => {
    if (persistTimer.current !== null) return;
    persistTimer.current = window.setTimeout(() => {
      persistTimer.current = null;
      saveFlowState(latest.current);
    }, PERSIST_DEBOUNCE_MS);
  }, []);

  /**
   * Apply an action. `save` also bumps seq and sends the record to the backend
   * (`beacon` for page-hide saves). Screen changes push a history entry unless
   * they came from the history itself.
   */
  const commit = useCallback(
    (action: FlowAction, opts: { save?: boolean; beacon?: boolean; fromHistory?: boolean } = {}) => {
      const prev = latest.current;
      let next = reduceFlow(prev, action);
      if (next.screen !== prev.screen) {
        const now = performance.now();
        // Swallow the second tap of a double tap (it would land on the new screen's button).
        if (!opts.fromHistory && now - screenChangedAt.current < SCREEN_SETTLE_MS) return;
        screenChangedAt.current = now;
      }
      if (opts.save && next.session) next = markSaved(next, new Date().toISOString());
      if (next === prev) return;
      latest.current = next;
      setState(next);

      if (next.screen !== prev.screen && !opts.fromHistory && pushesHistory(next.screen)) {
        window.history.pushState({ pfcScreen: next.screen } satisfies HistoryEntry, "");
      }

      if (opts.save || opts.beacon || next.screen !== prev.screen) persistNow(next);
      else persistSoon();

      if (opts.save) {
        const record = buildRecord(next);
        if (record) {
          if (opts.beacon) lastBeaconed.current = next;
          void saveSession(record, { beacon: opts.beacon });
        }
      }
    },
    [persistNow, persistSoon],
  );

  // Browser Back/Forward: move between the early screens, stay put later on.
  useEffect(() => {
    // Also pins the resolved initial state (a forced-variant reset must replace any stale copy).
    persistNow(latest.current);
    const entry = window.history.state as HistoryEntry | null;
    if (entry?.pfcScreen !== latest.current.screen) {
      window.history.replaceState({ pfcScreen: latest.current.screen } satisfies HistoryEntry, "");
    }
    const onPopState = (event: PopStateEvent) => {
      const target = (event.state as HistoryEntry | null)?.pfcScreen;
      const current = latest.current.screen;
      // Entries from an earlier session in this tab must not reach a survey screen without a session.
      const allowed = !!target && canTraverse(current, target) && (target === "welcome" || !!latest.current.session);
      if (allowed) {
        setPrepFailed(false);
        commit({ type: "goto", screen: target }, { fromHistory: true });
      } else {
        // Put the current screen back on top of the stack so the next Back lands here again.
        window.history.pushState({ pfcScreen: current } satisfies HistoryEntry, "");
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [commit, persistNow]);

  // Page hidden or unloading: flush the draft and beacon the record.
  useEffect(() => {
    const flush = () => {
      if (leaving.current) return;
      const current = latest.current;
      if (!current.session) {
        persistNow(current);
        return;
      }
      if (lastBeaconed.current === current) return;
      // On the dashboard its own checkpoint (page hidden / pagehide) saves a fresh snapshot.
      if (current.screen === "dashboard") return;
      commit({ type: "touch" }, { save: true, beacon: true });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
        persistTimer.current = null;
        saveFlowState(latest.current);
      }
    };
  }, [commit, persistNow]);

  // Screen change: move focus to the new heading so keyboard and screen-reader
  // users hear where they are (never on initial mount or a reload-resume).
  useEffect(() => {
    const view = `${state.screen}:${prepFailed}`;
    const changed = focusedScreen.current !== null && focusedScreen.current !== view;
    focusedScreen.current = view;
    if (!changed) return;
    document.querySelector<HTMLElement>("main [data-focus-start], main h1")?.focus({ preventScroll: true });
  }, [state.screen, prepFailed]);

  // Analytics (docs/ANALYTICS.md): one "study_step" per screen reached, with the session's
  // variant, test flag and participant label attached to every event from here on. No answers.
  const sessionId = state.session?.sessionId ?? null;
  const sessionVariant = state.session?.variant ?? null;
  const sessionIsTest = state.session?.isTest ?? false;
  const sessionParticipant = state.session?.participant ?? "";
  useEffect(() => {
    if (sessionId) setContext({ variant: sessionVariant, is_test: sessionIsTest, participant: sessionParticipant || null });
  }, [sessionId, sessionVariant, sessionIsTest, sessionParticipant]);
  useEffect(() => {
    track("study_step", { step: state.screen, step_index: screenIndex(state.screen) });
  }, [state.screen]);

  // ── step handlers ─────────────────────────────────────────────────────────

  const onAgree = useCallback(() => {
    const session = createSession({ forcedVariant, isTest, participant, now: new Date() });
    commit({ type: "consent", session });
  }, [commit, forcedVariant, isTest, participant]);

  const onPrepared = useCallback(() => {
    const current = latest.current;
    if (current.screen !== "preparing" || !current.flightInput) return;
    const generated = tryGenerate(current.flightInput);
    if (!generated.ok) {
      setPrepFailed(true);
      return;
    }
    // The record keeps the real distance; forecastMode is what the day-before preview showed.
    const days = daysBetween(toISODate(new Date()), current.flightInput.date);
    commit({ type: "flightReady", flight: summarizeFlight(generated.flight, days, previewDaysUntil(days)) }, { save: true });
  }, [commit]);

  const retryPrepare = useCallback(() => {
    setPrepFailed(false);
    setPrepAttempt((n) => n + 1);
  }, []);

  const changeFlight = useCallback(() => {
    setPrepFailed(false);
    commit({ type: "goto", screen: "setup" }, { fromHistory: true });
  }, [commit]);

  const onCheckpoint = useCallback(
    (metrics: DashboardMetrics) => {
      commit({ type: "dashboardMetrics", metrics }, { save: true, beacon: document.visibilityState === "hidden" });
    },
    [commit],
  );

  const onDashboardDone = useCallback(
    (metrics: DashboardMetrics) => {
      commit({ type: "dashboardDone", metrics }, { save: true });
      window.scrollTo({ top: 0 });
    },
    [commit],
  );

  /**
   * Product sign-up (docs/INTEREST.md), from the card at the bottom of the dashboard or the
   * debrief: the record keeps email/name/waitlist/interview, and the same details go to the
   * sign-ups list as one Signup row with where the form was. The browser is also marked as
   * signed up (`pfc.interest.v1`, shared with version C), so a participant who goes on to /c
   * sees "You're on the list" there instead of a second form.
   */
  const submitSignup = useCallback(
    (placement: SignupPlacement, { email, firstName, interview }: DebriefSignup) => {
      const current = latest.current.session;
      commit({ type: "email", email, firstName, waitlist: true, interview }, { save: true });
      if (!current) return;
      const createdAt = new Date().toISOString();
      void saveSignup({
        schemaVersion: 1,
        id: newSessionId(),
        createdAt,
        source: "study",
        placement,
        email,
        firstName,
        waitlist: true,
        interview,
        sessionId: current.sessionId,
        variant: current.variant,
        isTest: current.isTest,
        participant: current.participant,
        context: "",
        page: "/",
      });
      try {
        window.localStorage.setItem(INTEREST_KEY, JSON.stringify({ source: "study", at: createdAt }));
      } catch {
        // Storage blocked: the study's own "on the list" state still comes from the session record.
      }
      track("interest_signup", { source: "study", placement, interview });
    },
    [commit],
  );

  const onDebriefSignup = useCallback((s: DebriefSignup) => submitSignup("debrief", s), [submitSignup]);
  const onDashboardSignup = useCallback((s: DebriefSignup) => submitSignup("dashboard", s), [submitSignup]);

  const startOver = useCallback(() => {
    leaving.current = true;
    if (persistTimer.current !== null) {
      window.clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    clearFlowState();
    window.location.href = window.location.pathname + window.location.search;
  }, []);

  /** Generation failed after a reload: a fresh load picks up any fix; the session is kept. */
  const reloadPage = useCallback(() => {
    persistNow(latest.current);
    window.location.reload();
  }, [persistNow]);

  const generated = useMemo(() => (state.flightInput ? tryGenerate(state.flightInput) : null), [state.flightInput]);

  if (!today) return <Splash />;

  const { screen, session } = state;

  switch (screen) {
    case "welcome":
      return <WelcomeScreen onAgree={onAgree} />;

    case "pre":
      return (
        <RatingsScreen
          stage={1}
          eyebrow="Before you start"
          title="Three quick questions"
          questions={PRE_QUESTIONS}
          ratings={state.pre}
          onChange={(patch) => commit({ type: "pre", patch })}
          onContinue={() => {
            commit({ type: "preDone" }, { save: true });
            window.scrollTo({ top: 0 });
          }}
        />
      );

    case "preFlying":
      return (
        <PreFlyingScreen
          pre={state.pre}
          travelImpact={state.post.travelImpact ?? []}
          onChange={(patch) => commit({ type: "pre", patch })}
          onTravelImpactChange={(values) => commit({ type: "post", patch: { travelImpact: values } })}
          onContinue={() => {
            commit({ type: "preFlyingDone" }, { save: true });
            window.scrollTo({ top: 0 });
          }}
        />
      );

    case "setup":
      return (
        <FlightSetupScreen
          key={prepAttempt}
          today={today}
          draft={state.setupDraft ?? EMPTY_SETUP}
          onDraftChange={(next) => commit({ type: "setupDraft", draft: next })}
          onContinue={(input) => {
            setPrepFailed(false);
            commit({ type: "setupDone", input: normalizeInput(input) }, { save: true });
            window.scrollTo({ top: 0 });
          }}
        />
      );

    case "preparing":
      if (prepFailed) return <GenerationFailed onRetry={retryPrepare} onChangeFlight={changeFlight} />;
      return <PreparingFlight key={prepAttempt} onReady={onPrepared} />;

    case "dashboard": {
      if (!session || !generated || !generated.ok) {
        return <GenerationFailed onRetry={reloadPage} onChangeFlight={changeFlight} />;
      }
      return (
        <Dashboard
          key={generated.flight.id}
          flight={generated.flight}
          variant={session.variant}
          initialMetrics={state.dashboard}
          onCheckpoint={onCheckpoint}
          onDone={onDashboardDone}
          signup={{ signedUp: state.emailSent, onSubmit: onDashboardSignup }}
        />
      );
    }

    case "post":
      return (
        <RatingsScreen
          stage={4}
          eyebrow="After the briefing"
          title="Three questions, once more"
          sub="Answer for the same flight as before."
          flightLabel={referenceFlightLabel(state.flightInput, state.flight)}
          questions={POST_QUESTIONS}
          ratings={state.post}
          onChange={(patch) => commit({ type: "post", patch })}
          onContinue={() => {
            commit({ type: "postDone" }, { save: true });
            window.scrollTo({ top: 0 });
          }}
        />
      );

    case "postParts":
      return (
        <PostPartsScreen
          variant={session?.variant ?? "A"}
          post={state.post}
          onChange={(patch) => commit({ type: "post", patch })}
          onContinue={() => {
            commit({ type: "postPartsDone" }, { save: true });
            window.scrollTo({ top: 0 });
          }}
        />
      );

    case "postHabits":
      return (
        <PostHabitsScreen
          post={state.post}
          onChange={(patch) => commit({ type: "post", patch })}
          onFinish={() => {
            commit({ type: "postHabitsDone", completedAt: new Date().toISOString() }, { save: true });
            window.scrollTo({ top: 0 });
          }}
        />
      );

    case "debrief":
      return (
        <DebriefScreen
          signedUp={state.emailSent}
          onSignup={onDebriefSignup}
          isTest={session?.isTest ?? false}
          onStartOver={startOver}
        />
      );
  }
}

/** Calm fallback when the flight can't be generated. */
function GenerationFailed({ onRetry, onChangeFlight }: { onRetry: () => void; onChangeFlight: () => void }) {
  return (
    <Screen
      footer={
        <div className="flex flex-col gap-2">
          <Button block onClick={onRetry} icon={<RotateCcw aria-hidden className="size-4" />}>
            Try again
          </Button>
          <Button block variant="ghost" size="md" onClick={onChangeFlight}>
            Change the flight
          </Button>
        </div>
      }
    >
      <div className="flex flex-1 flex-col justify-center pb-16">
        <Card className="animate-fade-up">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-calm-700">One moment</p>
          <h1 tabIndex={-1} className="mt-1.5 text-[22px] font-bold leading-tight text-ink-900 outline-none">
            Your briefing didn&rsquo;t come together this time
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-700">
            Nothing you entered was lost. Give it another try, or pick a different flight.
          </p>
        </Card>
      </div>
    </Screen>
  );
}
