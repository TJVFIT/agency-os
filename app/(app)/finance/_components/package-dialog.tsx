'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Label, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import {
  createPackage,
  deactivatePackage,
  updatePackage,
} from '@/lib/actions/finance';
import { tr } from '@/lib/i18n/tr';

const QUOTA_FIELDS = [
  { key: 'post', label: tr.cardTypes.post },
  { key: 'reel', label: tr.cardTypes.reel },
  { key: 'story', label: tr.cardTypes.story },
  { key: 'shoot', label: tr.production.shoots },
] as const;
type QuotaKey = (typeof QUOTA_FIELDS)[number]['key'];
type Quota = Record<QuotaKey, number>;

export interface PackageFormValues {
  id: string;
  clientId: string;
  name: string;
  price: number;
  monthly: Quota;
  active: boolean;
}

export function PackageDialog({
  clients,
  pkg,
}: {
  clients: Array<{ id: string; name: string }>;
  /** Present = edit mode (with deactivate); absent = create. */
  pkg?: PackageFormValues;
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(pkg?.clientId ?? '');
  const [name, setName] = useState(pkg?.name ?? '');
  const [price, setPrice] = useState(pkg ? String(pkg.price) : '');
  const [quota, setQuota] = useState<Quota>(
    pkg?.monthly ?? { post: 0, reel: 0, story: 0, shoot: 0 },
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function setQuotaField(key: QuotaKey, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    setQuota((prev) => ({ ...prev, [key]: n }));
  }

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const res = pkg
        ? await updatePackage({
            packageId: pkg.id,
            name: name.trim(),
            monthly: quota,
            price: Number(price) || 0,
          })
        : await createPackage({
            clientId,
            name: name.trim(),
            monthly: quota,
            price: Number(price) || 0,
          });
      if (!res.ok) {
        setError(
          res.error === 'validation' ? tr.errors.validation : tr.errors.generic,
        );
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function onDeactivate() {
    if (!pkg) return;
    setError(null);
    startTransition(async () => {
      const res = await deactivatePackage({ packageId: pkg.id });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {pkg ? (
        <Button variant="ghost" onClick={() => setOpen(true)}>
          {tr.common.edit}
        </Button>
      ) : (
        <Button variant="primary" onClick={() => setOpen(true)}>
          {tr.finance.newPackage}
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={pkg ? tr.common.edit : tr.finance.newPackage}
      >
        <form action={onSubmit} className="space-y-3">
          {!pkg && (
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
          <Field label={tr.finance.packageName}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              autoFocus={!pkg}
            />
          </Field>
          <Field label={tr.finance.price}>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </Field>
          <div>
            <Label>{tr.finance.quota}</Label>
            <div className="grid grid-cols-2 gap-2">
              {QUOTA_FIELDS.map((f) => (
                <label key={f.key} className="block">
                  <span className="mb-0.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                    {f.label}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    value={quota[f.key]}
                    onChange={(e) => setQuotaField(f.key, e.target.value)}
                    className="tabular-nums"
                  />
                </label>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-red-300">{error}</p>}
          <div className="flex items-center justify-between gap-2 pt-1">
            <div>
              {pkg?.active && (
                <Button type="button" variant="danger" onClick={onDeactivate}>
                  {tr.common.remove}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
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
                disabled={pending || !name.trim() || (!pkg && !clientId)}
              >
                {pending
                  ? tr.common.loading
                  : pkg
                    ? tr.common.save
                    : tr.common.create}
              </Button>
            </div>
          </div>
        </form>
      </Dialog>
    </>
  );
}
