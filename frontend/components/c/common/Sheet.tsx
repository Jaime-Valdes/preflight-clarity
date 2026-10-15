"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

/*
 * Version C: a modal sheet. Phones: rises from the bottom ("bottom", up to
 * ~88% tall) or covers the screen ("full"). Wider screens: a centred dialog.
 * role="dialog", focus trapped inside, Escape and the backdrop close it, the
 * page behind is inert and doesn't scroll, and focus returns to whatever
 * opened it. Rendered into <body>, above the sticky compare tray. Render it
 * only on the client, in response to the visitor (it portals on mount).
 */

interface SheetProps {
  title: string;
  /** Quiet line under the title. */
  description?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Pinned under the scrolling content (actions). */
  footer?: ReactNode;
  kind?: "bottom" | "full";
  /** Where focus goes on close when the opener is gone (default: the page's main content). */
  fallbackFocus?: () => HTMLElement | null;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** On a short screen (an on-screen keyboard is up), typing in a text field hides the description and the footer for room. */
const HIDE_WHILE_TYPING = "[@media(max-height:600px)]:group-has-[[type=text]:focus]:hidden";

export function Sheet({ title, description, onClose, children, footer, kind = "bottom", fallbackFocus }: SheetProps) {
  const titleId = useId();
  const descId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const fallbackRef = useRef(fallbackFocus);

  useEffect(() => {
    onCloseRef.current = onClose;
    fallbackRef.current = fallbackFocus;
  }, [onClose, fallbackFocus]);

  // Body scroll lock, an inert page behind, a focus trap, and focus in / focus back.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    // Everything but this sheet leaves the tab order and the accessibility tree (aria-modal alone isn't honoured everywhere).
    const inerted: HTMLElement[] = [];
    for (const el of Array.from(body.children)) {
      if (el instanceof HTMLElement && el !== rootRef.current && !el.inert) {
        el.inert = true;
        inerted.push(el);
      }
    }
    panelRef.current?.querySelector<HTMLElement>("[data-sheet-title]")?.focus({ preventScroll: true });

    // On the window (after React's handlers), so it also sees keys pressed while focus is on <body> after a click.
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        // A combobox inside closes its own list first (it prevents default).
        if (e.defaultPrevented) return;
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      // -1: the title, plain text that was clicked, or <body>.
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && (i < 0 || i === items.length - 1)) {
        e.preventDefault();
        items[0].focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      for (const el of inerted) el.inert = false;
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPadding;
      if (opener && opener.isConnected) opener.focus({ preventScroll: true });
      if (!opener || document.activeElement !== opener) {
        const fallback = fallbackRef.current?.() ?? document.getElementById("c-main");
        fallback?.focus({ preventScroll: true });
      }
    };
  }, []);

  const full = kind === "full";

  return createPortal(
    <div ref={rootRef} className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div
        aria-hidden
        className="absolute inset-0 bg-night-950/45 backdrop-blur-[2px] animate-[c-sheet-fade_200ms_ease-out]"
        onClick={() => onCloseRef.current()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        className={cn(
          "group relative flex w-full flex-col bg-canvas shadow-lift animate-[c-sheet-rise_260ms_cubic-bezier(0.22,1,0.36,1)]",
          "sm:max-h-[min(88dvh,760px)] sm:max-w-[480px] sm:rounded-3xl",
          // A full sheet keeps some height as a dialog, so a suggestion list inside has room to open.
          full ? "h-dvh sm:h-auto sm:min-h-[min(36rem,88dvh)]" : "max-h-[88dvh] rounded-t-3xl",
        )}
      >
        <style>{SHEET_KEYFRAMES}</style>
        {full ? null : <div aria-hidden className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-ink-300/70 sm:hidden" />}
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-3 px-5",
            full
              ? "border-b border-line/70 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:border-b-0 sm:pb-2 sm:pt-4"
              : "pb-2 pt-3 sm:pt-4",
          )}
        >
          <div className="min-w-0 pt-1.5">
            <h2 id={titleId} data-sheet-title tabIndex={-1} className="text-lg font-bold leading-tight text-ink-900 outline-none">
              {title}
            </h2>
            {description ? (
              <p id={descId} className={cn("mt-1 text-[13px] leading-snug text-ink-500", HIDE_WHILE_TYPING)}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-line/50 hover:text-ink-900"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div data-sheet-scroll className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          {children}
        </div>
        {footer ? (
          <div
            className={cn(
              "shrink-0 border-t border-line/70 bg-canvas/95 px-5 pt-3 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:rounded-b-3xl",
              HIDE_WHILE_TYPING,
            )}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

const SHEET_KEYFRAMES = `
@keyframes c-sheet-rise { from { transform: translateY(24px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes c-sheet-fade { from { opacity: 0; } to { opacity: 1; } }
`;
