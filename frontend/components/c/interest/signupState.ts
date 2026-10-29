"use client";

import { useSyncExternalStore } from "react";
import type { SignupPlacement, SignupSource } from "@preflight/shared/types";
import { TOOLS, toolForPath } from "@/lib/tool";

/*
 * Version C sign-up state (docs/INTEREST.md): whether this browser has already
 * signed up (localStorage `pfc.interest.v1`, read with useSignedUp(), never
 * during server render), the placement each /c page maps to, and the page's
 * current context line ("JFK → LAX · Nov 26 · 14 flights") so the footer's
 * link can send the same one the page's card does.
 */

export const INTEREST_KEY = "pfc.interest.v1";

/** The study and C share the key; any non-empty value means "signed up in this browser". */
const listeners = new Set<() => void>();
let memory = false;

function readSignedUp(): boolean {
  try {
    return Boolean(window.localStorage.getItem(INTEREST_KEY)) || memory;
  } catch {
    return memory;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === INTEREST_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** True once this browser has signed up; false during server render and hydration. */
export function useSignedUp(): boolean {
  return useSyncExternalStore(subscribe, readSignedUp, () => false);
}

/** Remember the sign-up in this browser (call from the submit handler). `at`: ISO timestamp. */
export function markSignedUp(at: string, source: SignupSource = "c"): void {
  memory = true;
  try {
    window.localStorage.setItem(INTEREST_KEY, JSON.stringify({ source, at }));
  } catch {
    // Storage blocked: the in-memory flag still hides the form for this tab.
  }
  for (const listener of listeners) listener();
}

// ── team test flag ──────────────────────────────────────────────────────────

/** sessionStorage key: opening any /c page with ?test=1 marks that tab's sign-ups as team tests. */
export const C_TEST_KEY = "pfc.c.test.v1";

/**
 * Called from the C layout (in an effect, never during render): remembers ?test=1 for this tab,
 * mirroring the study's test flag, so sign-ups the team makes on the live site stay out of the
 * business numbers (docs/INTEREST.md).
 */
export function noteTestFlag(): void {
  try {
    if (new URLSearchParams(window.location.search).get("test") === "1") {
      window.sessionStorage.setItem(C_TEST_KEY, "1");
    }
  } catch {
    // Storage blocked: the sign-up is simply not marked as a test.
  }
}

/** Whether this tab was opened with ?test=1 (read in a handler, not during render). */
export function isCTest(): boolean {
  try {
    return window.sessionStorage.getItem(C_TEST_KEY) === "1";
  } catch {
    return false;
  }
}

// ── placement and context ───────────────────────────────────────────────────

/** A tool's placements (version C or D), as opposed to the study's. */
export type ToolPlacement = Extract<SignupPlacement, `c_${string}` | `d_${string}`>;

/** The placement for a /c or /d pathname (anything unknown counts as that tool's home; no tool → C's). */
export function placementFor(pathname: string | null): ToolPlacement {
  const tool = toolForPath(pathname) ?? TOOLS.c;
  if (pathname === `${tool.base}/search`) return tool.placements.results as ToolPlacement;
  if (pathname === `${tool.base}/flight`) return tool.placements.flight as ToolPlacement;
  if (pathname === `${tool.base}/compare`) return tool.placements.compare as ToolPlacement;
  return tool.placements.home as ToolPlacement;
}

let pageContext = "";

/** The page's card registers what the visitor is looking at (from an effect); returns the cleanup. */
export function registerContext(context: string): () => void {
  pageContext = context;
  return () => {
    if (pageContext === context) pageContext = "";
  };
}

/** What the page's card registered, "" when none (read in a handler, not during render). */
export function currentContext(): string {
  return pageContext;
}
