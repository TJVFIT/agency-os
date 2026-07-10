import Link from 'next/link';

import { StatusBadge } from '@/components/status-badge';
import { fmtIstanbulDate } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';

/** Compact card used on board columns, dashboard queue, calendar cells.
 *  Glass tile with the client color as a left accent + soft hover lift. */
export function CardTile({
  card,
  draggableProps,
  showStatus = false,
}: {
  card: CardWithClient;
  draggableProps?: React.HTMLAttributes<HTMLDivElement>;
  showStatus?: boolean;
}) {
  const primary =
    (card.clients?.colors as { primary?: string } | null)?.primary ?? '#525252';

  return (
    <div
      {...draggableProps}
      className="group relative overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.035] p-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.06] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)]"
    >
      {/* client accent: hairline bar that brightens on hover */}
      <span
        aria-hidden
        className="absolute inset-y-2 left-0 w-[2.5px] rounded-full opacity-60 transition-opacity duration-300 group-hover:opacity-100"
        style={{ background: primary, boxShadow: `0 0 12px ${primary}66` }}
      />
      <div className="pl-2">
        <div className="mb-1 flex items-center gap-1.5">
          <span className="truncate text-xs text-neutral-500">
            {card.clients?.name ?? '—'}
          </span>
          <span className="ml-auto rounded-full border border-white/[0.06] bg-white/[0.04] px-1.5 py-px text-[10px] text-neutral-500">
            {tr.cardTypes[card.type]}
          </span>
        </div>
        <Link
          href={`/cards/${card.id}`}
          className="block font-medium leading-snug text-neutral-100 transition-colors duration-300 group-hover:text-white"
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
    </div>
  );
}
