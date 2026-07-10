'use client';

/**
 * Demo dashboard — live local workspace (/preview). Every panel derives from
 * the visitor's own store data: queue, today's plan, upcoming posts and the
 * gap radar are computed live; nothing is example data. With no clients yet
 * the page becomes a compact onboarding hero pointing at /preview/clients.
 */

import Link from 'next/link';
import { useMemo } from 'react';

import { CardTile } from '@/components/card-tile';
import { PageHeader, Panel } from '@/components/ui';
import { fmtIstanbul, fmtIstanbulTime, istanbulDateString } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';

import {
  toCardWithClient,
  useDemoStore,
  type StoreCard,
  type StoreClient,
} from '../_demo/store';

const DAY_MS = 86_400_000;

function platformLabel(platform: string): string {
  return platform in tr.platforms
    ? tr.platforms[platform as keyof typeof tr.platforms]
    : platform;
}

/** CardTile wrapper that swallows link clicks — the demo has no card pages. */
function DemoCardTile({
  card,
  client,
}: {
  card: StoreCard;
  client: StoreClient | undefined;
}) {
  return (
    <div onClickCapture={(e) => e.preventDefault()}>
      <CardTile card={toCardWithClient(card, client)} showStatus />
    </div>
  );
}

/** Worker heartbeat — presentation-only status chip (no live backend). */
function WorkerPanel() {
  return (
    <Panel title={tr.dashboard.workerStatus}>
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-50" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
        </span>
        <span className="text-sm font-medium text-emerald-200">
          {tr.dashboard.workerAlive}
        </span>
      </div>
      <dl className="mt-3 space-y-1.5 border-t border-white/[0.06] pt-3 text-xs">
        <div className="flex items-center justify-between">
          <dt className="text-neutral-500">{tr.settings.queueDepth}</dt>
          <dd className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-px tabular-nums text-neutral-300">
            0
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

/** Compact onboarding hero — mirrors the clients-page welcome, links there. */
function OnboardingHero() {
  return (
    <Panel className="lg:col-span-2">
      <div className="relative flex flex-col items-center overflow-hidden px-4 py-14 text-center">
        {/* Radial brand accent — pure CSS, behind the content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(28rem_16rem_at_50%_-3rem,rgba(129,140,248,0.13),transparent_70%)]"
        />
        <span className="relative mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-300/25 bg-indigo-400/[0.08] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-indigo-200">
          <span className="h-1 w-1 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.9)]" />
          {tr.appName}
        </span>
        <span
          aria-hidden
          className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_32px_rgba(129,140,248,0.18)]"
        >
          ✨
        </span>
        <h2 className="relative text-2xl font-semibold tracking-tight text-neutral-50">
          {tr.demo.welcomeTitle}
        </h2>
        <p className="relative mt-2 max-w-md text-sm leading-relaxed text-neutral-400">
          {tr.demo.welcomeBody}
        </p>
        <Link
          href="/preview/clients"
          className="group relative mt-6 inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-4 py-2 text-sm font-medium text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08),0_0_48px_-8px_rgba(165,180,252,0.5)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.97]"
        >
          {tr.demo.addFirstClient}
          <span
            aria-hidden
            className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[11px] transition-transform duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.1)] group-hover:translate-x-0.5"
          >
            →
          </span>
        </Link>
      </div>
    </Panel>
  );
}

export default function PreviewDashboardPage() {
  const store = useDemoStore();
  const todayKey = istanbulDateString(new Date());

  const clientById = useMemo(
    () => new Map<string, StoreClient>(store.clients.map((c) => [c.id, c])),
    [store.clients],
  );

  /** Everything still moving through the pipeline. */
  const queue = useMemo(
    () =>
      store.cards.filter(
        (c) => c.status !== 'published' && c.status !== 'archived',
      ),
    [store.cards],
  );

  /** Cards scheduled or due today (Istanbul wall-clock). */
  const todayPlan = useMemo(
    () =>
      store.cards
        .filter(
          (c) =>
            (c.scheduledAt !== null &&
              fmtIstanbul(c.scheduledAt, 'yyyy-MM-dd') === todayKey) ||
            (c.dueAt !== null &&
              fmtIstanbul(c.dueAt, 'yyyy-MM-dd') === todayKey),
        )
        .sort((a, b) =>
          (a.scheduledAt ?? a.dueAt ?? '').localeCompare(
            b.scheduledAt ?? b.dueAt ?? '',
          ),
        ),
    [store.cards, todayKey],
  );

  /** Next five scheduled publishes, soonest first. */
  const upcoming = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- intentional wall-clock read; memo recomputes when cards change
    const now = Date.now();
    return store.cards
      .filter((c) => c.scheduledAt !== null && Date.parse(c.scheduledAt) >= now)
      .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? ''))
      .slice(0, 5);
  }, [store.cards]);

  /** Clients with no scheduled publish inside the next five days. */
  const gaps = useMemo(() => {
    // eslint-disable-next-line react-hooks/purity -- intentional wall-clock read; memo recomputes when clients/cards change
    const now = Date.now();
    const horizon = now + 5 * DAY_MS;
    return store.clients.filter(
      (client) =>
        !store.cards.some((c) => {
          if (c.clientId !== client.id || c.scheduledAt === null) return false;
          const t = Date.parse(c.scheduledAt);
          return t >= now && t < horizon;
        }),
    );
  }, [store.clients, store.cards]);

  if (!store.hydrated) return null;

  if (store.clients.length === 0) {
    return (
      <>
        <PageHeader title={tr.dashboard.title} />
        <div className="stagger-children grid gap-4 lg:grid-cols-3">
          <OnboardingHero />
          <WorkerPanel />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title={tr.dashboard.title} />

      <div className="stagger-children grid gap-4 lg:grid-cols-3">
        {/* My queue — everything not yet published */}
        <Panel title={tr.dashboard.myQueue} className="lg:col-span-2">
          {queue.length === 0 ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-neutral-500">
                {tr.dashboard.myQueueEmpty}
              </p>
              <Link
                href="/preview/board"
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm font-medium text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 hover:bg-white/[0.08]"
              >
                {tr.demo.newContent} →
              </Link>
            </div>
          ) : (
            <div className="stagger-children grid gap-2 sm:grid-cols-2">
              {queue.map((card) => (
                <DemoCardTile
                  key={card.id}
                  card={card}
                  client={clientById.get(card.clientId)}
                />
              ))}
            </div>
          )}
        </Panel>

        {/* Today's plan — scheduled or due today */}
        <Panel title={tr.automation.todayPlan}>
          {todayPlan.length === 0 ? (
            <p className="text-sm text-neutral-500">🌤 {tr.demo.todayEmpty}</p>
          ) : (
            <ul className="stagger-children space-y-2">
              {todayPlan.map((card) => {
                const scheduledToday =
                  card.scheduledAt !== null &&
                  fmtIstanbul(card.scheduledAt, 'yyyy-MM-dd') === todayKey;
                const at = scheduledToday ? card.scheduledAt : card.dueAt;
                return (
                  <li
                    key={card.id}
                    className="group flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.05]"
                  >
                    <span
                      aria-hidden
                      className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[13px]"
                    >
                      {scheduledToday ? '📅' : '⏱'}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium leading-snug text-neutral-100">
                        {card.title}
                      </span>
                      <span className="block text-xs tabular-nums text-neutral-500">
                        {at !== null ? `${fmtIstanbulTime(at)} · ` : ''}
                        {clientById.get(card.clientId)?.name ?? '—'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Upcoming publishes — next five scheduled cards */}
        <Panel title={tr.demo.upcoming} className="lg:col-span-2">
          {upcoming.length === 0 ? (
            <p className="text-sm text-neutral-500">
              📅 {tr.demo.upcomingEmpty}
            </p>
          ) : (
            <ul className="stagger-children space-y-2">
              {upcoming.map((card) => {
                const client = clientById.get(card.clientId);
                const color = client?.colors.primary ?? '#525252';
                return (
                  <li
                    key={card.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.05]"
                  >
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[11px] font-medium tabular-nums text-violet-200">
                      {fmtIstanbul(card.scheduledAt!, 'd MMM')} ·{' '}
                      {fmtIstanbulTime(card.scheduledAt!)}
                    </span>
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: color,
                        boxShadow: `0 0 6px ${color}99`,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">
                      {card.title}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {card.platforms.map((p) => (
                        <span
                          key={p}
                          className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-px text-[10px] text-neutral-400"
                        >
                          {platformLabel(p)}
                        </span>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          {/* Gap radar — clients without a publish in the next 5 days */}
          <Panel title={tr.dashboard.gapRadar}>
            {store.clients.length === 0 ? (
              <p className="text-sm text-neutral-500">{tr.demo.noClients}</p>
            ) : gaps.length === 0 ? (
              <p className="text-sm text-neutral-500">
                {tr.dashboard.gapRadarEmpty}
              </p>
            ) : (
              <ul className="stagger-children space-y-2">
                {gaps.map((client) => (
                  <li
                    key={client.id}
                    className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 text-sm"
                  >
                    <span
                      aria-hidden
                      className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]"
                    />
                    <span className="leading-snug text-red-200">
                      {interpolate(tr.dashboard.gapRadarWarning, {
                        client: client.name,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <WorkerPanel />
        </div>
      </div>
    </>
  );
}
