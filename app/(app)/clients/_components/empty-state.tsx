/**
 * Presentational state primitives for the clients area — Ethereal Glass.
 * Icon-orb empty states, tabular count chips and the red-tint error note.
 * Pure markup: no hooks, no data logic, safe in server and client trees.
 */

/** Icon orb + one-line text. `compact` for in-panel lists, `bare` drops the dashed shell (for use inside an already-bordered container). */
export function EmptyState({
  icon,
  text,
  compact = false,
  bare = false,
  className = '',
}: {
  icon: string;
  text: string;
  compact?: boolean;
  bare?: boolean;
  className?: string;
}) {
  const shell = bare
    ? ''
    : 'rounded-2xl border border-dashed border-white/10 bg-white/[0.02]';
  return (
    <div
      className={`animate-enter flex flex-col items-center gap-2.5 text-center ${shell} ${
        compact ? 'px-4 py-7' : 'px-6 py-12'
      } ${className}`}
    >
      <span
        aria-hidden
        className={`flex items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ${
          compact ? 'h-9 w-9 text-base' : 'h-12 w-12 text-xl'
        }`}
      >
        {icon}
      </span>
      <p className={`${compact ? 'text-xs' : 'text-sm'} text-neutral-500`}>
        {text}
      </p>
    </div>
  );
}

/** Small glass pill with a tabular count — sits next to titles / panel actions. */
export function CountChip({
  value,
  className = '',
}: {
  value: number;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium tabular-nums text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${className}`}
    >
      {value}
    </span>
  );
}

/** Unified red-tint error block (same pattern as the app-wide error chips). */
export function ErrorNote({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  return (
    <p
      role="alert"
      className={`animate-enter rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-xs text-red-200 ${className}`}
    >
      {text}
    </p>
  );
}
