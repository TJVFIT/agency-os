import Link from 'next/link';

import { Label, PageHeader, Panel } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { fmtIstanbulDate, istanbulDateString } from '@/lib/dates';
import { listClients } from '@/lib/db/queries';
import {
  AD_TRANSITIONS,
  compareQuota,
  emptyUsage,
  fmtMoney,
  isPaymentOverdue,
  listAdTasksWithClients,
  listPackagesWithClients,
  listPaymentsWithClients,
  monthlyUsage,
  parseAdResults,
  parseMonthlyQuota,
  sweepOverduePayments,
  QUOTA_TYPES,
} from '@/lib/finance';
import { tr } from '@/lib/i18n/tr';

import { AdDialog } from './_components/ad-dialog';
import { AdsBoard, type AdRow } from './_components/ads-board';
import { GlassChip } from './_components/glass-chip';
import { PackageDialog } from './_components/package-dialog';
import { PaymentDialog } from './_components/payment-dialog';
import { PaymentsTable, type PaymentRow } from './_components/payments-table';
import { QuotaBars } from './_components/quota-bars';

const TABS = [
  { key: 'packages', label: tr.finance.packages },
  { key: 'payments', label: tr.finance.payments },
  { key: 'ads', label: tr.finance.ads },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const QUOTA_LABELS: Record<(typeof QUOTA_TYPES)[number], string> = {
  post: tr.cardTypes.post,
  reel: tr.cardTypes.reel,
  story: tr.cardTypes.story,
  shoot: tr.production.shoots,
};

/**
 * /finance — Paketler (quota bars) / Ödemeler (overdue tracking) / Reklamlar
 * (workflow board), UPGRADE_SPEC §7. Server component: reads run under the
 * user's RLS; manager-only mutations live in lib/actions/finance.ts.
 */
export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey =
    rawTab === 'payments' || rawTab === 'ads' ? rawTab : 'packages';

  const session = await getSessionProfile();
  const isManager = session?.role === 'admin' || session?.role === 'manager';

  // Persist pending→overdue before reading payments (managers only — the
  // update runs under RLS; members still see overdue derived at display time).
  if (isManager) await sweepOverduePayments();

  const [clients, packages, payments, ads, usage] = await Promise.all([
    listClients({ activeOnly: true }),
    listPackagesWithClients(),
    listPaymentsWithClients(),
    listAdTasksWithClients(),
    monthlyUsage(),
  ]);
  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));
  const today = istanbulDateString();

  const paymentRows: PaymentRow[] = payments.map((p) => {
    const overdue = p.status === 'overdue' || isPaymentOverdue(p, today);
    return {
      id: p.id,
      clientName: p.clients?.name ?? '—',
      title: p.title,
      kindLabel:
        p.kind === 'extra' ? tr.finance.extraWork : tr.finance.packages,
      amountFmt: fmtMoney(p.amount, p.currency),
      dueOnFmt: fmtIstanbulDate(p.due_on),
      paidOnFmt: p.paid_on ? fmtIstanbulDate(p.paid_on) : null,
      statusLabel: tr.finance.paymentStatuses[p.status],
      overdue,
      payable: isManager && p.status !== 'paid',
    };
  });

  const adRows: AdRow[] = ads.map((a) => ({
    id: a.id,
    clientName: a.clients?.name ?? '—',
    platform: a.platform as AdRow['platform'],
    objective: a.objective,
    budget: a.budget,
    budgetFmt: fmtMoney(a.budget, a.currency),
    startsOn: a.starts_on,
    endsOn: a.ends_on,
    datesFmt:
      a.starts_on || a.ends_on
        ? `${a.starts_on ? fmtIstanbulDate(a.starts_on) : '…'} → ${
            a.ends_on ? fmtIstanbulDate(a.ends_on) : '…'
          }`
        : null,
    status: a.status,
    results: parseAdResults(a.results),
    next: AD_TRANSITIONS[a.status],
  }));

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.finance.title}>
        {isManager && tab === 'packages' && (
          <PackageDialog clients={clientOptions} />
        )}
        {isManager && tab === 'payments' && (
          <PaymentDialog clients={clientOptions} />
        )}
        {isManager && tab === 'ads' && <AdDialog clients={clientOptions} />}
      </PageHeader>

      <nav
        role="tablist"
        className="animate-enter mb-5 inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/finance?tab=${t.key}`}
            role="tab"
            aria-selected={tab === t.key}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              tab === t.key
                ? 'bg-white/[0.10] text-neutral-50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'packages' && (
        <section className="stagger-children grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {packages.length === 0 && (
            <p className="text-sm text-neutral-500">{tr.common.none}</p>
          )}
          {packages.map((pkg) => {
            const cmp = compareQuota(
              pkg.monthly,
              usage[pkg.client_id] ?? emptyUsage(),
            );
            const quota = parseMonthlyQuota(pkg.monthly);
            return (
              <Panel
                key={pkg.id}
                title={`${pkg.clients?.name ?? '—'} · ${pkg.name}`}
                actions={
                  isManager ? (
                    <div className="flex items-center gap-2">
                      {!pkg.active && (
                        <GlassChip tone="neutral">
                          {tr.clients.inactive}
                        </GlassChip>
                      )}
                      <PackageDialog
                        clients={clientOptions}
                        pkg={{
                          id: pkg.id,
                          clientId: pkg.client_id,
                          name: pkg.name,
                          price: pkg.price,
                          monthly: {
                            post: quota.post ?? 0,
                            reel: quota.reel ?? 0,
                            story: quota.story ?? 0,
                            shoot: quota.shoot ?? 0,
                          },
                          active: pkg.active,
                        }}
                      />
                    </div>
                  ) : undefined
                }
                className={pkg.active ? '' : 'opacity-60'}
              >
                <p className="mb-3 font-mono text-sm font-medium tabular-nums text-neutral-100">
                  {fmtMoney(pkg.price, pkg.currency)}
                  <span className="ml-1 font-sans text-xs font-normal text-neutral-500">
                    / {tr.common.month}
                  </span>
                </p>
                <Label>{tr.finance.quotaUsage}</Label>
                <QuotaBars
                  items={QUOTA_TYPES.map((t) => ({
                    key: t,
                    label: QUOTA_LABELS[t],
                    ...cmp[t],
                  }))}
                />
              </Panel>
            );
          })}
        </section>
      )}

      {tab === 'payments' && (
        <Panel title={tr.finance.payments}>
          <PaymentsTable rows={paymentRows} />
        </Panel>
      )}

      {tab === 'ads' && (
        <section>
          <p className="animate-enter mb-4 rounded-xl border border-sky-400/20 bg-sky-400/[0.07] px-3.5 py-2.5 text-sm leading-relaxed text-sky-200/90">
            {tr.finance.apiNote}
          </p>
          <AdsBoard ads={adRows} isManager={isManager} />
        </section>
      )}
    </div>
  );
}
