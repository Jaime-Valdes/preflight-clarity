import { CloudOff, KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

function CenteredCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-5 py-10">
      <Card className="w-full animate-fade-up text-center">
        <span
          aria-hidden
          className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-breeze-50 text-breeze-700 ring-1 ring-inset ring-breeze-100 [&_svg]:size-5"
        >
          {icon}
        </span>
        <h1 className="mt-4 text-lg font-bold text-ink-900">{title}</h1>
        <div className="mt-2 text-[15px] leading-relaxed text-ink-700">{children}</div>
      </Card>
      <p className="mt-6 text-xs text-ink-400">Cloud9 · team results</p>
    </div>
  );
}

/** Shown for a missing or wrong key. Deliberately says nothing about what is configured. */
export function AccessCard() {
  return (
    <CenteredCard icon={<KeyRound />} title="This page needs the team's access key">
      <p>
        Open the results link that includes <span className="font-semibold text-ink-900">?key=…</span> from the team
        notes. Nothing on this page is shown without it.
      </p>
    </CenteredCard>
  );
}

/** Shown when the backend could not be read. */
export function ErrorCard({ message }: { message: string }) {
  return (
    <CenteredCard icon={<CloudOff />} title="The results couldn't be loaded">
      <p>{message}</p>
      <p className="mt-3 text-sm text-ink-500">
        Check that the backend is running and that <span className="font-semibold">API_URL</span> and{" "}
        <span className="font-semibold">ADMIN_KEY</span> match on both sides, then reload this page.
      </p>
    </CenteredCard>
  );
}
