"use client";

import { useEffect, type ReactNode } from "react";
import { startAnalytics } from "@/lib/analytics";

/** Starts PostHog on the client (no-op without NEXT_PUBLIC_POSTHOG_KEY). Pageviews are captured on URL changes. */
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    startAnalytics();
  }, []);
  return children;
}
