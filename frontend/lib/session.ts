import type {
  DashboardMetrics,
  DeviceInfo,
  DeviceType,
  FlightInput,
  FlightSummary,
  PostSurvey,
  PreSurvey,
  Ratings,
  SessionRecord,
  Step,
  Variant,
  VariantSource,
  WouldSwitch,
} from "@preflight/shared/types";

/*
 * Session plumbing for the participant flow — client only.
 *
 * The whole flow lives in one FlowState: which screen the participant is on,
 * the session identity (variant, device…) and every answer so far. It is
 * persisted to sessionStorage after every change so a reload resumes the same
 * session at the same screen, and flattened into a SessionRecord for saving.
 *
 * Nothing here reads the clock or randomness at import time: `createSession`
 * and the reducer are called from event handlers only.
 */

export const FLOW_STORAGE_KEY = "pfc.flow.v1";

// ── Screens ─────────────────────────────────────────────────────────────────

/** Finer-grained than SessionRecord.step: every screen the participant sees. */
export type FlowScreen =
  | "welcome"
  | "pre"
  | "preDetails"
  | "setup"
  | "preparing"
  | "dashboard"
  | "post"
  | "postParts"
  | "postHabits"
  | "debrief";

const SCREEN_ORDER: readonly FlowScreen[] = [
  "welcome",
  "pre",
  "preDetails",
  "setup",
  "preparing",
  "dashboard",
  "post",
  "postParts",
  "postHabits",
  "debrief",
];

export function screenIndex(screen: FlowScreen): number {
  return SCREEN_ORDER.indexOf(screen);
}

/** Screens the browser Back button may move between (answers are kept). */
const BACKABLE: ReadonlySet<FlowScreen> = new Set(["welcome", "pre", "preDetails", "setup", "preparing"]);

/** Whether Back/Forward may move from `from` to `to`. Later screens stay put. */
export function canTraverse(from: FlowScreen, to: FlowScreen): boolean {
  return BACKABLE.has(from) && BACKABLE.has(to) && to !== "preparing";
}

/** Screens that get their own history entry (welcome is the page's initial entry). */
export function pushesHistory(screen: FlowScreen): boolean {
  return screen !== "welcome";
}

export function stepForScreen(screen: FlowScreen): Step {
  switch (screen) {
    case "welcome":
      return "welcome";
    case "pre":
    case "preDetails":
      return "pre";
    case "setup":
    case "preparing":
      return "setup";
    case "dashboard":
      return "dashboard";
    case "post":
    case "postParts":
    case "postHabits":
      return "post";
    case "debrief":
      return "debrief";
  }
}

/** Stage of the slim progress indicator: 1 before · 2 your flight · 3 briefing · 4 after. */
export const PROGRESS_STAGES = ["Before", "Your flight", "Briefing", "After"] as const;

export function stageForScreen(screen: FlowScreen): number | null {
  switch (screen) {
    case "pre":
    case "preDetails":
      return 1;
    case "setup":
    case "preparing":
      return 2;
    case "dashboard":
      return 3;
    case "post":
    case "postParts":
    case "postHabits":
      return 4;
    default:
      return null;
  }
}

// ── State ───────────────────────────────────────────────────────────────────

export interface SessionInfo {
  sessionId: string;
  createdAt: string;
  variant: Variant;
  variantSource: VariantSource;
  isTest: boolean;
  /** Label from ?p= on the study link (sanitized); "" if none. */
  participant: string;
  device: DeviceInfo;
}

export interface FlowState {
  version: 1;
  screen: FlowScreen;
  /** null until the participant consents. */
  session: SessionInfo | null;
  /** Increments on every save (sessionStorage persistence doesn't count). */
  seq: number;
  updatedAt: string;
  completedAt: string | null;
  pre: PreSurvey;
  /** Unvalidated flight-setup form values, kept so Back/reload never lose them. */
  setupDraft: FlightInput | null;
  /** Validated + normalized input the flight was generated from. */
  flightInput: FlightInput | null;
  flight: FlightSummary | null;
  dashboard: DashboardMetrics | null;
  post: PostSurvey;
  email: string;
  emailSent: boolean;
}

export function emptyPre(): PreSurvey {
  return {
    anxiety: null,
    control: null,
    predictability: null,
    routeOrigin: "",
    routeDestination: "",
    timeframe: null,
    flightsPerYear: null,
  };
}

export function emptyPost(): PostSurvey {
  return {
    anxiety: null,
    control: null,
    predictability: null,
    feltBetter: [],
    feltWorse: [],
    feltWorseText: "",
    checkFrequency: null,
    wouldReplace: [],
    wouldReplaceText: "",
    stillScaredOf: "",
    wouldSwitch: null,
  };
}

export function initialFlowState(): FlowState {
  return {
    version: 1,
    screen: "welcome",
    session: null,
    seq: 0,
    updatedAt: "",
    completedAt: null,
    pre: emptyPre(),
    setupDraft: null,
    flightInput: null,
    flight: null,
    dashboard: null,
    post: emptyPost(),
    email: "",
    emailSent: false,
  };
}

export function ratingsComplete(r: Ratings): boolean {
  return r.anxiety !== null && r.control !== null && r.predictability !== null;
}

// ── Actions ─────────────────────────────────────────────────────────────────

export type FlowAction =
  | { type: "consent"; session: SessionInfo }
  | { type: "goto"; screen: FlowScreen }
  | { type: "pre"; patch: Partial<PreSurvey> }
  | { type: "preDone" }
  | { type: "preDetailsDone" }
  | { type: "setupDraft"; draft: FlightInput }
  | { type: "setupDone"; input: FlightInput }
  | { type: "flightReady"; flight: FlightSummary }
  | { type: "dashboardMetrics"; metrics: DashboardMetrics }
  | { type: "dashboardDone"; metrics: DashboardMetrics }
  | { type: "post"; patch: Partial<PostSurvey> }
  | { type: "postDone" }
  | { type: "postPartsDone" }
  | { type: "postHabitsDone"; completedAt: string }
  | { type: "email"; email: string }
  | { type: "touch" };

export function reduceFlow(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "consent":
      return { ...state, session: state.session ?? action.session, screen: "pre" };
    case "goto":
      // Only welcome can be shown without a session (history entries may predate a reset).
      if (!state.session && action.screen !== "welcome") return state;
      return state.screen === action.screen ? state : { ...state, screen: action.screen };
    case "pre":
      return { ...state, pre: { ...state.pre, ...action.patch } };
    case "preDone":
      return ratingsComplete(state.pre) ? { ...state, screen: "preDetails" } : state;
    case "preDetailsDone":
      return { ...state, screen: "setup" };
    case "setupDraft":
      return { ...state, setupDraft: action.draft };
    case "setupDone":
      return {
        ...state,
        setupDraft: action.input,
        flightInput: action.input,
        // A different flight means a fresh dashboard session.
        flight: null,
        dashboard: sameInput(state.flightInput, action.input) ? state.dashboard : null,
        screen: "preparing",
      };
    case "flightReady":
      return { ...state, flight: action.flight, screen: "dashboard" };
    case "dashboardMetrics":
      return { ...state, dashboard: action.metrics };
    case "dashboardDone":
      return { ...state, dashboard: action.metrics, screen: "post" };
    case "post":
      return { ...state, post: { ...state.post, ...action.patch } };
    case "postDone":
      return ratingsComplete(state.post) ? { ...state, screen: "postParts" } : state;
    case "postPartsDone":
      return { ...state, screen: "postHabits" };
    case "postHabitsDone":
      return { ...state, completedAt: state.completedAt ?? action.completedAt, screen: "debrief" };
    case "email":
      return { ...state, email: action.email, emailSent: true };
    case "touch":
      return state;
  }
}

function sameInput(a: FlightInput | null, b: FlightInput | null): boolean {
  return !!a && !!b && a.origin === b.origin && a.destination === b.destination && a.date === b.date;
}

/** Stamp a save: bump seq and updatedAt. Call from the save path only. */
export function markSaved(state: FlowState, now: string): FlowState {
  return { ...state, seq: state.seq + 1, updatedAt: now };
}

// ── Record ──────────────────────────────────────────────────────────────────

/** Flatten the flow state into the record the backend stores. null before consent. */
export function buildRecord(state: FlowState): SessionRecord | null {
  const s = state.session;
  if (!s) return null;
  return {
    schemaVersion: 1,
    sessionId: s.sessionId,
    seq: state.seq,
    createdAt: s.createdAt,
    updatedAt: state.updatedAt || s.createdAt,
    completedAt: state.completedAt,
    step: stepForScreen(state.screen),
    variant: s.variant,
    variantSource: s.variantSource,
    isTest: s.isTest,
    participant: s.participant,
    device: s.device,
    pre: state.pre,
    flightInput: state.flightInput,
    flight: state.flight,
    dashboard: state.dashboard,
    // The switch question is variant A only; B always stores null.
    post: { ...state.post, wouldSwitch: s.variant === "A" ? normalizeWouldSwitch(state.post.wouldSwitch) : null },
    email: state.email,
  };
}

const WOULD_SWITCH: ReadonlySet<string> = new Set<WouldSwitch>(["yes", "no", "not_sure", "didnt_look"]);

function normalizeWouldSwitch(value: unknown): WouldSwitch | null {
  return typeof value === "string" && WOULD_SWITCH.has(value) ? (value as WouldSwitch) : null;
}

// ── Persistence (sessionStorage) ────────────────────────────────────────────

const SCREENS: ReadonlySet<string> = new Set(SCREEN_ORDER);

export function loadFlowState(): FlowState | null {
  try {
    const raw = window.sessionStorage.getItem(FLOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<FlowState>;
    if (candidate.version !== 1 || typeof candidate.screen !== "string" || !SCREENS.has(candidate.screen)) {
      return null;
    }
    const base = initialFlowState();
    const state: FlowState = {
      ...base,
      ...candidate,
      version: 1,
      pre: { ...base.pre, ...(candidate.pre ?? {}) },
      post: { ...base.post, ...(candidate.post ?? {}) },
      // Sessions saved before the ?p= label existed have no participant field.
      session: isSessionInfo(candidate.session)
        ? { ...candidate.session, participant: sanitizeParticipant(candidate.session.participant) }
        : null,
    };
    state.post.wouldSwitch = normalizeWouldSwitch(state.post.wouldSwitch);
    // Guard against a saved screen the data can't support.
    if (!state.session && state.screen !== "welcome") return null;
    if (state.completedAt) state.screen = "debrief";
    else if (state.screen === "debrief") state.screen = "postHabits";
    if ((state.screen === "preparing" || state.screen === "dashboard") && !state.flightInput) state.screen = "setup";
    return state;
  } catch {
    return null;
  }
}

function isSessionInfo(value: unknown): value is SessionInfo {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<SessionInfo>;
  return (
    typeof s.sessionId === "string" &&
    s.sessionId.length > 0 &&
    typeof s.createdAt === "string" &&
    (s.variant === "A" || s.variant === "B") &&
    (s.variantSource === "random" || s.variantSource === "forced") &&
    typeof s.isTest === "boolean" &&
    !!s.device &&
    typeof s.device === "object"
  );
}

export function saveFlowState(state: FlowState): void {
  try {
    window.sessionStorage.setItem(FLOW_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage unavailable: the flow still works, it just won't survive a reload.
  }
}

export function clearFlowState(): void {
  try {
    window.sessionStorage.removeItem(FLOW_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// ── Session creation (event handlers only) ──────────────────────────────────

/** ?v=A|B (case-insensitive) forces a variant; otherwise a 50/50 draw. */
export function pickVariant(forced: string | null | undefined): { variant: Variant; source: VariantSource } {
  const v = forced?.trim().toUpperCase();
  if (v === "A" || v === "B") return { variant: v, source: "forced" };
  return { variant: randomBit() ? "B" : "A", source: "random" };
}

function randomBit(): number {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      return crypto.getRandomValues(new Uint8Array(1))[0] & 1;
    }
  } catch {
    // fall through
  }
  return Math.random() < 0.5 ? 0 : 1;
}

/** UUID v4 — crypto.randomUUID where available (needs a secure context), otherwise built from random bytes. */
export function newSessionId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // fall through
  }
  const bytes = new Uint8Array(16);
  try {
    crypto.getRandomValues(bytes);
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Best-effort device classification from the user agent, pointer type and viewport. */
export function detectDevice(): DeviceInfo {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const width = typeof window !== "undefined" ? window.innerWidth : 0;
  const height = typeof window !== "undefined" ? window.innerHeight : 0;
  const maxTouchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints || 0 : 0;
  const touch = maxTouchPoints > 0 || (typeof window !== "undefined" && "ontouchstart" in window);
  const coarse = safeMatchMedia("(pointer: coarse)");

  const tabletUA = /iPad|Tablet|PlayBook|Silk|Kindle/i.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
  const mobileUA = /iPhone|iPod|Windows Phone|Mobi/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua));

  let type: DeviceType;
  if (mobileUA && !tabletUA) type = "mobile";
  else if (tabletUA || (/Android/i.test(ua) && !mobileUA)) type = "tablet";
  else if (coarse && touch) type = Math.min(width, height) >= 600 ? "tablet" : "mobile";
  else type = "desktop";

  return { type, userAgent: ua.slice(0, 300), viewportW: width, viewportH: height, touch };
}

function safeMatchMedia(query: string): boolean {
  try {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

const PARTICIPANT_MAX = 40;

/**
 * ?p=<label> → the stored participant label: characters outside letters,
 * digits, space and `-_.@` are dropped, whitespace runs collapse to one space,
 * then trimmed to at most 40 characters. Anything else (absent, not a string) → "".
 */
export function sanitizeParticipant(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/[^\p{L}\p{N} \-_.@]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PARTICIPANT_MAX)
    .trim();
}

export function createSession(opts: {
  forcedVariant: string | null;
  isTest: boolean;
  participant?: string | null;
  now: Date;
}): SessionInfo {
  const { variant, source } = pickVariant(opts.forcedVariant);
  return {
    sessionId: newSessionId(),
    createdAt: opts.now.toISOString(),
    variant,
    variantSource: source,
    isTest: opts.isTest,
    participant: sanitizeParticipant(opts.participant),
    device: detectDevice(),
  };
}
