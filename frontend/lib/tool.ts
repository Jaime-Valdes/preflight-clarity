import type { SignupPlacement, SignupSource } from "@preflight/shared/types";

/*
 * The two flight tools share one set of components: version C (/c, the
 * comparison tool) and version D (/d, the smooth-flight finder, docs/ITERATION_2.md).
 * Everything that differs between them by name only — base path, PostHog
 * variant letter and event prefix, sign-up source and placements, the compare
 * list's storage key — lives here, so a component reads `useTool()` instead of
 * spelling "/c" or "c_" anywhere. C is the default wherever no provider is
 * mounted, so the study's pages and older call sites are unchanged.
 */

export type ToolVersion = "c" | "d";
export type ToolBase = "/c" | "/d";

export interface ToolInfo {
  version: ToolVersion;
  base: ToolBase;
  /** `variant` stamped on every PostHog event from these pages (docs/ANALYTICS.md). */
  variant: "C" | "D";
  /** Event-name prefix: "c" → c_search, c_compare_toggle… */
  events: ToolVersion;
  source: SignupSource;
  placements: Record<"home" | "results" | "flight" | "compare", SignupPlacement>;
  /** localStorage key of this tool's compare list — separate lists, so a visitor can try both. */
  compareKey: string;
  /** For labels: "Cloud9, flight search". */
  name: string;
}

export const TOOLS: Record<ToolVersion, ToolInfo> = {
  c: {
    version: "c",
    base: "/c",
    variant: "C",
    events: "c",
    source: "c",
    placements: { home: "c_home", results: "c_results", flight: "c_flight", compare: "c_compare" },
    compareKey: "pfc.c.compare.v1",
    name: "flight search",
  },
  d: {
    version: "d",
    base: "/d",
    variant: "D",
    events: "d",
    source: "d",
    placements: { home: "d_home", results: "d_results", flight: "d_flight", compare: "d_compare" },
    compareKey: "pfc.d.compare.v1",
    name: "smooth-flight finder",
  },
};

/** The tool a pathname belongs to ("/c", "/c/…", "/d", "/d/…"); null for the study and everything else. */
export function toolForPath(pathname: string | null | undefined): ToolInfo | null {
  if (!pathname) return null;
  for (const tool of Object.values(TOOLS)) {
    if (pathname === tool.base || pathname.startsWith(`${tool.base}/`)) return tool;
  }
  return null;
}
