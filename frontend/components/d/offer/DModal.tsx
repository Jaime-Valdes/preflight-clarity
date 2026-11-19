"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { noteSurface } from "@/lib/d/flightDayPack";

/*
 * Version D's forced-choice dialog (docs/FLIGHT_DAY_PACK.md, iteration 2): the Flight Day Pack after a pick and
 * the waitlist after 30 s. Centred over a dimmed page; role="dialog" and aria-modal; the focus starts on the
 * heading, is kept inside, and goes back where it came from on close; the page behind does not scroll.
 * There is no ✕ and the backdrop does nothing: the content's own buttons are the only way out, and Escape is
 * handed to the content (it counts as "No thanks"). Portalled into D's root (fixed, above the page, the tray,
 * the header and the companion), so the theme's tokens and the night revert still apply.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DModal({
  children,
  sunset = false,
  onReturnFocus,
  onEscape,
  label,
}: {
  children: ReactNode;
  /** The dialog's accessible name. */
  label: string;
  /** The Flight Day Pack's dusk-tinted scrim; the waitlist's is D's sheet scrim. */
  sunset?: boolean;
  /** Where the focus goes on close (the pick button); else the element that had it on open. */
  onReturnFocus?: () => HTMLElement | null;
  /** Escape, when the content doesn't handle it itself. */
  onEscape?: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const returnRef = useRef(onReturnFocus);
  useEffect(() => {
    returnRef.current = onReturnFocus;
  });

  useEffect(() => {
    noteSurface(true);
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const html = document.documentElement;
    const prev = { html: html.style.overflow, body: document.body.style.overflow };
    html.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    const start = boxRef.current?.querySelector<HTMLElement>("[data-step-title], h2, h1");
    (start ?? boxRef.current)?.focus({ preventScroll: true });
    // A key pressed while the focus is somehow outside the dialog (the browser put it on <body>) is brought back in:
    // Tab lands inside, and Escape is handed to the dialog's content as if pressed there.
    const onDocKey = (event: globalThis.KeyboardEvent) => {
      const box = boxRef.current;
      if (!box || box.contains(document.activeElement)) return;
      if (event.key !== "Escape" && event.key !== "Tab") return;
      event.preventDefault();
      const inside = box.querySelector<HTMLElement>("[data-step-title], h2, h1") ?? box;
      inside.focus({ preventScroll: true });
      if (event.key === "Escape") inside.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    };
    document.addEventListener("keydown", onDocKey, true);
    return () => {
      document.removeEventListener("keydown", onDocKey, true);
      noteSurface(false);
      html.style.overflow = prev.html;
      document.body.style.overflow = prev.body;
      const back = returnRef.current?.() ?? before;
      if (back?.isConnected) back.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onEscape?.();
      return;
    }
    if (event.key !== "Tab") return;
    const box = boxRef.current;
    if (!box) return;
    const items = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !box.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !box.contains(active))) {
      event.preventDefault();
      first.focus();
    }
  };

  // Into D's root, outside <main> (which is its own stacking context during page moves), so nothing of the
  // page, the companion cloud included, sits above the scrim; still inside the theme for its tokens.
  const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>('[data-theme="d"]');
  const dialog = (
    <div className="d-modal fixed inset-0 z-[90] flex items-center justify-center p-4" onKeyDown={onKeyDown}>
      {/* The backdrop: it shades the page and takes taps, and does nothing with them. */}
      <div
        aria-hidden
        onMouseDown={(event) => event.preventDefault()}
        className={sunset ? "d-modal-scrim d-modal-scrim-sunset absolute inset-0" : "d-modal-scrim absolute inset-0"}
      />
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="d-modal-box relative max-h-[calc(100dvh-2rem)] w-full max-w-[440px] outline-none [&>section]:max-h-[calc(100dvh-2rem)]"
      >
        {children}
      </div>
    </div>
  );
  return root ? createPortal(dialog, root) : dialog;
}
