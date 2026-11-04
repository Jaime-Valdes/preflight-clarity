/*
 * Three soft background shapes behind the intro (docs/ui-d-theme.md): two
 * blues and a warm cream, drifting a few pixels over half a minute — barely
 * there. Decorative; they sit inside a relative, overflow-hidden parent.
 */
export function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -right-24 -top-28 h-[22rem] w-[26rem] animate-d-drift rounded-[48%_52%_55%_45%/56%_44%_56%_44%] bg-sky-deep sm:-right-16 sm:h-[28rem] sm:w-[34rem]" />
      <div className="absolute -bottom-32 -left-28 h-[20rem] w-[24rem] animate-d-drift-slow rounded-[55%_45%_48%_52%/45%_58%_42%_55%] bg-cream sm:h-[24rem] sm:w-[30rem]" />
      <div className="absolute right-6 top-[54%] h-24 w-32 animate-d-drift rounded-[52%_48%_60%_40%/50%_50%_50%_50%] bg-leaf/70 [animation-delay:-7s] sm:right-[22%]" />
    </div>
  );
}
