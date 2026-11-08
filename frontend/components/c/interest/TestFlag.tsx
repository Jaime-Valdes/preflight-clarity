"use client";

import { useEffect } from "react";
import { disableRecordingForTests } from "@/lib/analytics";
import { isCTest, noteTestFlag } from "./signupState";

/**
 * Remembers ?test=1 for this tab so the team's version C and D sign-ups and events are marked as
 * tests (docs/INTEREST.md), and keeps a test tab's session out of the PostHog recordings.
 */
export function TestFlag() {
  useEffect(() => {
    noteTestFlag();
    if (isCTest()) disableRecordingForTests();
  }, []);
  return null;
}
