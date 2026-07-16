import Link from 'next/link';

import { fmtIstanbulDate, fmtIstanbulTime } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';

import { EmptyState, SectionLabel } from './ui-bits';

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
      <EmptyState icon="✓" tone="emerald" text={tr.dashboard.myQueueEmpty} />
    );
  }

  const overdueCutoff = new Date(overdueBefore).getTime();

  return (
    <div className="flex flex-col gap-4">
      {cards.length > 0 && (
        <ul className="stagger-children space-y-2">
          {cards.map((card) => {
            const overdue =
              card.due_at != null &&
              new Date(card.due_at).getTime() < overdueCutoff;
            return (
              <li
                key={card.id}
                className="group flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.05] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.7)]"
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105 ${
                    overdue
                      ? 'border-red-500/25 bg-red-500/[0.08] text-red-300'
                      : 'border-white/[0.08] bg-white/[0.04]'
                  }`}
                >
                  ⏱
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/cards/${card.id}`}
                    className="block truncate text-sm font-medium leading-snug text-neutral-100 hover:underline"
                  >
                    {card.title}
                  </Link>
                  <span className="block text-xs text-neutral-500">
                    {card.clients?.name ?? '—'}
                  </span>
                </span>
                {card.due_at && (
                  <span
                    className={`ml-auto shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${
                      overdue
                        ? 'border-red-500/25 bg-red-500/[0.08] text-red-300'
                        : 'border-white/[0.08] bg-white/[0.04] text-neutral-400'
                    }`}
                  >
                    {fmtIstanbulDate(card.due_at)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {shoots.length > 0 && (
        <div
          className={
            cards.length > 0 ? 'border-t border-white/[0.06] pt-4' : undefined
          }
        >
          <SectionLabel count={shoots.length}>
            {tr.production.shoots}
          </SectionLabel>
          <ul className="stagger-children space-y-2">
            {shoots.map((shoot) => (
              <li
                key={shoot.id}
                className="group flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.05] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.7)]"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[13px] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105"
                >
                  🎬
                </span>
                <span className="min-w-0 flex-1">
                  <Link
                    href="/production"
                    className="block truncate text-sm font-medium leading-snug text-neutral-100 hover:underline"
                  >
                    {shoot.title}
                  </Link>
                  <span className="block text-xs text-neutral-500">
                    {shoot.clientName ?? '—'}
                  </span>
                </span>
                <span className="ml-auto shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium tabular-nums text-neutral-400">
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
