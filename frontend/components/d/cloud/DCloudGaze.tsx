"use client";

import { useLayoutEffect, useRef } from "react";
import { DCloudFaces } from "./DCloudFaces";
import { startGaze, type Gaze } from "./gaze";
import { startIdle } from "./idle";

/**
 * Brings every cloud drawing inside the /d layout to life (docs/ui-d-cinematic.md, "Gaze"): their
 * eyes follow the mouse or the thumb, and after a long pause the ones standing in the page glance
 * up once (./idle). It owns the layout's one set of pointer and touch listeners (./attention). The
 * clouds themselves are plain server-rendered drawings; this finds them by class, so nothing else
 * has to change to give a new cloud its gaze. Mounted by DCompanion, and only when motion is
 * welcome; it mounts the faces (DCloudFaces) in motion mode, and DCompanion does under reduced motion.
 *
 * `page` is any string that changes when the address does. It is handled in a layout effect: a
 * page change has to be known in the commit that shows the new page, while the page transition is
 * still running (ordinary effects wait for it to finish): the eyes look ahead then and hold still.
 */
export function DCloudGaze({ page, pathname }: { page: string; pathname: string }) {
  // A hidden marker, only to find the layout root this instance lives in.
  const anchor = useRef<HTMLSpanElement>(null);
  const gaze = useRef<Gaze | null>(null);

  useLayoutEffect(() => {
    const root = anchor.current?.closest<HTMLElement>('[data-theme="d"]');
    if (!root) return;
    const started = startGaze(root);
    // After the gaze: when the visitor moves again, the gaze aims first and the glance then finds its look replaced.
    const stopIdle = startIdle(root);
    gaze.current = started;
    return () => {
      stopIdle();
      started.stop();
      gaze.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    gaze.current?.pageChanged();
  }, [page]);

  return (
    <>
      <span ref={anchor} hidden />
      <DCloudFaces still={false} pathname={pathname} />
    </>
  );
}
