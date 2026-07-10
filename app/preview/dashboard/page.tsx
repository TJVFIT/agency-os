'use client';

/**
 * Demo dashboard — static walkthrough page (/preview). Mirrors the real
 * app/(app)/dashboard visuals with the shared demo dataset; no Supabase,
 * no server actions. Suggestion accept/dismiss fades rows out locally.
 */

import { useState } from 'react';

import { CardTile } from '@/components/card-tile';
import { Button, PageHeader, Panel } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';

import { DEMO_CARDS, DEMO_SUGGESTIONS, DEMO_TODAY_PLAN } from '../_demo/data';

/** My queue: cards assigned to the demo user or waiting at review stages. */
const QUEUE: CardWithClient[] = DEMO_CARDS.filter(
  (c) =>
    c.assignee === 'demo-user' ||
    c.status === 'visual_ready' ||
    c.status === 'approved',
);

const GAP = DEMO_SUGGESTIONS.find((s) => s.domain === 'missing_work');

/** CardTile wrapper that swallows link clicks — the demo has no card pages. */
function DemoCardTile({ card }: { card: CardWithClient }) {
  return (
    <div onClickCapture={(e) => e.preventDefault()}>
      <CardTile card={card} showStatus />
    </div>
  );
}

function SuggestionsList() {
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(new Set());
  const [gone, setGone] = useState<ReadonlySet<string>>(new Set());

  function resolve(id: string) {
    setLeaving((prev) => new Set(prev).add(id));
    window.setTimeout(() => setGone((prev) => new Set(prev).add(id)), 350);
  }

  const visible = DEMO_SUGGESTIONS.filter((s) => !gone.has(s.id));

  if (visible.length === 0) {
    return (
      <p className="animate-enter text-sm text-neutral-500">
        {tr.automation.noSuggestions}
      </p>
    );
  }

  return (
    <ul className="stagger-children space-y-2">
      {visible.map((s) => (
        <li
          key={s.id}
          className={`flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            leaving.has(s.id)
              ? 'pointer-events-none translate-x-3 opacity-0'
              : 'opacity-100'
          }`}
        >
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-0.5 text-[11px] font-medium text-indigo-200">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]" />
            {s.domainLabel}
          </span>
          <span className="min-w-0 flex-1 text-sm leading-snug text-neutral-200">
            {s.text}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5">
            <Button variant="secondary" onClick={() => resolve(s.id)}>
              {tr.automation.accept}
            </Button>
            <Button variant="ghost" onClick={() => resolve(s.id)}>
              {tr.automation.dismiss}
            </Button>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function PreviewDashboardPage() {
  return (
    <>
      <PageHeader title={tr.dashboard.title} />

      <div className="stagger-children grid gap-4 lg:grid-cols-3">
        <Panel title={tr.dashboard.myQueue} className="lg:col-span-2">
          {QUEUE.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {tr.dashboard.myQueueEmpty}
            </p>
          ) : (
            <div className="stagger-children grid gap-2 sm:grid-cols-2">
              {QUEUE.map((card) => (
                <DemoCardTile key={card.id} card={card} />
              ))}
            </div>
          )}
        </Panel>

        <Panel title={tr.automation.todayPlan}>
          <ul className="stagger-children space-y-2">
            {DEMO_TODAY_PLAN.map((item, i) => (
              <li
                key={i}
                className="group flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.05]"
              >
                <span
                  aria-hidden
                  className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[13px]"
                >
                  {item.kind === 'shoot' ? '🗓' : '⏱'}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium leading-snug text-neutral-100">
                    {item.label}
                  </span>
                  <span className="block text-xs text-neutral-500">
                    {item.extra}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title={tr.automation.suggestionsInbox} className="lg:col-span-2">
          <SuggestionsList />
        </Panel>

        <div className="space-y-4">
          <Panel title={tr.dashboard.gapRadar}>
            {GAP ? (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 text-sm">
                <span
                  aria-hidden
                  className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]"
                />
                <span className="leading-snug text-red-200">{GAP.text}</span>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">
                {tr.dashboard.gapRadarEmpty}
              </p>
            )}
          </Panel>

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
                <dd className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-px text-neutral-300">
                  0
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-neutral-500">{tr.settings.lastSuccess}</dt>
                <dd className="text-neutral-300">09:41</dd>
              </div>
            </dl>
          </Panel>
        </div>
      </div>
    </>
  );
}
