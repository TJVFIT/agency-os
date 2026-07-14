'use client';

import { tr } from '@/lib/i18n/tr';
import { fmtIstanbul } from '@/lib/dates';
import type { PortalPipelineCard } from '@/lib/portal/service';

/** Client-facing status order — internal statuses grouped for readability. */
const STATUS_ORDER = [
  'scheduled',
  'approved',
  'translated',
  'visual_ready',
  'copy_draft',
  'idea',
  'published',
] as const;

const STATUS_CHIP: Record<string, string> = {
  idea: 'border-white/10 bg-white/[0.05] text-neutral-300',
  copy_draft: 'border-white/10 bg-white/[0.05] text-neutral-300',
  visual_ready: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  translated: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
  approved: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  scheduled: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
  published: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
};

const TYPE_LABEL: Record<string, string> = {
  post: 'Post',
  reel: 'Reels',
  story: 'Hikâye',
  reply: 'Yanıt',
  other: 'Diğer',
};

/** Durum tab — read-only pipeline view of the client's own content. */
export function PipelineTab({ cards }: { cards: PortalPipelineCard[] }) {
  if (cards.length === 0) {
    return (
      <p className="animate-enter rounded-xl border border-white/[0.07] bg-white/[0.03] p-6 text-center text-sm text-neutral-400">
        {tr.portal.pipelineEmpty}
      </p>
    );
  }

  const ordered = STATUS_ORDER.map((status) => ({
    status,
    items: cards.filter((c) => c.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {ordered.map((group) => (
        <section key={group.status}>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            {tr.statuses[group.status as keyof typeof tr.statuses]}
            <span className="ml-1.5 tabular-nums text-neutral-600">
              {group.items.length}
            </span>
          </h3>
          <ul className="stagger-children space-y-2">
            {group.items.map((card) => (
              <li
                key={card.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {card.title}
                  </p>
                  {card.scheduledAt && (
                    <p className="text-[11px] text-neutral-500">
                      {tr.portal.pipelineScheduled}:{' '}
                      {fmtIstanbul(card.scheduledAt, 'dd.MM.yyyy HH:mm')}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[card.status] ?? STATUS_CHIP.idea}`}
                >
                  {TYPE_LABEL[card.type] ?? card.type}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
