import { cn } from "@/lib/cn";
import { CloudMascot } from "./CloudMascot";

interface DLoadingProps {
  /** The one calm line under the mascot. */
  text?: string;
  className?: string;
}

/**
 * Version D's loading state (docs/ui-d-theme.md): the mascot and one line,
 * centred where the page is about to appear — the results, a flight, the
 * comparison. The line is a status, so it is read out once; the page itself takes over.
 */
export function DLoading({ text = "Checking the skies…", className }: DLoadingProps) {
  return (
    <div aria-busy="true" className={cn("flex min-h-[50vh] animate-d-rise flex-col items-center justify-center px-4 py-12 text-center", className)}>
      <CloudMascot className="w-28 sm:w-32" />
      <p role="status" className="mt-5 text-[17px] font-bold text-ink">
        {text}
      </p>
    </div>
  );
}
