'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { createPayment } from '@/lib/actions/finance';
import { tr } from '@/lib/i18n/tr';

export function PaymentDialog({
  clients,
}: {
  clients: Array<{ id: string; name: string }>;
}) {
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [extra, setExtra] = useState(false); // kind toggle: package | extra
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function reset() {
    setClientId('');
    setTitle('');
    setAmount('');
    setDueOn('');
    setExtra(false);
    setNote('');
    setError(null);
  }

  function onSubmit() {
    setError(null);
    startTransition(async () => {
      const res = await createPayment({
        clientId,
        kind: extra ? 'extra' : 'package',
        title: title.trim(),
        amount: Number(amount),
        dueOn,
        note: note.trim(),
      });
      if (!res.ok) {
        setError(
          res.error === 'validation' ? tr.errors.validation : tr.errors.generic,
        );
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {tr.finance.newPayment}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr.finance.newPayment}
      >
        <form action={onSubmit} className="space-y-3">
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
          <Field label={tr.card.title}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={tr.finance.amount}>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label={tr.finance.dueOn}>
              <Input
                type="date"
                value={dueOn}
                onChange={(e) => setDueOn(e.target.value)}
                required
              />
            </Field>
          </div>
          <button
            type="button"
            onClick={() => setExtra((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
              extra
                ? 'border-neutral-400 bg-neutral-800 text-neutral-100'
                : 'border-neutral-700 bg-neutral-950 text-neutral-500'
            }`}
          >
            {tr.finance.extraWork}
          </button>
          <Field label={tr.portal.availabilityNote}>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
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
              disabled={
                pending ||
                !clientId ||
                !title.trim() ||
                !dueOn ||
                !(Number(amount) > 0)
              }
            >
              {pending ? tr.common.loading : tr.common.create}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
