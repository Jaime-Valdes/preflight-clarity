import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { CompareTray } from "@/components/c/shell/CompareTray";
import { Footer } from "@/components/c/shell/Footer";
import { Header } from "@/components/c/shell/Header";
import { ToolProvider } from "@/components/c/shell/ToolContext";
import { TestFlag } from "@/components/c/interest/TestFlag";
import { DScope } from "@/components/d/brand/DScope";
import { DCompanion } from "@/components/d/cloud/DCompanion";
import { DMotionLayer } from "@/components/d/motion/DMotionLayer";
import { DSky } from "@/components/d/sky/DSky";
import "./d-sky.css";
import "./d-transition.css";
import "./d-cloud.css";
import "./d-motion.css";
import "./d-home.css";
import "./d-results.css";
import "./d-flight.css";
import "./d-compare.css";

const DESCRIPTION =
  "Tell us what matters to you on a flight and see every nonstop flight rated in plain words for it: smooth cruise, smooth takeoff and landing, aircraft size, space and quiet. A prototype with illustrative data; nothing can be booked.";

export const metadata: Metadata = {
  title: { default: "Find a smooth flight", template: "%s · Cloud9" },
  description: DESCRIPTION,
  openGraph: { title: "Cloud9 · Find a smooth flight", description: DESCRIPTION },
  twitter: { title: "Cloud9 · Find a smooth flight", description: DESCRIPTION },
};

/**
 * The phone's browser bar takes the blue the sky starts with (docs/ui-d-cinematic.md).
 * Only the theme colour is set: Next merges viewport exports key by key, so the root
 * layout's width, scale, viewport-fit and colour scheme still apply to /d.
 */
export const viewport: Viewport = { themeColor: "#7EC3F4" };

/**
 * Version D (docs/ITERATION_2.md): the smooth-flight finder under /d. The same
 * shell as version C — top bar, a centred content column, the sticky compare
 * tray and the footer — with the tool context set to "d", so links, events,
 * sign-ups and the compare list are D's own. Pages render inside <main>; each
 * has one <h1>. The main keeps C's id: the sheets and the tray use it as their
 * focus fallback. `data-theme="d"` switches the design tokens to D's
 * palette for everything inside (docs/ui-d-theme.md); A, B and C never set it.
 *
 * The look's persistent pieces (docs/ui-d-cinematic.md) live here so they survive
 * navigation: the sky behind everything, the companion cloud, the layer for the tap
 * ring. The root is a stacking context (`isolate`) so the sky can sit behind the
 * content at z -1, and `relative` so the companion is placed in page coordinates;
 * `overflow-x-clip` keeps wide decoration from scrolling the page sideways without
 * turning the root into a scroll container (sticky pieces keep working).
 */
export default function DLayout({ children }: { children: ReactNode }) {
  return (
    <ToolProvider version="d">
      <div data-theme="d" className="relative isolate flex min-h-dvh w-full flex-1 flex-col overflow-x-clip bg-canvas text-ink-900">
        <DScope />
        <DSky />
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
        <DCompanion />
        <DMotionLayer />
      </div>
    </ToolProvider>
  );
}
