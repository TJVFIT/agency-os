'use client';

/**
 * /preview/finance — live finance module demo (no backend, no example data).
 * Paketler / Ödemeler / Reklamlar all start empty; everything the visitor
 * adds is held in local component state. Clients come from the shared demo
 * store; overdue payments are computed against today.
 */

import Link from 'next/link';
import { useRef, useState } from 'react';

import {
  Button,
  Field,
  Input,
  Panel,
  PageHeader,
  Select,
} from '@/components/ui';
import { fmtIstanbul, istanbulDateString } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';

import { DEMO_PROFILE } from '../_demo/data';
import { useDemoStore, type StoreClient } from '../_demo/store';

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function fmtTL(amount: number): string {
  return `₺${amount.toLocaleString('tr-TR')}`;
}

function fmtDay(day: string): string {
  // `day` is a yyyy-MM-dd date-input value; Istanbul is UTC+3 so midnight
  // UTC still renders as the same calendar date.
  return fmtIstanbul(`${day}T00:00:00Z`, 'd MMM yyyy');
}

function clientNameOf(clients: StoreClient[], id: string): string {
  return clients.find((c) => c.id === id)?.name ?? '—';
}

// --- Shared bits --------------------------------------------------------------

function GlassChip({
  tone,
  children,
}: {
  tone: 'neutral' | 'green' | 'red' | 'sky';
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

/** Inviting empty state: emoji + copy + a CTA that opens the add-flow. */
function EmptyState({
  emoji,
  text,
  cta,
}: {
  emoji: string;
  text: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="animate-enter relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(22rem_12rem_at_50%_-3rem,rgba(129,140,248,0.09),transparent_70%)]"
      />
      <span
        aria-hidden
        className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.14)]"
      >
        {emoji}
      </span>
      <p className="relative max-w-sm text-sm leading-relaxed text-neutral-400">
        {text}
      </p>
      <span className="relative">{cta}</span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
      {children}
    </h2>
  );
}

function ClientSelect({
  clients,
  value,
  onChange,
}: {
  clients: StoreClient[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <Field label={tr.card.client}>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// --- Paketler -----------------------------------------------------------------

type QuotaType = 'post' | 'reel' | 'story';
const QUOTA_TYPES: QuotaType[] = ['post', 'reel', 'story'];

interface PackageItem {
  id: string;
  clientId: string;
  name: string;
  price: number;
  quotas: { type: QuotaType; quota: number }[];
}

function QuotaBar({
  label,
  used,
  quota,
}: {
  label: string;
  used: number;
  quota: number;
}) {
  const pct = quota > 0 ? Math.min((used / quota) * 100, 100) : 0;
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-xs">
        <span className="text-neutral-400">{label}</span>
        <span className="font-mono tabular-nums text-neutral-400">
          {used}/{quota}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
        <div
          className="h-full rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)] transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function PackagesSection() {
  const store = useDemoStore();
  const nameRef = useRef<HTMLInputElement>(null);

  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [rows, setRows] = useState<{ type: QuotaType; qty: string }[]>([
    { type: 'post', qty: '' },
  ]);

  const selectedClient = clientId || (store.clients[0]?.id ?? '');

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const quotas = rows
      .map((r) => ({ type: r.type, quota: Number(r.qty) }))
      .filter((r) => r.quota > 0);
    if (!selectedClient || !name.trim() || !(Number(price) > 0)) return;
    setPackages((p) => [
      ...p,
      {
        id: uid('pkg'),
        clientId: selectedClient,
        name: name.trim(),
        price: Number(price),
        quotas,
      },
    ]);
    store.log(
      interpolate(tr.feed.actions['package.created'], {
        actor: DEMO_PROFILE.full_name,
      }),
    );
    setName('');
    setPrice('');
    setRows([{ type: 'post', qty: '' }]);
  }

  return (
    <section>
      <SectionTitle>{tr.finance.packages}</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {packages.length === 0 ? (
          <EmptyState
            emoji="📦"
            text={tr.demo.noPackages}
            cta={
              <Button
                variant="primary"
                onClick={() => nameRef.current?.focus()}
              >
                {tr.finance.newPackage}
              </Button>
            }
          />
        ) : (
          <div className="stagger-children grid gap-3 self-start md:grid-cols-2">
            {packages.map((pkg) => (
              <Panel
                key={pkg.id}
                title={clientNameOf(store.clients, pkg.clientId)}
                className="transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5"
              >
                <div className="mb-3 flex items-baseline justify-between">
                  <span className="text-sm font-medium text-neutral-100">
                    {pkg.name}
                  </span>
                  <span className="font-mono text-sm tabular-nums text-neutral-300">
                    {fmtTL(pkg.price)}
                  </span>
                </div>
                {pkg.quotas.length > 0 && (
                  <>
                    <p className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                      {tr.finance.quotaUsage}
                    </p>
                    <div className="space-y-2">
                      {pkg.quotas.map((q) => (
                        <QuotaBar
                          key={q.type}
                          label={tr.cardTypes[q.type]}
                          used={0}
                          quota={q.quota}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-neutral-600">
                      {tr.demo.quotaNote}
                    </p>
                  </>
                )}
              </Panel>
            ))}
          </div>
        )}

        <Panel
          title={tr.finance.newPackage}
          className="animate-enter self-start"
        >
          <form onSubmit={onAdd} className="space-y-3">
            <ClientSelect
              clients={store.clients}
              value={selectedClient}
              onChange={setClientId}
            />
            <Field label={tr.finance.packageName}>
              <Input
                ref={nameRef}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
            </Field>
            <Field label={tr.finance.price}>
              <Input
                type="number"
                min={0}
                step="any"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                required
              />
            </Field>
            <div>
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                {tr.finance.quota}
              </span>
              <div className="space-y-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Select
                      value={row.type}
                      onChange={(e) =>
                        setRows((r) =>
                          r.map((x, j) =>
                            j === i
                              ? { ...x, type: e.target.value as QuotaType }
                              : x,
                          ),
                        )
                      }
                      className="flex-1"
                    >
                      {QUOTA_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {tr.cardTypes[t]}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={row.qty}
                      onChange={(e) =>
                        setRows((r) =>
                          r.map((x, j) =>
                            j === i ? { ...x, qty: e.target.value } : x,
                          ),
                        )
                      }
                      className="w-20"
                    />
                    {rows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        onClick={() =>
                          setRows((r) => r.filter((_, j) => j !== i))
                        }
                      >
                        ✕
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="mt-2 px-2.5 py-1 text-xs"
                onClick={() =>
                  setRows((r) => [...r, { type: 'post', qty: '' }])
                }
              >
                + {tr.common.add}
              </Button>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary">
                {tr.common.add}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </section>
  );
}

// --- Ödemeler ------------------------------------------------------------------

interface PaymentItem {
  id: string;
  clientId: string;
  title: string;
  amount: number;
  dueOn: string; // yyyy-MM-dd
  paid: boolean;
}

type PaymentStatus = 'pending' | 'paid' | 'overdue';

function paymentStatus(row: PaymentItem, today: string): PaymentStatus {
  if (row.paid) return 'paid';
  return row.dueOn < today ? 'overdue' : 'pending';
}

function PaymentsSection() {
  const store = useDemoStore();
  const titleRef = useRef<HTMLInputElement>(null);

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [dueOn, setDueOn] = useState('');

  const selectedClient = clientId || (store.clients[0]?.id ?? '');
  const today = istanbulDateString();

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient || !title.trim() || !(Number(amount) > 0) || !dueOn)
      return;
    const payment: PaymentItem = {
      id: uid('pay'),
      clientId: selectedClient,
      title: title.trim(),
      amount: Number(amount),
      dueOn,
      paid: false,
    };
    setPayments((p) => [...p, payment]);
    store.log(
      interpolate(tr.feed.actions['payment.created'], {
        actor: DEMO_PROFILE.full_name,
        title: payment.title,
      }),
    );
    setTitle('');
    setAmount('');
    setDueOn('');
  }

  function markPaid(id: string) {
    const row = payments.find((p) => p.id === id);
    setPayments((rows) =>
      rows.map((r) => (r.id === id ? { ...r, paid: true } : r)),
    );
    if (row)
      store.log(
        interpolate(tr.feed.actions['payment.status_changed'], {
          title: row.title,
          to: tr.finance.paymentStatuses.paid,
        }),
      );
  }

  return (
    <section>
      <SectionTitle>{tr.finance.payments}</SectionTitle>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {payments.length === 0 ? (
          <EmptyState
            emoji="🧾"
            text={tr.demo.noPayments}
            cta={
              <Button
                variant="primary"
                onClick={() => titleRef.current?.focus()}
              >
                {tr.finance.newPayment}
              </Button>
            }
          />
        ) : (
          <Panel className="animate-enter self-start">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-xs text-neutral-500">
                    <th className="px-2 py-2 font-medium">{tr.card.client}</th>
                    <th className="px-2 py-2 font-medium">{tr.card.title}</th>
                    <th className="px-2 py-2 text-right font-medium">
                      {tr.finance.amount}
                    </th>
                    <th className="px-2 py-2 font-medium">
                      {tr.finance.dueOn}
                    </th>
                    <th className="px-2 py-2 font-medium">{tr.card.status}</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="stagger-children">
                  {payments.map((row) => {
                    const status = paymentStatus(row, today);
                    const overdue = status === 'overdue';
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-white/[0.04] transition-colors duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] last:border-0 ${
                          overdue
                            ? 'bg-red-400/[0.06]'
                            : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <td className="px-2 py-2 text-neutral-300">
                          {clientNameOf(store.clients, row.clientId)}
                        </td>
                        <td className="px-2 py-2 text-neutral-100">
                          {row.title}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-medium tabular-nums text-neutral-100">
                          {fmtTL(row.amount)}
                        </td>
                        <td
                          className={`px-2 py-2 tabular-nums ${
                            overdue
                              ? 'font-medium text-red-300'
                              : 'text-neutral-400'
                          }`}
                        >
                          {fmtDay(row.dueOn)}
                        </td>
                        <td className="px-2 py-2">
                          {status === 'overdue' && (
                            <GlassChip tone="red">
                              {tr.finance.overdue}
                            </GlassChip>
                          )}
                          {status === 'paid' && (
                            <GlassChip tone="green">
                              {tr.finance.paymentStatuses.paid}
                            </GlassChip>
                          )}
                          {status === 'pending' && (
                            <GlassChip tone="neutral">
                              {tr.finance.paymentStatuses.pending}
                            </GlassChip>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {!row.paid && (
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
        )}

        <Panel
          title={tr.finance.newPayment}
          className="animate-enter self-start"
        >
          <form onSubmit={onAdd} className="space-y-3">
            <ClientSelect
              clients={store.clients}
              value={selectedClient}
              onChange={setClientId}
            />
            <Field label={tr.card.title}>
              <Input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={140}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tr.finance.amount}>
                <Input
                  type="number"
                  min={0}
                  step="any"
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
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary">
                {tr.common.add}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </section>
  );
}

// --- Reklamlar -----------------------------------------------------------------

type AdStatus = 'planned' | 'active' | 'done';
type PlatformKey = keyof typeof tr.platforms;

const PLATFORM_KEYS = Object.keys(tr.platforms) as PlatformKey[];

const AD_NEXT: Partial<Record<AdStatus, AdStatus>> = {
  planned: 'active',
  active: 'done',
};

const PLATFORM_CHIP: Record<string, string> = {
  instagram: 'border-fuchsia-400/20 bg-fuchsia-400/10 text-fuchsia-200',
  tiktok: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200',
  youtube: 'border-red-400/20 bg-red-400/10 text-red-200',
  facebook: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
};

interface AdItem {
  id: string;
  clientId: string;
  platform: PlatformKey;
  objective: string;
  budget: number;
  startsOn: string; // yyyy-MM-dd
  endsOn: string;
  status: AdStatus;
}

function AdsSection() {
  const store = useDemoStore();
  const objectiveRef = useRef<HTMLInputElement>(null);

  const [ads, setAds] = useState<AdItem[]>([]);
  const [clientId, setClientId] = useState('');
  const [platform, setPlatform] = useState<PlatformKey>('instagram');
  const [objective, setObjective] = useState('');
  const [budget, setBudget] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  const selectedClient = clientId || (store.clients[0]?.id ?? '');

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (
      !selectedClient ||
      !objective.trim() ||
      !(Number(budget) > 0) ||
      !startsOn ||
      !endsOn
    )
      return;
    setAds((a) => [
      ...a,
      {
        id: uid('ad'),
        clientId: selectedClient,
        platform,
        objective: objective.trim(),
        budget: Number(budget),
        startsOn,
        endsOn,
        status: 'planned',
      },
    ]);
    store.log(
      interpolate(tr.feed.actions['ad.created'], {
        actor: DEMO_PROFILE.full_name,
        platform: tr.platforms[platform],
      }),
    );
    setObjective('');
    setBudget('');
    setStartsOn('');
    setEndsOn('');
  }

  function advance(id: string) {
    const ad = ads.find((a) => a.id === id);
    const next = ad && AD_NEXT[ad.status];
    if (!next) return;
    setAds((rows) =>
      rows.map((r) => (r.id === id ? { ...r, status: next } : r)),
    );
    store.log(
      interpolate(tr.feed.actions['ad.status_changed'], {
        to: tr.finance.adStatuses[next],
      }),
    );
  }

  return (
    <section>
      <SectionTitle>{tr.finance.ads}</SectionTitle>

      <div className="animate-enter mb-3 rounded-xl border border-indigo-300/20 bg-indigo-400/[0.07] px-3 py-2 text-xs leading-relaxed text-indigo-200/90">
        {tr.finance.apiNote}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        {ads.length === 0 ? (
          <EmptyState
            emoji="📣"
            text={tr.demo.noAds}
            cta={
              <Button
                variant="primary"
                onClick={() => objectiveRef.current?.focus()}
              >
                {tr.finance.newAd}
              </Button>
            }
          />
        ) : (
          <div className="stagger-children grid gap-3 self-start md:grid-cols-2">
            {ads.map((ad) => {
              const next = AD_NEXT[ad.status];
              return (
                <Panel
                  key={ad.id}
                  className="transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          PLATFORM_CHIP[ad.platform] ??
                          'border-white/10 bg-white/[0.05] text-neutral-300'
                        }`}
                      >
                        {tr.platforms[ad.platform]}
                      </span>
                      <span className="text-sm font-medium text-neutral-100">
                        {clientNameOf(store.clients, ad.clientId)}
                      </span>
                    </div>
                    <GlassChip
                      tone={
                        ad.status === 'active'
                          ? 'green'
                          : ad.status === 'done'
                            ? 'sky'
                            : 'neutral'
                      }
                    >
                      {tr.finance.adStatuses[ad.status]}
                    </GlassChip>
                  </div>

                  <p className="mt-2 text-sm text-neutral-300">
                    {ad.objective}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500">
                    <span>
                      {tr.finance.budget}:{' '}
                      <span className="font-mono tabular-nums text-neutral-200">
                        {fmtTL(ad.budget)}
                      </span>
                    </span>
                    <span className="tabular-nums text-neutral-400">
                      {fmtDay(ad.startsOn)} – {fmtDay(ad.endsOn)}
                    </span>
                    {next && (
                      <Button
                        variant="secondary"
                        className="ml-auto px-2.5 py-1 text-xs"
                        onClick={() => advance(ad.id)}
                      >
                        → {tr.finance.adStatuses[next]}
                      </Button>
                    )}
                  </div>
                </Panel>
              );
            })}
          </div>
        )}

        <Panel title={tr.finance.newAd} className="animate-enter self-start">
          <form onSubmit={onAdd} className="space-y-3">
            <ClientSelect
              clients={store.clients}
              value={selectedClient}
              onChange={setClientId}
            />
            <Field label={tr.clients.platform}>
              <Select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as PlatformKey)}
                className="w-full"
              >
                {PLATFORM_KEYS.map((p) => (
                  <option key={p} value={p}>
                    {tr.platforms[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr.finance.objective}>
              <Input
                ref={objectiveRef}
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                maxLength={200}
                required
              />
            </Field>
            <Field label={tr.finance.budget}>
              <Input
                type="number"
                min={0}
                step="any"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={tr.production.leaveStart}>
                <Input
                  type="date"
                  value={startsOn}
                  onChange={(e) => setStartsOn(e.target.value)}
                  required
                />
              </Field>
              <Field label={tr.production.leaveEnd}>
                <Input
                  type="date"
                  value={endsOn}
                  onChange={(e) => setEndsOn(e.target.value)}
                  required
                />
              </Field>
            </div>
            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary">
                {tr.common.add}
              </Button>
            </div>
          </form>
        </Panel>
      </div>
    </section>
  );
}

// --- Page ----------------------------------------------------------------------

export default function PreviewFinancePage() {
  const store = useDemoStore();

  if (!store.hydrated) return null;

  return (
    <div>
      <PageHeader title={tr.finance.title} />
      {store.clients.length === 0 ? (
        <EmptyState
          emoji="🏢"
          text={tr.demo.noClients}
          cta={
            <Link href="/preview/clients">
              <Button variant="primary">{tr.demo.addClientCta}</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          <PackagesSection />
          <div aria-hidden className="h-px bg-white/[0.06]" />
          <PaymentsSection />
          <div aria-hidden className="h-px bg-white/[0.06]" />
          <AdsSection />
        </div>
      )}
    </div>
  );
}
