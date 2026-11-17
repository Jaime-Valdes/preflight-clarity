"use client";

import { useLayoutEffect, useRef } from "react";
import { startReactions, type Reactions } from "./reactions";

/**
 * The clouds' faces inside the /d layout (docs/ui-d-cinematic.md, "Reactions"): one cloud on screen
 * answers what the visitor does (./reactions). Mounted whatever the motion setting (by DCloudGaze when
 * motion is welcome, by DCompanion under reduced motion): under reduced motion the faces still change,
 * and nothing moves (`still`).
 *
 * `pathname` is the page's path. A new one is handled in a layout effect, so the arrival is known in
 * the commit that shows the new page: worn faces end with the page they were on, and the greeting
 * waits for the new one to settle. A query change (sort, filter, date) keeps the page and its faces.
 */
export function DCloudFaces({ still, pathname }: { still: boolean; pathname: string }) {
  // A hidden marker, only to find the layout root this instance lives in.
  const anchor = useRef<HTMLSpanElement>(null);
  const reactions = useRef<Reactions | null>(null);
  /** The path last arrived at, for an instance that starts again when the motion setting changes. */
  const arrivedAt = useRef(pathname);

  // A change of the motion setting mounts a new instance (`still` is true on the server and during hydration,
  // so the still one comes first and the moving one a moment later; nothing has been written by then). The old
  // instance is stopped, timers and all, first.
  useLayoutEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-theme="d"]');
    if (!root) return;
    const started = startReactions(root, { still });
    reactions.current = started;
    started.arrived(arrivedAt.current);
    return () => {
      started.stop();
      reactions.current = null;
    };
  }, [still]);

  useLayoutEffect(() => {
    arrivedAt.current = pathname;
    reactions.current?.arrived(pathname);
  }, [pathname]);

  return <span ref={anchor} hidden />;
}
