'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Input } from '@/components/ui';
import { setAdResults, transitionAdTask } from '@/lib/actions/finance';
import type { AdTask, Platform } from '@/lib/db/types';
import { tr } from '@/lib/i18n/tr';

import { AdDialog } from './ad-dialog';

type AdStatus = AdTask['status'];

const STATUS_ORDER: AdStatus[] = ['planned', 'active', 'done', 'cancelled'];

/** Button labels per target status — closest existing keys (see report). */
const TRANSITION_LABELS: Record<Exclude<AdStatus, 'planned'>, string> = {
  active: tr.finance.adStatuses.active,
  done: tr.production.markDone,
  cancelled: tr.finance.adStatuses.cancelled,
};

export interface AdRow {
  id: string;
  clientName: string;
  platform: Platform;
  objective: string;
  budget: number;
  budgetFmt: string;
  startsOn: string | null;
  endsOn: string | null;
  datesFmt: string | null;
  status: AdStatus;
  results: { reach?: number; clicks?: number; spend?: number; note?: string };
  /** Allowed next statuses (AD_TRANSITIONS, computed server-side). */
  next: AdStatus[];
}

export function AdsBoard({
  ads,
  isManager,
}: {
  ads: AdRow[];
  isManager: boolean;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {STATUS_ORDER.map((status) => {
        const group = ads.filter((a) => a.status === status);
        return (
          <section key={status}>
            <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              {tr.finance.adStatuses[status]}
              <span className="rounded-full bg-neutral-800 px-1.5 text-[11px] text-neutral-400">
                {group.length}
              </span>
            </h3>
            <div className="space-y-2">
              {group.length === 0 && (
                <p className="text-xs text-neutral-600">{tr.common.none}</p>
              )}
              {group.map((ad) => (
                <AdCard key={ad.id} ad={ad} isManager={isManager} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AdCard({ ad, isManager }: { ad: AdRow; isManager: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onTransition(to: AdStatus) {
    if (to === 'planned') return;
    setError(null);
    startTransition(async () => {
      const res = await transitionAdTask({ adTaskId: ad.id, to });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      router.refresh();
    });
  }

  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-neutral-100">
            {tr.platforms[ad.platform]}
          </p>
          <p className="text-xs text-neutral-400">{ad.clientName}</p>
        </div>
        {isManager && (
          <AdDialog
            clients={[]}
            ad={{
              id: ad.id,
              platform: ad.platform,
              objective: ad.objective,
              budget: ad.budget,
              startsOn: ad.startsOn,
              endsOn: ad.endsOn,
            }}
          />
        )}
      </div>
      {ad.objective && (
        <p className="mt-1.5 text-xs text-neutral-300">{ad.objective}</p>
      )}
      <p className="mt-1.5 text-xs text-neutral-400">
        {tr.finance.budget}:{' '}
        <span className="text-neutral-200">{ad.budgetFmt}</span>
      </p>
      {ad.datesFmt && (
        <p className="mt-0.5 text-xs text-neutral-500">{ad.datesFmt}</p>
      )}

      {ad.status === 'done' && (
        <ResultsMiniForm ad={ad} isManager={isManager} />
      )}

      {isManager && ad.next.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ad.next.map((to) => (
            <Button
              key={to}
              variant={to === 'cancelled' ? 'danger' : 'secondary'}
              disabled={pending}
              onClick={() => onTransition(to)}
              className="px-2 py-1 text-xs"
            >
              {to === 'planned' ? '' : TRANSITION_LABELS[to]}
            </Button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </article>
  );
}

/**
 * Results entry on done tasks: {reach, clicks, spend, note}. Field labels use
 * the closest existing tr keys — dedicated keys flagged in the module report.
 */
const RESULT_FIELDS = [
  { key: 'reach', label: tr.clients.metrics },
  { key: 'clicks', label: tr.finance.results },
  { key: 'spend', label: tr.finance.amount },
] as const;

function ResultsMiniForm({ ad, isManager }: { ad: AdRow; isManager: boolean }) {
  const [values, setValues] = useState({
    reach: ad.results.reach?.toString() ?? '',
    clicks: ad.results.clicks?.toString() ?? '',
    spend: ad.results.spend?.toString() ?? '',
    note: ad.results.note ?? '',
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!isManager) {
    const entries = RESULT_FIELDS.filter((f) => values[f.key] !== '');
    if (entries.length === 0 && !values.note) return null;
    return (
      <div className="mt-2 rounded-md border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-400">
        <p className="mb-1 font-medium text-neutral-300">
          {tr.finance.results}
        </p>
        {entries.map((f) => (
          <p key={f.key}>
            {f.label}: {values[f.key]}
          </p>
        ))}
        {values.note && <p>{values.note}</p>}
      </div>
    );
  }

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await setAdResults({
        adTaskId: ad.id,
        results: {
          ...(values.reach !== '' && { reach: Number(values.reach) }),
          ...(values.clicks !== '' && { clicks: Number(values.clicks) }),
          ...(values.spend !== '' && { spend: Number(values.spend) }),
          ...(values.note.trim() !== '' && { note: values.note.trim() }),
        },
      });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 rounded-md border border-neutral-800 bg-neutral-950 p-2">
      <p className="mb-1.5 text-xs font-medium text-neutral-300">
        {tr.finance.results}
      </p>
      <div className="grid grid-cols-3 gap-1.5">
        {RESULT_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-0.5 block text-[10px] text-neutral-500">
              {f.label}
            </span>
            <Input
              type="number"
              min={0}
              value={values[f.key]}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
              className="px-1.5 py-1 text-xs"
            />
          </label>
        ))}
      </div>
      <Input
        value={values.note}
        onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
        placeholder={tr.portal.availabilityNote}
        maxLength={500}
        className="mt-1.5 px-1.5 py-1 text-xs"
      />
      <div className="mt-1.5 flex items-center justify-end gap-2">
        {saved && (
          <span className="text-xs text-emerald-400">{tr.common.saved}</span>
        )}
        {error && <span className="text-xs text-red-400">{error}</span>}
        <Button
          variant="secondary"
          disabled={pending}
          onClick={onSave}
          className="px-2 py-1 text-xs"
        >
          {pending ? tr.common.loading : tr.common.save}
        </Button>
      </div>
    </div>
  );
}
