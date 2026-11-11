"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useLayoutEffect, useRef } from "react";
import { CloudMascot } from "@/components/d/brand/CloudMascot";
import { startCompanion, type Companion } from "./companion";
import { DCloudGaze } from "./DCloudGaze";
import { useStill } from "./still";

/**
 * The cloud's life in the /d layout (docs/ui-d-cinematic.md, "The cloud"), mounted once in
 * app/d/layout.tsx: the gaze and reactions of every cloud drawing (DCloudGaze), and the roaming
 * companion that sits on the top edge of the card the visitor attends to (./companion).
 *
 * Under reduced motion none of it exists: nothing is rendered and no listener is added, and the
 * inline clouds stay the still drawings the server sent. Nothing is rendered on the server
 * either, so a page works and looks complete before this arrives.
 */
export function DCompanion() {
  // The query string is only known in the browser, so the part that reads the address waits for it.
  return (
    <Suspense fallback={null}>
      <Crew />
    </Suspense>
  );
}

function Crew() {
  const still = useStill();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  if (still) return null;
  // Any change of address is a new page to the cloud, a sort or a filter included: the cards under it are not the same list.
  const page = `${pathname}?${query}`;
  return (
    <>
      <DCloudGaze page={page} />
      <Roamer page={page} />
    </>
  );
}

/** The companion's element. The script moves it; React only puts it there. */
function Roamer({ page }: { page: string }) {
  const host = useRef<HTMLDivElement>(null);
  const companion = useRef<Companion | null>(null);

  useLayoutEffect(() => {
    const el = host.current;
    const root = el?.closest<HTMLElement>('[data-theme="d"]');
    if (!el || !root) return;
    const started = startCompanion(root, el);
    companion.current = started;
    return () => {
      started.stop();
      companion.current = null;
    };
  }, []);

  // In a layout effect, like the gaze: the cloud is home before the new page is painted.
  useLayoutEffect(() => {
    companion.current?.pageChanged();
  }, [page]);

  return (
    <div ref={host} className="d-companion" aria-hidden="true">
      <CloudMascot float={false} />
    </div>
  );
}
