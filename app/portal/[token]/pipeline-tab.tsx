'use client';

import { tr } from '@/lib/i18n/tr';
import { fmtIstanbul } from '@/lib/dates';
import type { PortalPipelineCard } from '@/lib/portal/service';
import { EmptyState, ROW, SectionLabel } from './glass';

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

/** Tiny status dot next to each group label — same tint as the chip. */
const STATUS_DOT: Record<string, string> = {
  idea: 'bg-neutral-500',
  copy_draft: 'bg-neutral-400',
  visual_ready: 'bg-amber-300',
  translated: 'bg-amber-300',
  approved: 'bg-emerald-300',
  scheduled: 'bg-sky-300',
  published: 'bg-violet-300',
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
    return <EmptyState icon="🗂️" text={tr.portal.pipelineEmpty} />;
  }

  const ordered = STATUS_ORDER.map((status) => ({
    status,
    items: cards.filter((c) => c.status === status),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      {ordered.map((group) => (
        <section key={group.status}>
          <SectionLabel count={group.items.length}>
            <span
              aria-hidden
              className={`size-1.5 self-center rounded-full ${STATUS_DOT[group.status] ?? STATUS_DOT.idea}`}
            />
            {tr.statuses[group.status as keyof typeof tr.statuses]}
          </SectionLabel>
          <ul className="stagger-children space-y-2">
            {group.items.map((card) => (
              <li
                key={card.id}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 ${ROW}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {card.title}
                  </p>
                  {card.scheduledAt && (
                    <p className="text-[11px] tabular-nums text-neutral-500">
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
