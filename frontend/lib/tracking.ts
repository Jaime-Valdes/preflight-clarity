import { createContext, useContext } from "react";
import type {
  DashboardEvent,
  DashboardMetrics,
  ExplorationMetrics,
  ExploredFlight,
  SectionId,
  SectionStats,
} from "@preflight/shared/types";

/** Most flights a participant can explore in one session. */
export const MAX_EXPLORED_FLIGHTS = 6;

/** Hard cap so a busy participant can't grow the record without bound. */
export const MAX_EVENTS = 300;

/** Compare pairs kept per session (the record keeps 50 too). */
const MAX_COMPARE_PAIRS = 50;

/**
 * Events that mark the shape of the timeline (opens/closes, visibility,
 * the alert toggle, resume/done, and which flight or overlay is on screen).
 * Once the log is full these evict the oldest detail event instead of being
 * dropped, so a very active participant still gets a complete timeline (only
 * a log of 300 lifecycle events can drop one).
 */
const LIFECYCLE: ReadonlySet<string> = new Set([
  "section_open",
  "section_close",
  "page_hidden",
  "page_visible",
  "alert_toggle",
  "dashboard_resumed",
  "dashboard_done",
  "flight_added",
  "flight_switched",
  "flight_shown",
  "compare_open",
  "compare_close",
  "whatif_opened",
  "whatif_close",
]);

/**
 * Measures how a participant uses the dashboard: total and visible time,
 * which sections they expand and for how long, the alert toggle, scroll depth
 * and small interaction events.
 *
 * Time only accrues to `activeMs` and to open sections while the page is
 * visible, so a participant who switches apps doesn't inflate the numbers.
 * With free exploration, visible time goes to exactly one place: the compare
 * view, the what-if sheet, or else the flight on screen (and its open
 * sections, which pause while either overlay covers them).
 *
 * Lifecycle (client only — uses `document` and `performance`):
 *   const [tracker] = useState(() => new DashboardTracker(order, resumed));
 *   useEffect(() => { tracker.start(); return () => tracker.pause(); }, [tracker]);
 *   …tracker.setSectionOpen(id, true) / tracker.event(…) / tracker.alertToggled(on)
 *   onDone(tracker.finish())
 *
 * start() and pause() are idempotent, so React StrictMode's double effects
 * are harmless.
 */
export class DashboardTracker {
  private readonly sectionOrder: SectionId[];
  private readonly sections: Partial<Record<SectionId, SectionStats>> = {};
  private readonly open = new Set<SectionId>();
  private events: DashboardEvent[] = [];
  private alert = { tapped: false, taps: 0, finalOn: false };
  private maxScrollPct = 0;
  /** Scroll share restored across a reload; a floor for later reports. */
  private restoredScrollPct = 0;
  private resumed = false;

  private startedAt: string | null = null;
  private endedAt: string | null = null;
  /** Time carried over from before a page reload. */
  private baseTotalMs = 0;
  private baseActiveMs = 0;
  private activeMs = 0;
  /** performance.now() when this page instance started measuring. */
  private t0: number | null = null;
  /** performance.now() of the last flush; null while not running. */
  private lastTick: number | null = null;
  private visible = true;
  private listening = false;
  private finished = false;
  /** Total time frozen at finish(). */
  private frozenTotalMs: number | null = null;
  /** Free exploration (variant A only); null when not enabled. */
  private exploration: ExplorationMetrics | null = null;
  private activeFlightId: string | null = null;
  private compareOpen = false;
  /** "idA|idB" on screen while the compare view is open. */
  private comparePair: string | null = null;
  private whatIfOpen = false;

  /**
   * @param exploration pass `{ reference }` to enable free exploration (variant A).
   *   On resume, the saved exploration state wins over `reference`.
   */
  constructor(
    sectionOrder: readonly SectionId[],
    initial?: DashboardMetrics | null,
    exploration?: { reference: ExploredFlight } | null,
  ) {
    this.sectionOrder = [...sectionOrder];
    if (exploration) {
      const saved = initial?.exploration;
      this.exploration = saved
        ? {
            ...saved,
            flights: saved.flights.map((f) => ({ ...f })),
            flightMs: { ...saved.flightMs },
            comparePairs: [...saved.comparePairs],
            whatIfMs: saved.whatIfMs ?? 0,
          }
        : {
            flights: [{ ...exploration.reference }],
            switches: 0,
            flightMs: {},
            compares: 0,
            compareMs: 0,
            comparePairs: [],
            whatIfMs: 0,
            alternativesOpened: 0,
            whatIfs: 0,
            endedOnFlightId: exploration.reference.id,
            preferredFlightId: null,
          };
      this.activeFlightId = this.exploration.endedOnFlightId;
    }
    for (const id of this.sectionOrder) {
      this.sections[id] = { opens: 0, openMs: 0, firstOpenAtMs: null };
    }
    if (initial) {
      this.resumed = true;
      this.startedAt = initial.startedAt;
      this.baseTotalMs = initial.totalMs;
      this.baseActiveMs = initial.activeMs;
      this.events = initial.events.slice(0, MAX_EVENTS);
      this.alert = { ...initial.alert };
      this.maxScrollPct = initial.maxScrollPct;
      this.restoredScrollPct = initial.maxScrollPct;
      for (const id of this.sectionOrder) {
        const prev = initial.sections[id];
        if (prev) this.sections[id] = { ...prev };
      }
      // Rebuild which sections were expanded when the metrics were last saved,
      // without pushing events or touching counters: the UI starts from them,
      // and the pre-reload section_open is matched by a later section_close.
      for (const e of this.events) {
        if (!e.section || !this.sections[e.section]) continue;
        if (e.type === "section_open") this.open.add(e.section);
        else if (e.type === "section_close") this.open.delete(e.section);
      }
    }
  }

  /** Begin (or resume) measuring. Call from an effect. */
  start(): void {
    if (this.finished) return;
    const now = performance.now();
    if (this.t0 === null) {
      this.t0 = now;
      this.startedAt ??= new Date().toISOString();
      if (this.resumed) {
        // An overlay that was open at the last checkpoint didn't survive the reload: close it in the log.
        if (this.lastOf("compare_open", "compare_close") === "compare_open") this.pushEvent("compare_close", "compare", "reload");
        if (this.lastOf("whatif_opened", "whatif_close") === "whatif_opened") this.pushEvent("whatif_close", undefined, "reload");
        this.pushEvent("dashboard_resumed");
      }
    }
    if (!this.listening) {
      document.addEventListener("visibilitychange", this.onVisibilityChange);
      this.listening = true;
    }
    this.visible = document.visibilityState === "visible";
    this.lastTick = now;
  }

  /** Stop listening (e.g. on unmount). Accumulated numbers are kept. */
  pause(): void {
    this.flush();
    this.lastTick = null;
    if (this.listening) {
      document.removeEventListener("visibilitychange", this.onVisibilityChange);
      this.listening = false;
    }
  }

  /**
   * Record a section being expanded or collapsed. `viaSwitch` = it only came
   * into or out of view because another explored flight was shown (each flight
   * keeps its own open sections): open time and the log follow what is on
   * screen (detail "switch"), but it doesn't count as an open.
   */
  setSectionOpen(id: SectionId, isOpen: boolean, viaSwitch = false): void {
    if (this.finished) return;
    const stats = this.sections[id];
    if (!stats) return;
    this.flush();
    const detail = viaSwitch ? "switch" : undefined;
    if (isOpen && !this.open.has(id)) {
      this.open.add(id);
      if (!viaSwitch) {
        stats.opens += 1;
        if (stats.firstOpenAtMs === null) stats.firstOpenAtMs = this.elapsedMs();
      }
      this.pushEvent("section_open", id, detail);
    } else if (!isOpen && this.open.has(id)) {
      this.open.delete(id);
      this.pushEvent("section_close", id, detail);
    }
  }

  /** Log a small interaction, e.g. event("seat_selected", "seat", "14C"). */
  event(type: string, section?: SectionId, detail?: string): void {
    if (this.finished) return;
    this.pushEvent(type, section, detail);
  }

  /** The non-functional "Notify me if the forecast changes" toggle. */
  alertToggled(on: boolean): void {
    if (this.finished) return;
    this.alert = { tapped: true, taps: this.alert.taps + 1, finalOn: on };
    this.pushEvent("alert_toggle", "alerts", on ? "on" : "off");
  }

  /** Current state of the alert toggle (restored across a reload), so the switch can start from it. */
  alertState(): { tapped: boolean; taps: number; finalOn: boolean } {
    return { ...this.alert };
  }

  /** Sections that were expanded when the metrics were last saved (restored across a reload), so the UI can start from them. */
  openSections(): SectionId[] {
    return this.sectionOrder.filter((id) => this.open.has(id));
  }

  /**
   * Free exploration: the sections expanded on each explored flight (restored
   * across a reload), so every flight in the strip comes back as it was left.
   * Rebuilt from the log: participant opens and closes (not the "switch" ones)
   * belong to the flight shown at the time (flight_switched / flight_shown);
   * the flight on screen uses openSections(). Empty without exploration.
   */
  openSectionsByFlight(): Record<string, SectionId[]> {
    const x = this.exploration;
    if (!x || x.flights.length === 0) return {};
    const byFlight = new Map<string, Set<SectionId>>();
    let shown = x.flights[0].id;
    for (const e of this.events) {
      if (e.type === "flight_switched" || e.type === "flight_shown") {
        if (e.detail) shown = e.detail;
        continue;
      }
      if ((e.type !== "section_open" && e.type !== "section_close") || e.detail === "switch") continue;
      if (!e.section || !this.sections[e.section]) continue;
      let set = byFlight.get(shown);
      if (!set) byFlight.set(shown, (set = new Set()));
      if (e.type === "section_open") set.add(e.section);
      else set.delete(e.section);
    }
    if (this.activeFlightId) byFlight.set(this.activeFlightId, this.open);
    const out: Record<string, SectionId[]> = {};
    for (const f of x.flights) {
      const set = byFlight.get(f.id);
      if (set) out[f.id] = this.sectionOrder.filter((id) => set.has(id));
    }
    return out;
  }

  /**
   * Deepest scroll position reached, as a share (0–100) of the scrollable
   * height of the page as last laid out; the caller re-bases it and reports
   * right before snapshot()/finish(). A value restored across a reload is a floor.
   */
  recordScroll(pct: number): void {
    if (this.finished || !Number.isFinite(pct)) return;
    this.maxScrollPct = Math.max(this.restoredScrollPct, Math.min(100, Math.max(0, Math.round(pct))));
  }

  // ── Free exploration ─────────────────────────────────────────────────────

  /** Exploration state (restored across a reload), so the UI can rebuild the flight strip. */
  explorationState(): ExplorationMetrics | null {
    return this.exploration ? cloneExploration(this.exploration) : null;
  }

  /** Id of the flight currently shown (null when exploration is off). */
  activeFlight(): string | null {
    return this.activeFlightId;
  }

  /**
   * Add an explored flight (what-if or opened alternative). Returns false when
   * it is already in the list or the list is full. Does not switch to it.
   */
  addFlight(flight: ExploredFlight): boolean {
    const x = this.exploration;
    if (this.finished || !x) return false;
    if (x.flights.some((f) => f.id === flight.id)) return false;
    if (x.flights.length >= MAX_EXPLORED_FLIGHTS) return false;
    x.flights.push({ ...flight, addedAtMs: this.elapsedMs() });
    if (flight.addedVia === "alternative") x.alternativesOpened += 1;
    else if (flight.addedVia !== "setup") x.whatIfs += 1;
    this.pushEvent("flight_added", undefined, `${flight.addedVia}:${flight.id}`);
    return true;
  }

  /**
   * Show another explored flight. `viaUser` = the participant tapped its chip
   * (counts as a switch, logs flight_switched); otherwise the dashboard showed
   * it after "Open this flight" or a what-if (logs flight_shown).
   */
  setActiveFlight(id: string, viaUser: boolean): void {
    const x = this.exploration;
    if (this.finished || !x || id === this.activeFlightId) return;
    if (!x.flights.some((f) => f.id === id)) return;
    this.flush();
    this.activeFlightId = id;
    x.endedOnFlightId = id;
    if (viaUser) x.switches += 1;
    this.pushEvent(viaUser ? "flight_switched" : "flight_shown", undefined, id);
  }

  /**
   * The compare view opened (counts a compare, logs compare_open) or, while it
   * is open, shows another pair (logs compare_pair). Each pair shown is
   * appended to comparePairs.
   */
  compareOpened(idA: string, idB: string): void {
    const x = this.exploration;
    if (this.finished || !x) return;
    const pair = `${idA}|${idB}`;
    if (this.compareOpen && pair === this.comparePair) return;
    this.flush();
    const fresh = !this.compareOpen;
    if (fresh) x.compares += 1;
    this.compareOpen = true;
    this.comparePair = pair;
    if (x.comparePairs.length < MAX_COMPARE_PAIRS) x.comparePairs.push(pair);
    this.pushEvent(fresh ? "compare_open" : "compare_pair", "compare", pair);
  }

  compareClosed(): void {
    if (this.finished || !this.exploration || !this.compareOpen) return;
    this.flush();
    this.compareOpen = false;
    this.comparePair = null;
    this.pushEvent("compare_close", "compare");
  }

  /** The "Try a different flight" sheet opened: its time goes to whatIfMs, not to the flight behind it. */
  whatIfOpened(): void {
    if (this.finished || !this.exploration || this.whatIfOpen) return;
    this.flush();
    this.whatIfOpen = true;
    this.pushEvent("whatif_opened");
  }

  whatIfClosed(): void {
    if (this.finished || !this.exploration || !this.whatIfOpen) return;
    this.flush();
    this.whatIfOpen = false;
    this.pushEvent("whatif_close");
  }

  /** "I'd prefer this one" (null = cleared). Recorded only. */
  preferFlight(id: string | null): void {
    const x = this.exploration;
    if (this.finished || !x) return;
    x.preferredFlightId = id;
    this.pushEvent("flight_preferred", "compare", id ?? "none");
  }

  /** Current numbers without stopping (for checkpoint saves). */
  snapshot(): DashboardMetrics {
    this.flush();
    return this.build();
  }

  /** Stop measuring for good and return the final numbers. */
  finish(): DashboardMetrics {
    if (!this.finished) {
      this.flush();
      for (const id of [...this.open]) this.setSectionOpen(id, false);
      if (this.compareOpen) this.compareClosed();
      if (this.whatIfOpen) this.whatIfClosed();
      this.pushEvent("dashboard_done");
      this.endedAt = new Date().toISOString();
      this.pause();
      this.frozenTotalMs = this.elapsedMs();
      this.finished = true;
    }
    return this.build();
  }

  // ── internals ────────────────────────────────────────────────────────────

  private onVisibilityChange = (): void => {
    this.flush();
    this.visible = document.visibilityState === "visible";
    this.pushEvent(this.visible ? "page_visible" : "page_hidden");
  };

  /**
   * Accrue time since the last tick to active time and to whatever is on
   * screen: an open overlay (compare view, what-if sheet) covers the
   * dashboard, so its time goes to the overlay and the open sections pause.
   */
  private flush(): void {
    if (this.lastTick === null) return;
    const now = performance.now();
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    if (!this.visible) return;
    this.activeMs += dt;
    const x = this.exploration;
    if (x && this.compareOpen) {
      x.compareMs += dt;
      return;
    }
    if (x && this.whatIfOpen) {
      x.whatIfMs = (x.whatIfMs ?? 0) + dt;
      return;
    }
    if (x && this.activeFlightId) x.flightMs[this.activeFlightId] = (x.flightMs[this.activeFlightId] ?? 0) + dt;
    for (const id of this.open) {
      const stats = this.sections[id];
      if (stats) stats.openMs += dt;
    }
  }

  /** Which of two event types was logged last (null if neither is in the log). */
  private lastOf(a: string, b: string): string | null {
    for (let i = this.events.length - 1; i >= 0; i--) {
      const type = this.events[i].type;
      if (type === a || type === b) return type;
    }
    return null;
  }

  /** ms since the dashboard first started, including time before a reload. */
  private elapsedMs(): number {
    if (this.frozenTotalMs !== null) return this.frozenTotalMs;
    if (this.t0 === null) return Math.round(this.baseTotalMs);
    return Math.round(this.baseTotalMs + (performance.now() - this.t0));
  }

  private pushEvent(type: string, section?: SectionId, detail?: string): void {
    if (this.events.length >= MAX_EVENTS) {
      if (!LIFECYCLE.has(type)) return;
      const i = this.events.findIndex((e) => !LIFECYCLE.has(e.type));
      if (i < 0) return;
      this.events.splice(i, 1);
    }
    const event: DashboardEvent = { t: this.elapsedMs(), type };
    if (section) event.section = section;
    if (detail) event.detail = detail.slice(0, 120);
    this.events.push(event);
  }

  private build(): DashboardMetrics {
    const sections: Partial<Record<SectionId, SectionStats>> = {};
    for (const id of this.sectionOrder) {
      const s = this.sections[id];
      if (s) sections[id] = { opens: s.opens, openMs: Math.round(s.openMs), firstOpenAtMs: s.firstOpenAtMs };
    }
    return {
      startedAt: this.startedAt ?? new Date().toISOString(),
      endedAt: this.endedAt,
      totalMs: this.elapsedMs(),
      activeMs: Math.round(this.baseActiveMs + this.activeMs),
      sectionOrder: [...this.sectionOrder],
      sections,
      alert: { ...this.alert },
      events: this.events.map((e) => ({ ...e })),
      maxScrollPct: this.maxScrollPct,
      resumed: this.resumed,
      exploration: this.exploration ? cloneExploration(this.exploration, true) : null,
    };
  }
}

function cloneExploration(x: ExplorationMetrics, round = false): ExplorationMetrics {
  const flightMs: Record<string, number> = {};
  for (const [id, ms] of Object.entries(x.flightMs)) flightMs[id] = round ? Math.round(ms) : ms;
  return {
    ...x,
    flights: x.flights.map((f) => ({ ...f, input: { ...f.input }, prefs: { ...f.prefs }, summary: { ...f.summary } })),
    flightMs,
    compareMs: round ? Math.round(x.compareMs) : x.compareMs,
    comparePairs: [...x.comparePairs],
    whatIfMs: round ? Math.round(x.whatIfMs ?? 0) : (x.whatIfMs ?? 0),
  };
}

export const TrackerContext = createContext<DashboardTracker | null>(null);

/** Section components use this to log interactions. Null outside a dashboard. */
export function useTracker(): DashboardTracker | null {
  return useContext(TrackerContext);
}
