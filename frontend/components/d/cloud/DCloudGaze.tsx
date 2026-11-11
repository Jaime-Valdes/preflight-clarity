"use client";

import { useLayoutEffect, useRef } from "react";
import { startGaze, type Gaze } from "./gaze";
import { startReactions } from "./reactions";

/**
 * Brings every cloud drawing inside the /d layout to life (docs/ui-d-cinematic.md, "Gaze" and
 * "Reactions"): their eyes follow the mouse or the thumb, and one of them answers when a D
 * component calls cloudReact(). It owns the layout's one set of pointer and touch listeners
 * (./attention). The clouds themselves are plain server-rendered drawings; this finds them by
 * class, so nothing else has to change to give a new cloud its gaze. Mounted by DCompanion, and
 * only when motion is welcome.
 *
 * `page` is any string that changes when the address does. It is handled in a layout effect: a
 * page change has to be known in the commit that shows the new page, while the transition's
 * plane is still crossing (ordinary effects wait for the plane to finish).
 */
export function DCloudGaze({ page }: { page: string }) {
  // A hidden marker, only to find the layout root this instance lives in.
  const anchor = useRef<HTMLSpanElement>(null);
  const gaze = useRef<Gaze | null>(null);

  useLayoutEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-theme="d"]');
    if (!root) return;
    const started = startGaze(root);
    const stopReactions = startReactions(root);
    gaze.current = started;
    return () => {
      started.stop();
      stopReactions();
      gaze.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    gaze.current?.pageChanged();
  }, [page]);

  return <span ref={anchor} hidden />;
}
