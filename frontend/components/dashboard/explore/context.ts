"use client";

import { createContext, useContext, useState } from "react";
import type { AlternativeFlight } from "@preflight/shared/types";

/**
 * Free exploration (variant A only). Provided by `Dashboard`; null in variant B
 * and outside a dashboard, so section bodies can show exploration controls only
 * when they exist.
 */
export interface ExploreApi {
  /** Add an alternative from "Compare smoother options" as a full flight and show it. */
  openAlternative(alt: AlternativeFlight): void;
  /** Whether "Open this flight" can show this alternative: it is already in the strip, or the strip has room. */
  canOpen(alt: AlternativeFlight): boolean;
  /** Open the "Try a different flight" sheet. */
  openWhatIf(): void;
  /** Show another explored flight (a participant's choice — counts as a switch). */
  switchTo(id: string): void;
  /** Open the compare view. */
  compare(): void;
  /**
   * Whether the flight on screen is the participant's own (set-up) flight rather than an explored option.
   * Section bodies use it so that "your flight" always means that flight (an option is "this flight"),
   * and so that the alerts switch (about their own flight) can only be changed there.
   */
  showingOwnFlight: boolean;
  /** State a section body keeps for the flight on screen (use `useFlightState`). */
  flightState(key: string): unknown;
  setFlightState(key: string, value: unknown): void;
}

export const ExploreContext = createContext<ExploreApi | null>(null);

export function useExplore(): ExploreApi | null {
  return useContext(ExploreContext);
}

/**
 * Like useState, but in variant A the value belongs to the flight on screen
 * and is kept by the dashboard, so it survives switching to another flight and
 * back (section bodies remount on every switch) — e.g. held options or the
 * chosen seat. Without exploration (variant B) it is plain local state, as before.
 * `key` must be unique across sections.
 */
export function useFlightState<T>(key: string, initial: T): [T, (value: T) => void] {
  const explore = useExplore();
  const [local, setLocal] = useState(initial);
  if (!explore) return [local, setLocal];
  const stored = explore.flightState(key);
  return [stored === undefined ? initial : (stored as T), (value: T) => explore.setFlightState(key, value)];
}
