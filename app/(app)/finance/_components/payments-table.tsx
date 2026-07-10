'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { markPaid } from '@/lib/actions/finance';
import { tr } from '@/lib/i18n/tr';

/** Display-ready row — the page derives labels/format server-side. */
export interface PaymentRow {
  id: string;
  clientName: string;
  title: string;
  kindLabel: string;
  amountFmt: string;
  dueOnFmt: string;
  paidOnFmt: string | null;
  statusLabel: string;
  overdue: boolean;
  /** markPaid button visible (manager + not paid). */
  payable: boolean;
}

export function PaymentsTable({ rows }: { rows: PaymentRow[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onMarkPaid(id: string) {
    setError(null);
    startTransition(async () => {
      const res = await markPaid({ paymentId: id });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      router.refresh();
    });
  }

  if (rows.length === 0)
    return <p className="text-sm text-neutral-500">{tr.common.none}</p>;

  return (
    <div className="overflow-x-auto">
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-800 text-xs text-neutral-500">
            <th className="px-2 py-2 font-medium">{tr.card.client}</th>
            <th className="px-2 py-2 font-medium">{tr.card.title}</th>
            <th className="px-2 py-2 font-medium">{tr.card.type}</th>
            <th className="px-2 py-2 text-right font-medium">
              {tr.finance.amount}
            </th>
            <th className="px-2 py-2 font-medium">{tr.finance.dueOn}</th>
            <th className="px-2 py-2 font-medium">{tr.card.status}</th>
            <th className="px-2 py-2 font-medium">{tr.finance.paidOn}</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-neutral-800/60 ${
                row.overdue ? 'bg-red-950/30' : ''
              }`}
            >
              <td className="px-2 py-2 text-neutral-300">{row.clientName}</td>
              <td className="px-2 py-2 text-neutral-100">{row.title}</td>
              <td className="px-2 py-2 text-neutral-400">{row.kindLabel}</td>
              <td className="px-2 py-2 text-right font-medium text-neutral-100">
                {row.amountFmt}
              </td>
              <td
                className={`px-2 py-2 ${
                  row.overdue ? 'font-medium text-red-400' : 'text-neutral-400'
                }`}
              >
                {row.dueOnFmt}
              </td>
              <td className="px-2 py-2">
                <span
                  className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                    row.overdue
                      ? 'bg-red-950 text-red-300'
                      : row.paidOnFmt
                        ? 'bg-emerald-950 text-emerald-300'
                        : 'bg-neutral-800 text-neutral-300'
                  }`}
                >
                  {row.overdue ? tr.finance.overdue : row.statusLabel}
                </span>
              </td>
              <td className="px-2 py-2 text-neutral-400">
                {row.paidOnFmt ?? '—'}
              </td>
              <td className="px-2 py-2 text-right">
                {row.payable && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => onMarkPaid(row.id)}
                  >
                    {tr.finance.markPaid}
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
