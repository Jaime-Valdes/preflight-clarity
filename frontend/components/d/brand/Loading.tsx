import { cn } from "@/lib/cn";
import { CloudMascot } from "./CloudMascot";

interface DLoadingProps {
  /** The one calm line under the mascot. */
  text?: string;
  className?: string;
}

/**
 * Version D's loading state (docs/ui-d-cinematic.md, "Compare and the small states"): the
 * cloud on its stage, looking up at the sky it is checking, one line, and three small dashes
 * that brighten in turn. Centred where the page is about to appear — the results, a flight,
 * the comparison. The line is a status, so it is read out once; the page itself takes over.
 *
 * This is the prerendered first paint of three routes, so it renders on the server from its
 * props alone: no clock, no randomness, no script. The cloud's upward look is a custom
 * property the drawing reads (--gy, set by .d-loading-look in app/d/d-compare.css), and the
 * dashes are a CSS animation that reduced motion leaves still.
 */
export function DLoading({ text = "Checking the skies…", className }: DLoadingProps) {
  return (
    <div aria-busy="true" className={cn("d-compare-rise flex min-h-[50vh] flex-col items-center justify-center px-4 py-12 text-center", className)}>
      <span className="d-loading-look block w-[120px]">
        <CloudMascot data-cloud-stage />
      </span>
      <p role="status" className="mt-5 text-[17px] font-bold text-ink">
        {text}
      </p>
      <span aria-hidden className="d-loading-dashes mt-3.5">
        <span />
        <span />
        <span />
      </span>
    </div>
  );
}
