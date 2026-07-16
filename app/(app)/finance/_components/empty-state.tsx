/**
 * Designed empty state for the finance tabs — icon orb floating over a soft
 * indigo radial glow, one line of Turkish copy. Pure presentational; safe to
 * render from the server page and from client components (no hooks).
 */
export function EmptyState({
  icon,
  text,
  className = '',
}: {
  icon: string;
  text: string;
  className?: string;
}) {
  return (
    <div
      className={`animate-enter relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(22rem_12rem_at_50%_-3rem,rgba(129,140,248,0.09),transparent_70%)]"
      />
      <span
        aria-hidden
        className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.14)]"
      >
        {icon}
      </span>
      <p className="relative max-w-sm text-sm leading-relaxed text-neutral-400">
        {text}
      </p>
    </div>
  );
}
