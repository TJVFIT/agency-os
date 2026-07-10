import { tr } from '@/lib/i18n/tr';
import type { CardStatus } from '@/lib/status';

/** Tinted glass chips with a matching glow dot per pipeline stage. */
const COLORS: Record<CardStatus, { chip: string; dot: string }> = {
  idea: {
    chip: 'border-white/10 bg-white/[0.05] text-neutral-300',
    dot: 'bg-neutral-400',
  },
  copy_draft: {
    chip: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    dot: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
  },
  visual_ready: {
    chip: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    dot: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]',
  },
  translated: {
    chip: 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200',
    dot: 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]',
  },
  approved: {
    chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  },
  scheduled: {
    chip: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
    dot: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]',
  },
  published: {
    chip: 'border-green-400/25 bg-green-400/15 text-green-200',
    dot: 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.7)]',
  },
  archived: {
    chip: 'border-white/[0.06] bg-white/[0.02] text-neutral-600',
    dot: 'bg-neutral-600',
  },
};

export function StatusBadge({ status }: { status: CardStatus }) {
  const c = COLORS[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {tr.statuses[status]}
    </span>
  );
}
