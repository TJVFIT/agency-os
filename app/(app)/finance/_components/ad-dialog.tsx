'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { createAdTask, updateAdTask } from '@/lib/actions/finance';
import { PLATFORMS, type Platform } from '@/lib/db/types';
import { tr } from '@/lib/i18n/tr';

export interface AdFormValues {
  id: string;
  platform: Platform;
  objective: string;
  budget: number;
  startsOn: string | null;
  endsOn: string | null;
}

export function AdDialog({
  clients,
  ad,
  onDone,
}: {
  clients: Array<{ id: string; name: string }>;
  /** Present = edit mode; absent = create. */
  ad?: AdFormValues;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [platform, setPlatform] = useState<Platform>(
    ad?.platform ?? 'instagram',
  );
  const [objective, setObjective] = useState(ad?.objective ?? '');
  const [budget, setBudget] = useState(ad ? String(ad.budget) : '');
  const [startsOn, setStartsOn] = useState(ad?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(ad?.endsOn ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const res = ad
        ? await updateAdTask({
            adTaskId: ad.id,
            platform,
            objective: objective.trim(),
            budget: Number(budget) || 0,
            startsOn: startsOn || null,
            endsOn: endsOn || null,
          })
        : await createAdTask({
            clientId,
            platform,
            objective: objective.trim(),
            budget: Number(budget) || 0,
            startsOn: startsOn || null,
            endsOn: endsOn || null,
          });
      if (!res.ok) {
        setError(
          res.error === 'validation' ? tr.errors.validation : tr.errors.generic,
        );
        return;
      }
      setOpen(false);
      onDone?.();
      router.refresh();
    });
  }

  return (
    <>
      {ad ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {tr.common.edit}
        </Button>
      ) : (
        <Button variant="primary" onClick={() => setOpen(true)}>
          {tr.finance.newAd}
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={ad ? tr.common.edit : tr.finance.newAd}
      >
        <form action={onSubmit} className="space-y-3">
          {!ad && (
            <Field label={tr.card.client}>
              <Select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="w-full"
              >
                <option value="" disabled>
                  —
                </option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={tr.clients.platform}>
            <Select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="w-full"
            >
              {PLATFORMS.map((p) => (
                <option key={p} value={p}>
                  {tr.platforms[p]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.finance.objective}>
            <Input
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              maxLength={300}
            />
          </Field>
          <Field label={tr.finance.budget}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr.production.leaveStart}>
              <Input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </Field>
            <Field label={tr.production.leaveEnd}>
              <Input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                min={startsOn || undefined}
              />
            </Field>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {tr.common.cancel}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={pending || (!ad && !clientId)}
            >
              {pending
                ? tr.common.loading
                : ad
                  ? tr.common.save
                  : tr.common.create}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
