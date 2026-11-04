import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CompareTray } from "@/components/c/shell/CompareTray";
import { Footer } from "@/components/c/shell/Footer";
import { Header } from "@/components/c/shell/Header";
import { ToolProvider } from "@/components/c/shell/ToolContext";
import { TestFlag } from "@/components/c/interest/TestFlag";

const DESCRIPTION =
  "Tell us what matters to you on a flight and see every nonstop flight rated in plain words for it: smooth cruise, smooth takeoff and landing, aircraft size, space and quiet. A prototype with illustrative data; nothing can be booked.";

export const metadata: Metadata = {
  title: { default: "Find a smooth flight", template: "%s · Cloud9" },
  description: DESCRIPTION,
  openGraph: { title: "Cloud9 · Find a smooth flight", description: DESCRIPTION },
  twitter: { title: "Cloud9 · Find a smooth flight", description: DESCRIPTION },
};

/**
 * Version D (docs/ITERATION_2.md): the smooth-flight finder under /d. The same
 * shell as version C — top bar, a centred content column, the sticky compare
 * tray and the footer — with the tool context set to "d", so links, events,
 * sign-ups and the compare list are D's own. Pages render inside <main>; each
 * has one <h1>. The main keeps C's id: the sheets and the tray use it as their
 * focus fallback. `data-theme="d"` switches the design tokens to D's calm
 * palette for everything inside (docs/ui-d-theme.md); A, B and C never set it.
 */
export default function DLayout({ children }: { children: ReactNode }) {
  return (
    <ToolProvider version="d">
      <div data-theme="d" className="flex min-h-dvh w-full flex-1 flex-col bg-canvas text-ink-900">
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
