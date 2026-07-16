'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { rebalanceWorkload } from '@/lib/actions/workload';
import type { MemberWorkload, WorkloadLevel } from '@/lib/workload';
import { interpolate, tr } from '@/lib/i18n/tr';

import { EmptyState, InlineError } from './ui-bits';

const LEVEL_LABEL: Record<WorkloadLevel, string> = {
  over: tr.workload.over,
  balanced: tr.workload.balanced,
  idle: tr.workload.idle,
};

const LEVEL_CHIP: Record<WorkloadLevel, string> = {
  over: 'border-red-500/25 bg-red-500/[0.08] text-red-200',
  balanced: 'border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200',
  idle: 'border-white/[0.08] bg-white/[0.04] text-neutral-400',
};

const LEVEL_BAR: Record<WorkloadLevel, string> = {
  over: 'bg-red-400/80 shadow-[0_0_10px_rgba(248,113,113,0.4)]',
  balanced: 'bg-emerald-400/70',
  idle: 'bg-neutral-500/70',
};

/**
 * "İş yükü" dashboard panel (v4): one bar per member (open-card points +
 * upcoming shoot duty, computed server-side by lib/workload), with a
 * manager-only quick action that writes ranked transfer suggestions into the
 * Öneriler inbox — suggestion-first, no card moves without a human accept.
 */
export function WorkloadPanel({
  workloads,
  canRebalance,
}: {
  workloads: MemberWorkload[];
  canRebalance: boolean;
}) {
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const maxPoints = Math.max(1, ...workloads.map((w) => w.points));
  const hasWork = workloads.some((w) => w.points > 0);

  function rebalance() {
    setError(null);
    setResult(null);
    start(async () => {
      const res = await rebalanceWorkload();
      if (res.ok) setResult(res.data?.created ?? 0);
      else setError(tr.errors.generic);
    });
  }

  return (
    <div className="space-y-3">
      {!hasWork ? (
        <EmptyState icon="💤" text={tr.workload.empty} />
      ) : (
        <ul className="stagger-children space-y-2.5">
          {workloads.map((member) => (
            <li key={member.id}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-sm text-neutral-100">
                  {member.name}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs tabular-nums text-neutral-400">
                    {member.points} {tr.workload.points}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${LEVEL_CHIP[member.level]}`}
                  >
                    {LEVEL_LABEL[member.level]}
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${LEVEL_BAR[member.level]}`}
                  style={{
                    width: `${Math.round((member.points / maxPoints) * 100)}%`,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {canRebalance && (
        <div className="border-t border-white/[0.06] pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !hasWork}
              onClick={rebalance}
              className="!px-2.5 !py-1 !text-xs"
            >
              {pending ? tr.common.processing : tr.workload.rebalance}
            </Button>
            {result !== null && (
              <span className="inline-flex items-center rounded-full border border-emerald-400/20 bg-emerald-400/[0.06] px-2 py-0.5 text-[11px] tabular-nums text-emerald-300">
                {interpolate(tr.workload.rebalanceDone, { count: result })}
              </span>
            )}
            {error && <InlineError text={error} />}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-neutral-500">
            {tr.workload.rebalanceHint}
          </p>
        </div>
      )}
    </div>
  );
}
