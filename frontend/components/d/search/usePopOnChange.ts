"use client";

import { useState } from "react";

/**
 * For a small glyph that pops (the kit's .d-pop) when what it shows changes, and only then: the plus that becomes a
 * check on a card's Compare button, the number on the Filters button.
 *
 *   const [pop, popped] = usePopOnChange(inCompare);
 *   <Check key="on" className={cn("size-4", pop && "d-pop")} onAnimationEnd={popped} />
 *
 * `pop` turns true in the very render in which the value differs from the one last shown, so the glyph that mounts
 * for the new value carries the class from its first frame; a glyph that merely arrives with its page never does.
 * Call `popped` when the animation ends: with the class gone, the glyph cannot pop again by itself (a CSS animation
 * restarts when its element is moved in a list, or when a page that was kept alive is shown again). The hook takes a
 * value and nothing else, so the pop cannot depend on what a card shows.
 */
export function usePopOnChange<T>(value: T): [pop: boolean, popped: () => void] {
  const [shown, setShown] = useState(value);
  const [pop, setPop] = useState(false);
  // Storing what was shown last and comparing during render: React re-renders at once with the new state.
  if (shown !== value) {
    setShown(value);
    setPop(true);
  }
  return [pop, () => setPop(false)];
}
