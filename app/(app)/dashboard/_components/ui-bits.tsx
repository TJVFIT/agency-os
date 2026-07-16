/**
 * Dashboard-private presentational bits (Ethereal Glass). Pure markup — no
 * state, no data access — shared by the dashboard panels so chips, empty
 * states and inline errors read as one system. Safe to import from both
 * server and client components.
 */

export type ChipTone = 'neutral' | 'red' | 'amber' | 'emerald';

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: 'border-white/[0.08] bg-white/[0.04] text-neutral-400',
  red: 'border-red-500/25 bg-red-500/[0.08] text-red-300',
  amber: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-300',
  emerald: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300',
};

/** Rounded-full count badge — tabular-nums, tinted per severity. */
export function CountChip({
  value,
  tone = 'neutral',
}: {
  value: number;
  tone?: ChipTone;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${CHIP_TONE[tone]}`}
    >
      {value}
    </span>
  );
}

const ORB_TONE: Record<ChipTone, string> = {
  neutral: 'border-white/[0.08] bg-white/[0.04] text-neutral-300',
  red: 'border-red-500/25 bg-red-500/[0.08] text-red-300',
  amber: 'border-amber-400/25 bg-amber-400/[0.08] text-amber-300',
  emerald: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-300',
};

/** Designed empty state: glass icon orb + one-line Turkish text. */
export function EmptyState({
  icon,
  text,
  tone = 'neutral',
}: {
  icon: string;
  text: string;
  tone?: ChipTone;
}) {
  return (
    <div className="animate-enter flex flex-col items-center justify-center gap-2.5 py-6 text-center">
      <span
        aria-hidden
        className={`flex h-10 w-10 items-center justify-center rounded-full border text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_28px_-12px_rgba(0,0,0,0.8)] ${ORB_TONE[tone]}`}
      >
        {icon}
      </span>
      <p className="max-w-[26rem] text-sm leading-snug text-neutral-500">
        {text}
      </p>
    </div>
  );
}

/** Inline action error — the red tint chip pattern, kept to one line. */
export function InlineError({ text }: { text: string }) {
  return (
    <span
      role="alert"
      className="inline-flex shrink-0 items-center rounded-full border border-red-500/25 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-300"
    >
      {text}
    </span>
  );
}

/** 11px uppercase tracking section label used between panel sub-lists. */
export function SectionLabel({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <h3 className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
      {children}
      {count !== undefined && (
        <span className="tabular-nums text-neutral-600">{count}</span>
      )}
    </h3>
  );
}
