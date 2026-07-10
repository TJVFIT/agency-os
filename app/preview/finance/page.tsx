'use client';

/**
 * /preview/finance — static demo of the finance module (no backend).
 * Paketler / Ödemeler / Reklamlar sections; the "Ödendi işaretle" button
 * flips a payment to paid purely in local state.
 */

import { useState } from 'react';

import { Button, Panel, PageHeader } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';

import { DEMO_ADS, DEMO_PACKAGES, DEMO_PAYMENTS } from '../_demo/data';

// --- Shared glass chip ------------------------------------------------------

function GlassChip({
  tone,
  children,
}: {
  tone: 'neutral' | 'green' | 'red' | 'sky' | 'violet';
  children: React.ReactNode;
}) {
  const tones = {
    neutral: {
      chip: 'border-white/10 bg-white/[0.05] text-neutral-300',
      dot: 'bg-neutral-400',
    },
    green: {
      chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
      dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
    },
    red: {
      chip: 'border-red-400/25 bg-red-400/10 text-red-200',
      dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]',
    },
    sky: {
      chip: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
      dot: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]',
    },
    violet: {
      chip: 'border-violet-400/20 bg-violet-400/10 text-violet-200',
      dot: 'bg-violet-400 shadow-[0_0_8px_rgba(167,139,250,0.6)]',
    },
  } as const;
  const c = tones[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {children}
    </span>
  );
}

// --- Paketler -----------------------------------------------------------------

function QuotaBar({
  label,
  used,
  quota,
}: {
  label: string;
  used: number;
  quota: number;
}) {
  const over = used >= quota;
  const pct = Math.min((used / quota) * 100, 100);
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-neutral-400">{label}</span>
        <span
          className={over ? 'font-medium text-red-300' : 'text-neutral-400'}
        >
          {used}/{quota}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            over
              ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]'
              : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PackagesSection() {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {tr.finance.packages}
      </h2>
      <div className="stagger-children grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {DEMO_PACKAGES.map((pkg) => (
          <Panel key={pkg.client} title={pkg.client}>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-sm font-medium text-neutral-100">
                {pkg.name}
              </span>
              <span className="font-mono text-sm text-neutral-300">
                {pkg.price}
              </span>
            </div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
              {tr.finance.quotaUsage}
            </p>
            <div className="space-y-2">
              {pkg.quotas.map((q) => (
                <QuotaBar
                  key={q.label}
                  label={q.label}
                  used={q.used}
                  quota={q.quota}
                />
              ))}
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

// --- Ödemeler ------------------------------------------------------------------

type PaymentStatus = 'pending' | 'paid' | 'overdue';

interface PaymentItem {
  id: string;
  client: string;
  title: string;
  amount: string;
  dueOn: string;
  status: PaymentStatus;
}

const INITIAL_PAYMENTS: PaymentItem[] = DEMO_PAYMENTS.map((p, i) => ({
  id: `p-${i}`,
  ...p,
}));

function PaymentsSection() {
  const [payments, setPayments] = useState<PaymentItem[]>(INITIAL_PAYMENTS);

  function markPaid(id: string) {
    setPayments((rows) =>
      rows.map((r) => (r.id === id ? { ...r, status: 'paid' } : r)),
    );
  }

  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {tr.finance.payments}
      </h2>
      <Panel className="animate-enter">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-neutral-500">
                <th className="px-2 py-2 font-medium">{tr.card.client}</th>
                <th className="px-2 py-2 font-medium">{tr.card.title}</th>
                <th className="px-2 py-2 text-right font-medium">
                  {tr.finance.amount}
                </th>
                <th className="px-2 py-2 font-medium">{tr.finance.dueOn}</th>
                <th className="px-2 py-2 font-medium">{tr.card.status}</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="stagger-children">
              {payments.map((row) => {
                const overdue = row.status === 'overdue';
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-white/[0.04] transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] last:border-0 ${
                      overdue ? 'bg-red-400/[0.06]' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <td className="px-2 py-2 text-neutral-300">{row.client}</td>
                    <td className="px-2 py-2 text-neutral-100">{row.title}</td>
                    <td className="px-2 py-2 text-right font-mono font-medium text-neutral-100">
                      {row.amount}
                    </td>
                    <td
                      className={`px-2 py-2 ${
                        overdue
                          ? 'font-medium text-red-300'
                          : 'text-neutral-400'
                      }`}
                    >
                      {row.dueOn}
                    </td>
                    <td className="px-2 py-2">
                      {row.status === 'overdue' && (
                        <GlassChip tone="red">{tr.finance.overdue}</GlassChip>
                      )}
                      {row.status === 'paid' && (
                        <GlassChip tone="green">
                          {tr.finance.paymentStatuses.paid}
                        </GlassChip>
                      )}
                      {row.status === 'pending' && (
                        <GlassChip tone="neutral">
                          {tr.finance.paymentStatuses.pending}
                        </GlassChip>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {row.status === 'pending' && (
                        <Button
                          variant="secondary"
                          onClick={() => markPaid(row.id)}
                          className="px-2.5 py-1 text-xs"
                        >
                          {tr.finance.markPaid}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

// --- Reklamlar -----------------------------------------------------------------

/** Demo-only metric labels for the results row (mirrors DEMO_ADS.results). */
const RESULT_LABELS = { reach: 'Erişim', clicks: 'Tıklama' } as const;

const PLATFORM_CHIP: Record<string, string> = {
  instagram: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200',
  tiktok: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
};

function AdsSection() {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {tr.finance.ads}
      </h2>

      <div className="animate-enter mb-3 rounded-xl border border-indigo-300/20 bg-indigo-400/[0.07] px-3 py-2 text-xs leading-relaxed text-indigo-200/90">
        {tr.finance.apiNote}
      </div>

      <div className="stagger-children grid gap-3 md:grid-cols-2">
        {DEMO_ADS.map((ad) => (
          <Panel key={`${ad.client}-${ad.platform}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                    PLATFORM_CHIP[ad.platform] ??
                    'border-white/10 bg-white/[0.05] text-neutral-300'
                  }`}
                >
                  {tr.platforms[ad.platform as keyof typeof tr.platforms]}
                </span>
                <span className="text-sm font-medium text-neutral-100">
                  {ad.client}
                </span>
              </div>
              <GlassChip tone={ad.status === 'active' ? 'green' : 'neutral'}>
                {tr.finance.adStatuses[ad.status]}
              </GlassChip>
            </div>

            <p className="mt-2 text-sm text-neutral-300">{ad.objective}</p>

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
              <span>
                {tr.finance.budget}:{' '}
                <span className="font-mono text-neutral-200">{ad.budget}</span>
              </span>
              <span className="text-neutral-400">{ad.dates}</span>
            </div>

            {ad.results && (
              <div className="mt-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                  {tr.finance.results}
                </p>
                <div className="flex gap-6">
                  <div>
                    <p className="font-mono text-sm font-medium text-neutral-100">
                      {ad.results.reach}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {RESULT_LABELS.reach}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-sm font-medium text-neutral-100">
                      {ad.results.clicks}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      {RESULT_LABELS.clicks}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Panel>
        ))}
      </div>
    </section>
  );
}

// --- Page ----------------------------------------------------------------------

export default function PreviewFinancePage() {
  return (
    <div>
      <PageHeader title={tr.finance.title} />
      <div className="space-y-6">
        <PackagesSection />
        <PaymentsSection />
        <AdsSection />
      </div>
    </div>
  );
}
