"use client";

import { createContext, useContext } from "react";
import type { AlternativeFlight } from "@preflight/shared/types";

/**
 * Free exploration (variant A only). Provided by `Dashboard`; null in variant B
 * and outside a dashboard, so section bodies can show exploration controls only
 * when they exist.
 */
export interface ExploreApi {
  /** Add an alternative from "Compare smoother options" as a full flight and show it. */
  openAlternative(alt: AlternativeFlight): void;
  /** Open the "Try a different flight" sheet. */
  openWhatIf(): void;
  /** Show another explored flight (a participant's choice — counts as a switch). */
  switchTo(id: string): void;
  /** Open the compare view. */
  compare(): void;
  /** Whether the flight on screen is the participant's own (set-up) flight rather than an explored option. */
  showingOwnFlight: boolean;
}

export const ExploreContext = createContext<ExploreApi | null>(null);

export function useExplore(): ExploreApi | null {
  return useContext(ExploreContext);
}
