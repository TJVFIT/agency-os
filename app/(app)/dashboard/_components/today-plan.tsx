import Link from 'next/link';

import { fmtIstanbulDate, fmtIstanbulTime } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';

export interface TodayShootItem {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  clientName: string | null;
}

/**
 * Bugünün planı (UPGRADE_SPEC §6): the signed-in user's cards due today or
 * overdue plus today's shoots where they are in the crew. Compact, link-first.
 * `overdueBefore` = start of today (Istanbul) as ISO — anything due earlier
 * is overdue; keeping the clock out of render keeps the component pure.
 */
export function TodayPlan({
  cards,
  shoots,
  overdueBefore,
}: {
  cards: CardWithClient[];
  shoots: TodayShootItem[];
  overdueBefore: string;
}) {
  if (cards.length === 0 && shoots.length === 0) {
    return (
      <p className="text-sm text-neutral-500">{tr.dashboard.myQueueEmpty}</p>
    );
  }

  const overdueCutoff = new Date(overdueBefore).getTime();

  return (
    <div className="flex flex-col gap-4">
      {cards.length > 0 && (
        <ul className="space-y-1.5">
          {cards.map((card) => {
            const overdue =
              card.due_at != null &&
              new Date(card.due_at).getTime() < overdueCutoff;
            return (
              <li key={card.id} className="flex items-center gap-2 text-sm">
                <Link
                  href={`/cards/${card.id}`}
                  className="truncate text-neutral-100 hover:underline"
                >
                  {card.title}
                </Link>
                <span className="truncate text-xs text-neutral-500">
                  {card.clients?.name ?? '—'}
                </span>
                {card.due_at && (
                  <span
                    className={`ml-auto shrink-0 text-xs ${
                      overdue ? 'text-red-400' : 'text-neutral-500'
                    }`}
                  >
                    ⏱ {fmtIstanbulDate(card.due_at)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {shoots.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {tr.production.shoots}
          </h3>
          <ul className="space-y-1.5">
            {shoots.map((shoot) => (
              <li key={shoot.id} className="flex items-center gap-2 text-sm">
                <Link
                  href="/production"
                  className="truncate text-neutral-100 hover:underline"
                >
                  {shoot.title}
                </Link>
                <span className="truncate text-xs text-neutral-500">
                  {shoot.clientName ?? '—'}
                </span>
                <span className="ml-auto shrink-0 text-xs text-neutral-500">
                  {fmtIstanbulTime(shoot.starts_at)}–
                  {fmtIstanbulTime(shoot.ends_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
