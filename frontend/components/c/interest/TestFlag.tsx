"use client";

import { useEffect } from "react";
import { noteTestFlag } from "./signupState";

/** Remembers ?test=1 for this tab so the team's version C sign-ups are marked as tests (docs/INTEREST.md). */
export function TestFlag() {
  useEffect(() => {
    noteTestFlag();
  }, []);
  return null;
}
