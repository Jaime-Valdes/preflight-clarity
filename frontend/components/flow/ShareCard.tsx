"use client";

import { Check, Send } from "lucide-react";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/cn";

/**
 * The link a participant passes on: the plain study link, tagged so arrivals from a share
 * show up in PostHog (utm_source on their pageview). The sharer's own ?v=, ?p= and ?test=
 * never travel with it, so the friend is randomised like anyone else.
 */
function shareUrl(): string {
  return `${window.location.origin}/?utm_source=share&utm_medium=friend`;
}

const SHARE_TEXT = "A 5–10 minute study for nervous flyers, from a student team. Worth a look if flying makes you nervous.";

/** What happened after the tap, for the line under the button. */
type Outcome = "idle" | "copied" | "shown";

/**
 * "Know another nervous flyer?" on the debrief: the phone's share sheet where there is
 * one (navigator.share), otherwise the link is copied; if copying isn't allowed either,
 * the link is shown to select by hand.
 */
export function ShareCard({ className }: { className?: string }) {
  const [outcome, setOutcome] = useState<Outcome>("idle");
  const [link, setLink] = useState("");

  async function share() {
    const url = shareUrl();
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Cloud9", text: SHARE_TEXT, url });
        track("study_share", { method: "native", outcome: "shared" });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          track("study_share", { method: "native", outcome: "cancelled" });
          return;
        }
        // Sharing this payload isn't supported here: copy instead.
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setOutcome("copied");
      track("study_share", { method: "copy", outcome: "copied" });
    } catch {
      setLink(url);
      setOutcome("shown");
      track("study_share", { method: "copy", outcome: "shown" });
    }
  }

  return (
    <Card className={cn("!bg-dusk-50 !ring-dusk-100", className)}>
      <div className="flex gap-3">
        <span
          aria-hidden
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface text-dusk-700 ring-1 ring-inset ring-dusk-100"
        >
          <Send className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold leading-snug text-ink-900">Know another nervous flyer?</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-700">
            Send them the link. It takes 5&ndash;10 minutes, and every answer helps.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="md"
        block
        className="mt-4"
        onClick={share}
        icon={outcome === "copied" ? <Check aria-hidden className="size-4" /> : <Send aria-hidden className="size-4" />}
      >
        {outcome === "copied" ? "Link copied" : "Share with a friend"}
      </Button>
      <p className="mt-2 min-h-4 text-center text-[13px] leading-snug text-ink-500" aria-live="polite">
        {outcome === "copied" ? "Paste it into a message." : outcome === "shown" ? "Copy this link:" : ""}
      </p>
      {outcome === "shown" ? (
        <p className="mt-1 select-all break-all rounded-2xl bg-surface px-4 py-3 text-center text-[13px] text-ink-900 ring-1 ring-inset ring-line-strong">
          {link}
        </p>
      ) : null}
    </Card>
  );
}
