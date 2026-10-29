"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { hrefsFor, type Hrefs } from "@/lib/c/model";
import { TOOLS, type ToolInfo, type ToolVersion } from "@/lib/tool";

/*
 * Which tool a page belongs to (frontend/lib/tool.ts). Each tool's layout
 * mounts the provider; components read `useTool()` for the base path, event
 * prefix, sign-up source and compare-list key, and `useHrefs()` for links.
 * Without a provider everything is version C, so nothing older changes.
 */

const ToolContext = createContext<ToolInfo>(TOOLS.c);

export function ToolProvider({ version, children }: { version: ToolVersion; children: ReactNode }) {
  return <ToolContext.Provider value={TOOLS[version]}>{children}</ToolContext.Provider>;
}

export function useTool(): ToolInfo {
  return useContext(ToolContext);
}

/** The current tool's page links. */
export function useHrefs(): Hrefs {
  const { base } = useTool();
  return useMemo(() => hrefsFor(base), [base]);
}
