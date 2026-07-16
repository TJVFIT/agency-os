'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { markPaid } from '@/lib/actions/finance';
import { tr } from '@/lib/i18n/tr';

import { EmptyState } from './empty-state';
import { GlassChip } from './glass-chip';

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
    return <EmptyState icon="💸" text={tr.demo.noPayments} className="py-10" />;

  return (
    <div className="overflow-x-auto">
      {error && (
        <p className="mb-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      )}
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/[0.06] text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            <th className="whitespace-nowrap px-2 py-2">{tr.card.client}</th>
            <th className="whitespace-nowrap px-2 py-2">{tr.card.title}</th>
            <th className="whitespace-nowrap px-2 py-2">{tr.card.type}</th>
            <th className="whitespace-nowrap px-2 py-2 text-right">
              {tr.finance.amount}
            </th>
            <th className="whitespace-nowrap px-2 py-2">{tr.finance.dueOn}</th>
            <th className="whitespace-nowrap px-2 py-2">{tr.card.status}</th>
            <th className="whitespace-nowrap px-2 py-2">{tr.finance.paidOn}</th>
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody className="stagger-children">
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`border-b border-white/[0.04] transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] last:border-0 ${
                row.overdue ? 'bg-red-400/[0.06]' : 'hover:bg-white/[0.03]'
              }`}
            >
              <td className="px-2 py-2.5 text-neutral-300">{row.clientName}</td>
              <td className="px-2 py-2.5 font-medium text-neutral-100">
                {row.title}
              </td>
              <td className="px-2 py-2.5 text-neutral-400">{row.kindLabel}</td>
              <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono font-medium tabular-nums text-neutral-100">
                {row.amountFmt}
              </td>
              <td
                className={`whitespace-nowrap px-2 py-2.5 tabular-nums ${
                  row.overdue ? 'font-medium text-amber-300' : 'text-neutral-400'
                }`}
              >
                {row.dueOnFmt}
              </td>
              <td className="px-2 py-2.5">
                {row.overdue ? (
                  <GlassChip tone="red">{tr.finance.overdue}</GlassChip>
                ) : row.paidOnFmt ? (
                  <GlassChip tone="green">{row.statusLabel}</GlassChip>
                ) : (
                  <GlassChip tone="neutral">{row.statusLabel}</GlassChip>
                )}
              </td>
              <td className="whitespace-nowrap px-2 py-2.5 tabular-nums text-neutral-400">
                {row.paidOnFmt ?? '—'}
              </td>
              <td className="px-2 py-2.5 text-right">
                {row.payable && (
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => onMarkPaid(row.id)}
                    className="px-2.5 py-1 text-xs"
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
