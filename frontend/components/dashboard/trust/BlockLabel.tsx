import type { ReactNode } from "react";

/** Small uppercase caption that names a block inside a section body. */
export function BlockLabel({ children }: { children: ReactNode }) {
  return <h4 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{children}</h4>;
}
