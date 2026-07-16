'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button, Panel } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { transitionCardStatus } from '@/lib/actions/cards';
import {
  CARD_STATUSES,
  canTransition,
  type CardStatus,
  type Role,
} from '@/lib/status';
import { tr } from '@/lib/i18n/tr';
import type { Platform } from '@/lib/db/types';

import { ScheduleDialog, type ScheduleAccount } from './schedule-dialog';

/** Map a TransitionReason (or generic error) to a Turkish message. */
function reasonText(code: string): string {
  return (
    (tr.statusReasons as Record<string, string>)[code] ?? tr.errors.generic
  );
}

/** A far-future date used only to decide whether `scheduled` is offerable;
 * the real datetime is chosen in the dialog. */
const PROBE_FUTURE = new Date(Date.now() + 7 * 24 * 3600 * 1000);

export function StatusControls({
  cardId,
  status,
  role,
  langs,
  platforms,
  accounts,
}: {
  cardId: string;
  status: CardStatus;
  role: Role;
  langs: string[];
  platforms: string[];
  accounts: ScheduleAccount[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  // Which forward/side transitions are reachable from here (for button visibility).
  const targets = useMemo(() => {
    const out: CardStatus[] = [];
    for (const to of CARD_STATUSES) {
      if (to === status) continue;
      // `published` is service-role only; never a manual button.
      if (to === 'published') continue;
      const verdict = canTransition(role, status, to, {
        langs,
        // permissive ctx so `scheduled` shows up; real values validated later.
        scheduledAt: PROBE_FUTURE,
        platforms: platforms.length ? platforms : ['instagram'],
      });
      if (verdict.ok) out.push(to);
    }
    return out;
  }, [status, role, langs, platforms]);

  function run(to: CardStatus) {
    setError(null);
    startTransition(async () => {
      const res = await transitionCardStatus({ cardId, to });
      if (!res.ok) setError(reasonText(res.error));
      else router.refresh();
    });
  }

  function runSchedule(input: { scheduledAt: string; platforms: Platform[] }) {
    setError(null);
    startTransition(async () => {
      const res = await transitionCardStatus({
        cardId,
        to: 'scheduled',
        scheduledAt: input.scheduledAt,
        platforms: input.platforms,
      });
      if (!res.ok) {
        setError(reasonText(res.error));
      } else {
        setScheduleOpen(false);
        router.refresh();
      }
    });
  }

  // Classify targets for nicer labels/ordering.
  const isReject = (to: CardStatus) => to === 'copy_draft' && status !== 'idea';
  const forwardTargets = targets.filter(
    (to) => to !== 'archived' && to !== 'scheduled' && !isReject(to),
  );
  const canSchedule = targets.includes('scheduled');
  const rejectTarget = targets.find(isReject);
  const canArchive = targets.includes('archived');

  return (
    <Panel title={tr.card.status}>
      <div className="mb-4 border-b border-white/[0.06] pb-4">
        <StatusBadge status={status} />
      </div>

      <div className="stagger-children space-y-2">
        {forwardTargets.map((to) => (
          <Button
            key={to}
            type="button"
            variant={to === 'approved' ? 'primary' : 'secondary'}
            icon={to === 'approved' ? '✓' : undefined}
            disabled={pending}
            className="w-full"
            onClick={() => run(to)}
          >
            {to === 'approved'
              ? tr.card.approve
              : `${tr.card.moveTo}: ${tr.statuses[to]}`}
          </Button>
        ))}

        {canSchedule && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            className="w-full"
            onClick={() => setScheduleOpen(true)}
          >
            {tr.card.schedule}
          </Button>
        )}

        {rejectTarget && (
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            className="w-full"
            onClick={() => run(rejectTarget)}
          >
            {tr.card.reject}
          </Button>
        )}

        {canArchive && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            className="w-full"
            onClick={() => run('archived')}
          >
            {tr.card.archive}
          </Button>
        )}

        {forwardTargets.length === 0 &&
          !canSchedule &&
          !rejectTarget &&
          !canArchive && (
            <div className="animate-enter flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
              <span
                aria-hidden
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                🔒
              </span>
              <p className="text-xs text-neutral-500">{tr.common.none}</p>
            </div>
          )}
      </div>

      {error && (
        <p className="animate-enter mt-3 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200">
          {error}
        </p>
      )}

      <ScheduleDialog
        open={scheduleOpen}
        onClose={() => setScheduleOpen(false)}
        accounts={accounts}
        currentPlatforms={platforms}
        pending={pending}
        onSubmit={runSchedule}
      />
    </Panel>
  );
}
