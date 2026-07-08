import Link from 'next/link';

import { StatusBadge } from '@/components/status-badge';
import { fmtIstanbulDate } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';

/** Compact card used on board columns, dashboard queue, calendar cells. */
export function CardTile({
  card,
  draggableProps,
  showStatus = false,
}: {
  card: CardWithClient;
  draggableProps?: React.HTMLAttributes<HTMLDivElement>;
  showStatus?: boolean;
}) {
  const primary = (card.clients?.colors as { primary?: string } | null)
    ?.primary;

  return (
    <div
      {...draggableProps}
      className="group rounded-lg border border-neutral-800 bg-neutral-900 p-2.5 text-sm shadow-sm hover:border-neutral-600"
    >
      <div className="mb-1 flex items-center gap-1.5">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ background: primary || '#525252' }}
        />
        <span className="truncate text-xs text-neutral-500">
          {card.clients?.name ?? '—'}
        </span>
        <span className="ml-auto text-xs text-neutral-600">
          {tr.cardTypes[card.type]}
        </span>
      </div>
      <Link
        href={`/cards/${card.id}`}
        className="block font-medium text-neutral-100 hover:underline"
      >
        {card.title}
      </Link>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
        {showStatus && <StatusBadge status={card.status} />}
        {card.due_at && <span>⏱ {fmtIstanbulDate(card.due_at)}</span>}
        {card.scheduled_at && (
          <span>📅 {fmtIstanbulDate(card.scheduled_at)}</span>
        )}
      </div>
    </div>
  );
}
