import { tr } from '@/lib/i18n/tr';
import type { CardStatus } from '@/lib/status';

const COLORS: Record<CardStatus, string> = {
  idea: 'bg-neutral-800 text-neutral-300',
  copy_draft: 'bg-amber-950 text-amber-300',
  visual_ready: 'bg-sky-950 text-sky-300',
  translated: 'bg-indigo-950 text-indigo-300',
  approved: 'bg-emerald-950 text-emerald-300',
  scheduled: 'bg-violet-950 text-violet-300',
  published: 'bg-green-900 text-green-200',
  archived: 'bg-neutral-900 text-neutral-500',
};

export function StatusBadge({ status }: { status: CardStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${COLORS[status]}`}
    >
      {tr.statuses[status]}
    </span>
  );
}
