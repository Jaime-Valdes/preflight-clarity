import { EarlyAccessLink } from "@/components/c/interest/EarlyAccessLink";

/** Version C: the quiet footer under every /c page, with the "Get early access" link (docs/INTEREST.md). */
export function Footer() {
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center gap-1 px-4 py-5 text-center text-xs leading-relaxed text-ink-500 sm:px-6 lg:px-8">
        <p>Prototype · all flights, prices and forecasts are illustrative · nothing can be booked</p>
        <EarlyAccessLink />
      </div>
    </footer>
  );
}
