"use client";

import { useSyncExternalStore } from "react";
import type { DFeedback, DFeedbackPlacement, OfferPlacement } from "@preflight/shared/types";
import { track, type EventProps } from "@/lib/analytics";
import { saveDFeedback } from "@/lib/storage";
import { isTestMode } from "@/lib/testMode";
import { armProps, currentArm } from "./priceArm";

/*
 * Version D's Flight Day Pack test (docs/FLIGHT_DAY_PACK.md): the browser state behind the offer
 * card, the general feedback link and their events and rows.
 *
 *   sessionStorage  pfc.d.fdp.v1      this tab's session: which placement showed the card (and
 *                                     where), which placements were seen, whether the offer is
 *                                     gone for the session (after "No thanks" or a join), whether
 *                                     an open question was answered, the general feedback sent
 *                   pfc.d.session.v1  version D's per-tab session id (D had none before)
 *                   pfc.d.utm.v1      the session's first-touch utm_source / medium / campaign
 *   localStorage    pfc.d.pricing.v1  the pricing questions were asked in this browser (once per visitor)
 *
 * Read during render only through the hooks here (null / "nothing yet" during server render and
 * hydration); write from handlers and effects. Nothing here reads a flight, a rating or a price
 * beyond the arm: the card is the same for every flight.
 */

const SESSION_STATE_KEY = "pfc.d.fdp.v1";
const SESSION_ID_KEY = "pfc.d.session.v1";
const UTM_KEY = "pfc.d.utm.v1";
const PRICING_KEY = "pfc.d.pricing.v1";

/** Longest campaign tag kept, as the tools' links cut them. */
const MAX_UTM = 200;

export interface PackSession {
  /** Placement → the page context it showed on ("flight:JFK.LAX.2026-11-26.DL1423", "compare", "results:JFK.LAX.2026-11-26"). */
  shown: Partial<Record<OfferPlacement, string>>;
  /** Placements whose card was on screen (d_addon_view sent). */
  viewed: Partial<Record<OfferPlacement, true>>;
  /** "No thanks" or a join: the offer is gone for the rest of the session. */
  closed: boolean;
  /** An open text question in the offer's steps was answered: the general feedback link hides. */
  openAnswered: boolean;
  /** The general feedback was sent: its link hides too. */
  feedbackSent: boolean;
}

const EMPTY: PackSession = Object.freeze({ shown: {}, viewed: {}, closed: false, openAnswered: false, feedbackSent: false }) as PackSession;

const listeners = new Set<() => void>();
let memory: string | null = null;
let snapshot: { raw: string | null; value: PackSession } = { raw: null, value: EMPTY };

function readRaw(): string | null {
  try {
    return window.sessionStorage.getItem(SESSION_STATE_KEY) ?? memory;
  } catch {
    return memory;
  }
}

function parse(raw: string | null): PackSession {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as Partial<PackSession> | null;
    if (!v || typeof v !== "object") return EMPTY;
    const strings = (o: unknown) =>
      Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([k, x]) => (k === "after_pick" || k === "results") && typeof x === "string"));
    const trues = (o: unknown) =>
      Object.fromEntries(Object.entries(o && typeof o === "object" ? o : {}).filter(([k, x]) => (k === "after_pick" || k === "results") && x === true));
    return {
      shown: strings(v.shown),
      viewed: trues(v.viewed),
      closed: v.closed === true,
      openAnswered: v.openAnswered === true,
      feedbackSent: v.feedbackSent === true,
    };
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): PackSession {
  const raw = readRaw();
  if (raw !== snapshot.raw) snapshot = { raw, value: parse(raw) };
  return snapshot.value;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function update(change: (s: PackSession) => PackSession): void {
  const next = JSON.stringify(change(getSnapshot()));
  memory = next;
  try {
    window.sessionStorage.setItem(SESSION_STATE_KEY, next);
  } catch {
    // Storage blocked: the in-memory copy holds for this page.
  }
  for (const l of listeners) l();
}

/** This tab's Flight Day Pack session; null during server render and hydration. */
export function usePackSession(): PackSession | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}

/** The pick that opened the after_pick dialog on this page load (in memory: a reload never reopens it). */
let pickedNow: { context: string; button: HTMLElement | null } | null = null;

/**
 * "I'd pick this flight" was pressed to pick (not to withdraw) on a flight page or the compare page:
 * the after_pick dialog is claimed for that page and opens now, unless the offer is gone for the
 * session or has already been shown on another page. Called from ChooseButton with the button, which
 * gets the focus back when the dialog closes; it reads nothing about the flight beyond which page it is on.
 */
export function notePick(context: string, button: HTMLElement | null = null): void {
  const s = getSnapshot();
  if (s.closed || (s.shown.after_pick && s.shown.after_pick !== context)) return;
  pickedNow = { context, button };
  update((p) => ({ ...p, shown: { ...p.shown, after_pick: context } }));
}

/** Whether the after_pick dialog was opened by a pick on this page load, for this page. */
export function pickedOnThisLoad(context: string): boolean {
  return pickedNow?.context === context;
}

/** The pick button to give the focus back to (null when it is gone). */
export function pickButton(): HTMLElement | null {
  const el = pickedNow?.button ?? null;
  return el && el.isConnected ? el : null;
}

// ── Which offer surface is open (the waitlist dialog never stacks on one) ───

let surfacesOpen = 0;

/** A pop-in or dialog of the offer opened (true) or closed (false). */
export function noteSurface(open: boolean): void {
  surfacesOpen = Math.max(0, surfacesOpen + (open ? 1 : -1));
}

/** Whether an offer pop-in or dialog is on screen or mid-flow now. */
export function offerSurfaceOpen(): boolean {
  return surfacesOpen > 0;
}

/** The results card shows on this page (once per session, and never after the after_pick card). */
export function claimResults(context: string): void {
  const s = getSnapshot();
  if (s.shown.results) return;
  update((p) => ({ ...p, shown: { ...p.shown, results: context } }));
}

/** Whether the results card may show for this page's context (pure: from the session given). */
export function resultsCardAllowed(s: PackSession, context: string): boolean {
  if (s.shown.results) return s.shown.results === context && !s.closed;
  return !s.closed && !s.shown.after_pick;
}

export function markViewed(placement: OfferPlacement): boolean {
  if (getSnapshot().viewed[placement]) return false;
  update((p) => ({ ...p, viewed: { ...p.viewed, [placement]: true } }));
  return true;
}

export function closeOffer(): void {
  if (!getSnapshot().closed) update((p) => ({ ...p, closed: true }));
}

export function noteOpenAnswer(): void {
  if (!getSnapshot().openAnswered) update((p) => ({ ...p, openAnswered: true }));
}

export function noteFeedbackSent(): void {
  if (!getSnapshot().feedbackSent) update((p) => ({ ...p, feedbackSent: true }));
}

// ── once per visitor: the pricing questions ─────────────────────────────────

let pricingMemory = false;

function readPricingAsked(): boolean {
  try {
    return Boolean(window.localStorage.getItem(PRICING_KEY)) || pricingMemory;
  } catch {
    return pricingMemory;
  }
}

/** Whether this browser has been asked the pricing questions (answered or skipped). Call in handlers. */
export function pricingAsked(): boolean {
  return readPricingAsked();
}

export function markPricingAsked(): void {
  pricingMemory = true;
  try {
    window.localStorage.setItem(PRICING_KEY, new Date().toISOString());
  } catch {
    // Storage blocked: asked for this page only.
  }
}

// ── session id and campaign tags ────────────────────────────────────────────

let idMemory: string | null = null;

/** A v4 UUID (the shape the API expects); old Safari without randomUUID gets it from getRandomValues. */
export function newUuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Version D's per-tab session id, created on the first call (sessionStorage). */
export function dSessionId(): string {
  try {
    const stored = window.sessionStorage.getItem(SESSION_ID_KEY);
    if (stored) return stored;
  } catch {
    if (idMemory) return idMemory;
  }
  if (idMemory) return idMemory;
  const id = newUuid();
  idMemory = id;
  try {
    window.sessionStorage.setItem(SESSION_ID_KEY, id);
  } catch {
    // Storage blocked: one id for this page.
  }
  return id;
}

export interface Utms {
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
}

const NO_UTMS: Utms = { utmSource: "", utmMedium: "", utmCampaign: "" };
let utmMemory: Utms | null = null;

function tag(params: URLSearchParams, name: string): string {
  return (params.get(name) ?? "").trim().slice(0, MAX_UTM);
}

/**
 * On the first version D page of a tab's session: keep the link's utm_source, utm_medium and
 * utm_campaign (first touch; an untagged first page keeps "none" for the session). Later pages
 * never overwrite them. From the layout, in an effect.
 */
export function captureUtms(): void {
  try {
    if (window.sessionStorage.getItem(UTM_KEY) !== null) return;
  } catch {
    if (utmMemory) return;
  }
  if (utmMemory) return;
  const params = new URLSearchParams(window.location.search);
  const utms: Utms = { utmSource: tag(params, "utm_source"), utmMedium: tag(params, "utm_medium"), utmCampaign: tag(params, "utm_campaign") };
  utmMemory = utms;
  try {
    window.sessionStorage.setItem(UTM_KEY, JSON.stringify(utms));
  } catch {
    // Storage blocked: kept for this page.
  }
}

/** The session's first-touch campaign tags ("" for each one absent). */
export function sessionUtms(): Utms {
  try {
    const raw = window.sessionStorage.getItem(UTM_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Partial<Utms>;
      const s = (x: unknown) => (typeof x === "string" ? x.slice(0, MAX_UTM) : "");
      return { utmSource: s(v.utmSource), utmMedium: s(v.utmMedium), utmCampaign: s(v.utmCampaign) };
    }
  } catch {
    // Fall through to memory.
  }
  return utmMemory ?? NO_UTMS;
}

// ── events and rows ─────────────────────────────────────────────────────────

/** Team test: the same rule as every /d event (lib/analytics.ts): the browser's test mode, or ?test=1 now. */
export function isTestRun(): boolean {
  if (isTestMode()) return true;
  try {
    return new URLSearchParams(window.location.search).get("test") === "1";
  } catch {
    return false;
  }
}

/**
 * One of the test's events, with the properties every one of them carries: price_arm (and
 * arm_forced when forced), placement, variant "D" and is_test. `extra` is only ever a category
 * key, a count or a list of item keys: never typed text, an email, a name, a dollar amount, the
 * plan answer or a date.
 */
export function trackPack(
  event:
    | "d_addon_view"
    | "d_addon_click"
    | "d_addon_waitlist"
    | "d_addon_dismiss"
    | "d_addon_items"
    | "d_pricing_answered"
    | "d_feedback_open"
    | "d_feedback_submitted",
  placement: DFeedbackPlacement,
  extra: EventProps = {},
): void {
  track(event, { ...extra, placement, variant: "D", is_test: isTestRun(), ...armProps() });
}

type RowInput = Pick<DFeedback, "kind" | "answers"> & { placement: DFeedbackPlacement };

/** Save one d_feedback row (with the session id, the arm, the campaign tags and the test flag). Never throws. */
export function savePackRow(input: RowInput): void {
  const { arm, forced } = currentArm();
  const row = {
    schemaVersion: 1,
    id: newUuid(),
    createdAt: new Date().toISOString(),
    sessionId: dSessionId(),
    priceArm: arm,
    armForced: forced,
    ...sessionUtms(),
    isTest: isTestRun(),
    ...input,
  } as DFeedback;
  void saveDFeedback(row);
}
