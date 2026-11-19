/**
 * The small print under version D's email forms (the Flight Day Pack's "not ready yet" form and the waitlist
 * dialog). Opens /privacy in a new tab, so a dialog that must be answered isn't lost.
 */
export function PrivacyNote() {
  return (
    <p className="mt-3 text-[13px] leading-snug text-ink-mute">
      We only use your email for Cloud9.{" "}
      <a href="/privacy" target="_blank" rel="noopener" className="font-semibold underline underline-offset-2">
        Privacy
      </a>
    </p>
  );
}
