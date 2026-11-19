"use client";

import { useSyncExternalStore } from "react";
import type { PriceArm } from "@preflight/shared/types";

/*
 * Version D's Flight Day Pack price arm (docs/FLIGHT_DAY_PACK.md): $4.99 or $14.99 per trip, drawn
 * 50/50 with crypto.getRandomValues the first time a /d page runs in this browser and kept in
 * localStorage, so a visitor always sees the same price. It is never re-drawn: a stored arm is
 * read as it is.
 *
 * ?arm=p499 or ?arm=p1499 (team previews) forces an arm for this tab's session only
 * (sessionStorage). The visitor's own drawn arm stays stored underneath, and everything sent while
 * forced carries arm_forced: true, so previews can be left out of the numbers.
 *
 * Everything about the arm lives in this one module, so it can become a PostHog feature flag later
 * by swapping `drawnArm()` for the flag's value. Read during render only through useArm(), which is
 * null during server render and hydration: the price never exists on the server.
 */

/** The visitor's drawn arm (localStorage). */
export const ARM_KEY = "pfc.d.arm.v1";
/** A forced arm for this tab's session (sessionStorage, from ?arm=). */
export const FORCED_ARM_KEY = "pfc.d.arm.forced.v1";

/** Dollars per trip, and as shown. */
export const ARM_PRICE: Record<PriceArm, { usd: number; label: string }> = {
  p499: { usd: 4.99, label: "$4.99" },
  p1499: { usd: 14.99, label: "$14.99" },
};

export interface ArmState {
  arm: PriceArm;
  /** True while ?arm= forces it for this tab. */
  forced: boolean;
}

function isArm(value: unknown): value is PriceArm {
  return value === "p499" || value === "p1499";
}

/** Used when storage is blocked: the arm still holds for this page's life. */
let memoryArm: PriceArm | null = null;
let memoryForced: PriceArm | null = null;

function readLocal(): PriceArm | null {
  try {
    const raw = window.localStorage.getItem(ARM_KEY);
    return isArm(raw) ? raw : memoryArm;
  } catch {
    return memoryArm;
  }
}

function readForced(): PriceArm | null {
  try {
    const raw = window.sessionStorage.getItem(FORCED_ARM_KEY);
    return isArm(raw) ? raw : memoryForced;
  } catch {
    return memoryForced;
  }
}

/** A fair coin: one random bit from the browser's CSPRNG. */
function draw(): PriceArm {
  const byte = crypto.getRandomValues(new Uint8Array(1))[0];
  return (byte & 1) === 0 ? "p499" : "p1499";
}

/** The visitor's drawn arm, drawn and stored on the first call in this browser. */
function drawnArm(): PriceArm {
  const stored = readLocal();
  if (stored) return stored;
  const arm = draw();
  memoryArm = arm;
  try {
    window.localStorage.setItem(ARM_KEY, arm);
  } catch {
    // Storage blocked: the in-memory arm holds for this page.
  }
  return arm;
}

/** ?arm=p499|p1499 in the URL now: force that arm for this tab's session. Any other value changes nothing. */
function noteArmParam(): void {
  let value: string | null = null;
  try {
    value = new URLSearchParams(window.location.search).get("arm");
  } catch {
    return;
  }
  if (!isArm(value)) return;
  memoryForced = value;
  try {
    window.sessionStorage.setItem(FORCED_ARM_KEY, value);
  } catch {
    // Storage blocked: forced for this page only.
  }
}

let cached: { arm: PriceArm; forced: boolean; state: ArmState } | null = null;

/**
 * The arm for this tab right now: the forced one while ?arm= is in force, else the visitor's drawn
 * arm (drawn on the first call in this browser). Client only; call from effects, handlers or
 * analytics hooks, never during server render.
 */
export function currentArm(): ArmState {
  noteArmParam();
  const drawn = drawnArm();
  const forced = readForced();
  const arm = forced ?? drawn;
  const isForced = forced !== null;
  if (!cached || cached.arm !== arm || cached.forced !== isForced) {
    cached = { arm, forced: isForced, state: { arm, forced: isForced } };
  }
  return cached.state;
}

/** The properties every version D event and every Flight Day Pack row carries: price_arm, and arm_forced only when forced. */
export function armProps(): { price_arm: PriceArm; arm_forced?: true } {
  const { arm, forced } = currentArm();
  return forced ? { price_arm: arm, arm_forced: true } : { price_arm: arm };
}

const noopSubscribe = () => () => {};

/** The arm on the client; null during server render and hydration (render the price only once it is known). */
export function useArm(): ArmState | null {
  return useSyncExternalStore(noopSubscribe, currentArm, () => null);
}
