'use client';

/**
 * Live activity feed — right-side drawer on desktop, full-width sheet on
 * mobile (SPEC §12). Seeded with the latest rows server-side, then grows
 * via the shared realtime channel.
 */

import { useState } from 'react';

import { useRealtimeEvent } from '@/components/realtime-provider';
import { fmtIstanbul } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';
import type { ActivityEntry } from '@/lib/db/types';

export interface FeedEntry extends ActivityEntry {
  actorName?: string | null;
  cardTitle?: string | null;
}

function renderEntry(entry: FeedEntry, names: Record<string, string>): string {
  const detail = (entry.detail ?? {}) as Record<string, unknown>;
  const actions = tr.feed.actions as Record<string, string>;
  const template = actions[entry.action] ?? actions.fallback;

  const statuses = tr.statuses as Record<string, string>;
  const values: Record<string, string | number | null | undefined> = {
    actor:
      entry.actorName ??
      (entry.actor
        ? (names[entry.actor] ?? tr.common.unknown)
        : tr.feed.system),
    action: entry.action,
    title: (detail.title as string) ?? entry.cardTitle ?? undefined,
  };
  for (const [k, v] of Object.entries(detail)) {
    if (typeof v === 'string' || typeof v === 'number') {
      // status codes render as their Turkish labels
      values[k] = statuses[String(v)] ?? v;
    }
  }
  return interpolate(template, values);
}

export function FeedDrawer({
  initialEntries,
  profileNames,
}: {
  initialEntries: FeedEntry[];
  profileNames: Record<string, string>;
}) {
  const [entries, setEntries] = useState<FeedEntry[]>(initialEntries);
  const [open, setOpen] = useState(false);

  useRealtimeEvent('activity.insert', (row) => {
    setEntries((prev) => [row as FeedEntry, ...prev].slice(0, 100));
  });

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-4 right-4 z-40 rounded-full border border-white/10 bg-[#0c0c0e]/90 px-4 py-2 text-sm text-neutral-200 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 hover:bg-white/[0.08] active:scale-[0.97] lg:hidden"
      >
        {tr.feed.title}
      </button>

      <aside
        className={`fixed inset-y-0 right-0 z-30 w-full max-w-sm transform border-l border-white/[0.06] bg-[#070708]/95 backdrop-blur-xl transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] lg:static lg:z-auto lg:block lg:w-80 lg:translate-x-0 lg:bg-white/[0.015] lg:backdrop-blur-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
            <h2 className="text-sm font-semibold text-neutral-200">
              {tr.feed.title}
            </h2>
            <button
              onClick={() => setOpen(false)}
              className="text-sm text-neutral-500 hover:text-neutral-300 lg:hidden"
            >
              {tr.common.close}
            </button>
          </div>
          <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {entries.length === 0 && (
              <li className="text-sm text-neutral-500">{tr.feed.empty}</li>
            )}
            {entries
              .filter((e) => e.action !== 'worker.heartbeat')
              .map((entry) => (
                <li key={entry.id} className="text-sm">
                  <p className="text-neutral-300">
                    {renderEntry(entry, profileNames)}
                  </p>
                  <time className="text-xs text-neutral-600">
                    {fmtIstanbul(entry.created_at)}
                  </time>
                </li>
              ))}
          </ol>
        </div>
      </aside>
    </>
  );
}
