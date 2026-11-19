import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Screen } from "@/components/ui/Screen";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Cloud9 collects, why, and how to reach us.",
};

/** Privacy contact, shown on the page and used for the mailto link. */
const CONTACT = "jdv8036@nyu.edu";

/*
 * The site's privacy page (linked from version D's footer and its sign-up forms). Plain and short, and kept
 * true to what the code does: frontend/lib/analytics.ts (PostHog: anonymous, no person profiles, inputs masked
 * in recordings, no emails or answers sent), the Supabase tables in backend/supabase/schema.sql, and the
 * browser-storage keys in lib/storage.ts and lib/d/*. Update it, and the date, whenever any of those change
 * (for example, adding an advertising pixel).
 */
export default function PrivacyPage() {
  return (
    <Screen>
      <Card className="text-left">
        <h1 className="text-2xl font-bold leading-tight text-ink-900">Privacy</h1>
        <p className="mt-1 text-sm text-ink-500">Last updated November 19, 2026</p>

        <Section title="Who we are">
          <p>
            Cloud9 is a student capstone project at New York University. It is a prototype, not an official NYU
            service. Nothing on this site can be booked or bought, and we never ask for payment details.
          </p>
          <p>
            Questions about your data: <Mail />.
          </p>
        </Section>

        <Section title="What we collect">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="font-semibold text-ink-900">If you sign up for updates</strong>: your email, and your
              first name or flight date if you give them; whether you&rsquo;re open to a short chat; where on the site
              you signed up; the price you were shown; and the campaign tags in the link you arrived from (such as
              utm_source).
            </li>
            <li>
              <strong className="font-semibold text-ink-900">If you answer our optional questions</strong>: your
              answers, including anything you type, saved with a random visit ID, the price you were shown and the
              same campaign tags.
            </li>
            <li>
              <strong className="font-semibold text-ink-900">If you take part in our research study</strong>: your
              answers to the study&rsquo;s questions.
            </li>
            <li>
              <strong className="font-semibold text-ink-900">How the site is used</strong>: we use PostHog to see
              which pages are viewed and what is clicked, and to record anonymous replays of how the pages are used.
              Replays hide everything typed into forms. PostHog gets a random ID for your browser; it never receives
              your email, your name or your answers, and we don&rsquo;t build profiles of visitors.
            </li>
            <li>
              <strong className="font-semibold text-ink-900">In your browser</strong>: a few small settings (for
              example, the price you were shown and whether you&rsquo;ve already seen a prompt), so the site stays
              consistent between visits, plus PostHog&rsquo;s random ID. We use no advertising cookies or ad tracking.
            </li>
          </ul>
        </Section>

        <Section title="How we use it">
          <p>
            To run and improve the project and learn what would make it useful. If you sign up, we&rsquo;ll email you
            about Cloud9, such as when something you asked about launches. If you said you&rsquo;re open to a chat, we
            may invite you to one. We don&rsquo;t sell your information or share it with advertisers.
          </p>
        </Section>

        <Section title="Who handles it">
          <p>
            Our service providers: Vercel (hosting), Supabase (database) and PostHog (usage analytics). They store
            data in the United States and handle it only to provide their services to us.
          </p>
        </Section>

        <Section title="How long we keep it">
          <p>Only as long as the project needs it. We delete it when the project ends.</p>
        </Section>

        <Section title="Your choices">
          <p>
            Email <Mail /> to see, correct or delete what we hold about you, or to stop hearing from us. Every
            question on the site is optional.
          </p>
        </Section>

        <Section title="Children">
          <p>Cloud9 isn&rsquo;t meant for children under 13, and we don&rsquo;t knowingly collect their information.</p>
        </Section>

        <Section title="Changes">
          <p>If this page changes, the date at the top changes with it.</p>
        </Section>
      </Card>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-lg font-semibold leading-snug text-ink-900">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-ink-700">{children}</div>
    </section>
  );
}

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} className="font-semibold text-ink-900 underline underline-offset-2">
      {CONTACT}
    </a>
  );
}
