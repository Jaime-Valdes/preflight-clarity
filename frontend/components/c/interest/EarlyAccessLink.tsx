"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { INTEREST_DONE_TITLE, InterestSheet } from "./InterestSheet";
import { currentContext, placementFor, useSignedUp, type ToolPlacement } from "./signupState";

/*
 * The footer's quiet "Get early access" link (docs/INTEREST.md). The footer
 * sits in the /c layout, so the link owns its own sign-up sheet and takes the
 * placement from the pathname and the context line from whatever card the
 * page registered. Once this browser has signed up it reads "You're on the list."
 */
export function EarlyAccessLink() {
  const pathname = usePathname();
  const signedUp = useSignedUp();
  const [open, setOpen] = useState<{ placement: ToolPlacement; context: string } | null>(null);
  const statusRef = useRef<HTMLSpanElement>(null);

  // Back/forward (another page under the sheet) closes it.
  useEffect(() => {
    const close = () => setOpen(null);
    window.addEventListener("popstate", close);
    return () => window.removeEventListener("popstate", close);
  }, []);

  return (
    <>
      {signedUp ? (
        // Focusable so the sheet can hand focus back here once the link it opened from is gone.
        <span ref={statusRef} tabIndex={-1} className="inline-flex min-h-11 items-center rounded-full px-2 text-xs text-ink-500 outline-none">
          {INTEREST_DONE_TITLE}
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setOpen({ placement: placementFor(pathname), context: currentContext() })}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center rounded-full px-2 text-xs font-semibold text-ink-700 underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink-900 hover:decoration-ink-500"
        >
          Get early access
        </button>
      )}
      {/* Outside the branch above: the sheet stays up to show "You're on the list." after a sign-up. */}
      {open ? (
        <InterestSheet
          placement={open.placement}
          context={open.context}
          onClose={() => setOpen(null)}
          fallbackFocus={() => statusRef.current ?? document.getElementById("c-main")}
        />
      ) : null}
    </>
  );
}
