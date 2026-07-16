import type { ReactNode } from 'react';

/**
 * Designed empty state for the /production tabs (Ethereal Glass): dashed
 * glass shell with a faint indigo bloom, an icon orb, one line of Turkish
 * copy and an optional CTA. Purely presentational.
 */
export function EmptyState({
  icon,
  text,
  cta,
}: {
  icon: string;
  text: string;
  cta?: ReactNode;
}) {
  return (
    <div className="animate-enter relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
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
      {cta && <span className="relative">{cta}</span>}
    </div>
  );
}
