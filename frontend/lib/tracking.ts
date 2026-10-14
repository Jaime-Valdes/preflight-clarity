import { createContext, useContext } from "react";
import type { DashboardEvent, DashboardMetrics, SectionId, SectionStats } from "@preflight/shared/types";

/** Hard cap so a busy participant can't grow the record without bound. */
export const MAX_EVENTS = 300;

/**
 * Measures how a participant uses the dashboard: total and visible time,
 * which sections they expand and for how long, the alert toggle, scroll depth
 * and small interaction events.
 *
 * Time only accrues to `activeMs` and to open sections while the page is
 * visible, so a participant who switches apps doesn't inflate the numbers.
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

  constructor(sectionOrder: readonly SectionId[], initial?: DashboardMetrics | null) {
    this.sectionOrder = [...sectionOrder];
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
      for (const id of this.sectionOrder) {
        const prev = initial.sections[id];
        if (prev) this.sections[id] = { ...prev };
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
      if (this.resumed) this.pushEvent("dashboard_resumed");
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

  /** Record a section being expanded or collapsed. */
  setSectionOpen(id: SectionId, isOpen: boolean): void {
    if (this.finished) return;
    const stats = this.sections[id];
    if (!stats) return;
    this.flush();
    if (isOpen && !this.open.has(id)) {
      this.open.add(id);
      stats.opens += 1;
      if (stats.firstOpenAtMs === null) stats.firstOpenAtMs = this.elapsedMs();
      this.pushEvent("section_open", id);
    } else if (!isOpen && this.open.has(id)) {
      this.open.delete(id);
      this.pushEvent("section_close", id);
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

  /** Deepest scroll position reached, 0–100. */
  recordScroll(pct: number): void {
    if (Number.isFinite(pct)) this.maxScrollPct = Math.max(this.maxScrollPct, Math.min(100, Math.round(pct)));
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

  /** Accrue time since the last tick to active time and open sections. */
  private flush(): void {
    if (this.lastTick === null) return;
    const now = performance.now();
    const dt = Math.max(0, now - this.lastTick);
    this.lastTick = now;
    if (!this.visible) return;
    this.activeMs += dt;
    for (const id of this.open) {
      const stats = this.sections[id];
      if (stats) stats.openMs += dt;
    }
  }

  /** ms since the dashboard first started, including time before a reload. */
  private elapsedMs(): number {
    if (this.frozenTotalMs !== null) return this.frozenTotalMs;
    if (this.t0 === null) return Math.round(this.baseTotalMs);
    return Math.round(this.baseTotalMs + (performance.now() - this.t0));
  }

  private pushEvent(type: string, section?: SectionId, detail?: string): void {
    if (this.events.length >= MAX_EVENTS) return;
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
    };
  }
}

export const TrackerContext = createContext<DashboardTracker | null>(null);

/** Section components use this to log interactions. Null outside a dashboard. */
export function useTracker(): DashboardTracker | null {
  return useContext(TrackerContext);
}
