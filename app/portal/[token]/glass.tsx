import type { ReactNode } from 'react';

/**
 * Presentational-only Ethereal Glass bits shared by the portal tabs.
 * No state, no handlers — pure markup so every tab renders the same
 * empty states, status notes, section labels and double-bezel panels.
 */

/** Glass list row: hairline border, inset highlight, soft lift on hover. */
export const ROW =
  'rounded-xl border border-white/[0.07] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.13] hover:bg-white/[0.05] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.7)]';

/** Icon orb used by empty states and hero-ish moments. */
export function Orb({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-8px_rgba(0,0,0,0.8)] ${className}`}
    >
      {children}
    </span>
  );
}

/** Designed empty state: icon orb + one line of Turkish copy. */
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
      className={`animate-enter flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] ${className}`}
    >
      <Orb>{icon}</Orb>
      <p className="max-w-[26ch] text-sm leading-relaxed text-neutral-400">
        {text}
      </p>
    </div>
  );
}

const NOTE_TONES = {
  error: 'border-red-500/20 bg-red-500/10 text-red-300',
  success: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  info: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
} as const;

/** Unified tinted status note (error / success / info). */
export function StatusNote({
  tone,
  children,
  className = '',
}: {
  tone: keyof typeof NOTE_TONES;
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={`animate-enter rounded-lg border px-3 py-2 text-center text-xs leading-relaxed ${NOTE_TONES[tone]} ${className}`}
    >
      {children}
    </p>
  );
}

/** 11px uppercase section label with an optional tabular count. */
export function SectionLabel({
  children,
  count,
  className = '',
}: {
  children: ReactNode;
  count?: number;
  className?: string;
}) {
  return (
    <h3
      className={`mb-2 flex items-baseline gap-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500 ${className}`}
    >
      {children}
      {typeof count === 'number' && (
        <span className="tabular-nums text-neutral-600">{count}</span>
      )}
    </h3>
  );
}

/**
 * Double-bezel glass shell: gradient hairline wrapper around a solid core —
 * same recipe as components/ui Panel, but with free-form inner padding so
 * tabs can go full-bleed (media) or dense (forms).
 */
export function Bezel({
  children,
  className = '',
  innerClassName = '',
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
}) {
  return (
    <div
      className={`rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] transition-shadow duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.75)] ${className}`}
    >
      <div
        className={`overflow-hidden rounded-[calc(1rem-1px)] bg-[#0a0a0b] ${innerClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
