import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TURBULENCE_FORECAST_DAYS } from "@preflight/shared/forecast";
import { CompareTray } from "@/components/c/shell/CompareTray";
import { Footer } from "@/components/c/shell/Footer";
import { Header } from "@/components/c/shell/Header";
import { ToolProvider } from "@/components/c/shell/ToolContext";
import { TestFlag } from "@/components/c/interest/TestFlag";

const DESCRIPTION = `Compare nonstop flights side by side with the pre-flight picture in hand: times and fares, aircraft, airline and who flies it, plus the turbulence forecast from ${TURBULENCE_FORECAST_DAYS} days before departure and the weather from about a week before. A prototype — all data is illustrative.`;

export const metadata: Metadata = {
  title: { default: "Compare flights", template: "%s · Cloud9" },
  description: DESCRIPTION,
  openGraph: { title: "Cloud9 · Compare flights", description: DESCRIPTION },
  twitter: { title: "Cloud9 · Compare flights", description: DESCRIPTION },
};

/**
 * Version C (docs/VERSION_C.md): the flight comparison tool under /c — top
 * bar, a centred content column (max ~1120 px), the sticky compare tray and
 * a quiet footer. Pages render inside <main>; each has one <h1>.
 */
export default function CLayout({ children }: { children: ReactNode }) {
  return (
    <ToolProvider version="c">
      <div className="flex min-h-dvh w-full flex-1 flex-col">
        <TestFlag />
        <Header />
        <main
          id="c-main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-10 pt-4 outline-none sm:px-6 sm:pt-6 lg:px-8"
        >
          {children}
        </main>
        <CompareTray />
        <Footer />
      </div>
    </ToolProvider>
  );
}
