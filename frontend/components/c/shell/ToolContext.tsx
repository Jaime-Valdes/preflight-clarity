"use client";

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { hrefsFor, type Hrefs } from "@/lib/c/model";
import { generatorSource, storeSourceSnapshot, type FlightSource } from "@/lib/flights/source";
import { subscribeRouteDays } from "@/lib/flights/store";
import { TOOLS, type ToolInfo, type ToolVersion } from "@/lib/tool";

/*
 * Which tool a page belongs to (frontend/lib/tool.ts). Each tool's layout
 * mounts the provider; components read `useTool()` for the base path, event
 * prefix, sign-up source and compare-list key, `useHrefs()` for links and
 * `useFlightSource()` for where a day's flights come from. Without a provider
 * everything is version C, so nothing older changes.
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

const noopSubscribe = () => () => {};
const generatorSnapshot = () => generatorSource;

/**
 * Where this tool's pages get a day's flights (frontend/lib/flights/source.ts): the generator for
 * version C and wherever no provider is mounted, the day store for version D. The store's source is
 * a new object each time a day settles, so memos and effects keyed on it run again; the generator's
 * never changes, so nothing in C re-renders for it.
 */
export function useFlightSource(): FlightSource {
  const store = useTool().flights === "store";
  return useSyncExternalStore(
    store ? subscribeRouteDays : noopSubscribe,
    store ? storeSourceSnapshot : generatorSnapshot,
    store ? storeSourceSnapshot : generatorSnapshot,
  );
}
