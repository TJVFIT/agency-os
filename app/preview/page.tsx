'use client';

/**
 * Credential-free UI preview (demo data only). Reuses the real app chrome and
 * presentational components so the look-and-feel is authentic without a
 * Supabase backend. Not part of the product — safe to delete. Reachable at
 * /preview (allowlisted in proxy.ts).
 */

import { AppShell } from '@/components/app-shell';
import { CardTile } from '@/components/card-tile';
import { StatusBadge } from '@/components/status-badge';
import { Button, Panel } from '@/components/ui';
import { fmtIstanbul } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';
import type { Profile } from '@/lib/db/types';
import type { CardStatus } from '@/lib/status';

const CLIENTS = {
  kebap: {
    id: 'c1',
    name: 'Ustanın Yeri',
    slug: 'ustanin-yeri',
    langs: ['tr', 'en'],
    colors: { primary: '#e11d48' },
  },
  cafe: {
    id: 'c2',
    name: 'Kavis Kahve',
    slug: 'kavis-kahve',
    langs: ['tr'],
    colors: { primary: '#0ea5e9' },
  },
  pizza: {
    id: 'c3',
    name: 'Napoli Sokağı',
    slug: 'napoli-sokagi',
    langs: ['tr', 'en'],
    colors: { primary: '#f59e0b' },
  },
} as const;

let n = 0;
function card(
  title: string,
  status: CardStatus,
  client: (typeof CLIENTS)[keyof typeof CLIENTS],
  type: 'post' | 'reel' | 'story' | 'reply' | 'other' = 'post',
  extra: { due_at?: string; scheduled_at?: string } = {},
): CardWithClient {
  n += 1;
  return {
    id: `demo-${n}`,
    client_id: client.id,
    type,
    title,
    status,
    assignee: null,
    due_at: extra.due_at ?? null,
    scheduled_at: extra.scheduled_at ?? null,
    platforms: [],
    priority: 3,
    tags: [],
    created_by: null,
    created_at: '2026-07-01T09:00:00Z',
    updated_at: '2026-07-01T09:00:00Z',
    clients: client,
  } as unknown as CardWithClient;
}

const COLUMNS: { status: CardStatus; cards: CardWithClient[] }[] = [
  {
    status: 'idea',
    cards: [
      card('Yeni yaz menüsü tanıtımı', 'idea', CLIENTS.kebap, 'post'),
      card('Haftanın kahvesi: Fıstıklı Latte', 'idea', CLIENTS.cafe, 'story'),
    ],
  },
  {
    status: 'copy_draft',
    cards: [
      card(
        'Cumaya özel indirim kampanyası',
        'copy_draft',
        CLIENTS.pizza,
        'post',
        {
          due_at: '2026-07-10T12:00:00Z',
        },
      ),
    ],
  },
  {
    status: 'visual_ready',
    cards: [
      card('Mutfaktan kısa reel', 'visual_ready', CLIENTS.kebap, 'reel'),
      card('Sabah açılış hikâyesi', 'visual_ready', CLIENTS.cafe, 'story'),
    ],
  },
  {
    status: 'translated',
    cards: [
      card('Bayram menüsü duyurusu', 'translated', CLIENTS.pizza, 'post'),
    ],
  },
  {
    status: 'approved',
    cards: [card('Yeni şube açılışı', 'approved', CLIENTS.kebap, 'post')],
  },
  {
    status: 'scheduled',
    cards: [
      card('Hafta sonu brunch', 'scheduled', CLIENTS.cafe, 'post', {
        scheduled_at: '2026-07-12T07:30:00Z',
      }),
    ],
  },
];

const FEED: { action: string; when: string }[] = [
  {
    action: 'Elif, "Yeni şube açılışı" kartını onaya gönderdi',
    when: '2026-07-07T14:10:00Z',
  },
  { action: 'AI, başlık önerilerini hazırladı', when: '2026-07-07T14:02:00Z' },
  {
    action: 'Mert, Bayram menüsü duyurusu metnini güncelledi',
    when: '2026-07-07T13:40:00Z',
  },
  { action: 'Kart yayınlandı 🎉', when: '2026-07-07T11:15:00Z' },
];

const MOCK_PROFILE = {
  id: 'demo-user',
  full_name: 'Demo Yönetici',
  role: 'admin',
  telegram_chat_id: null,
  created_at: '2026-01-01T00:00:00Z',
} as unknown as Profile;

function DemoFeed() {
  return (
    <div className="flex h-full w-80 flex-col border-l border-neutral-800">
      <div className="border-b border-neutral-800 px-4 py-3 text-sm font-semibold text-neutral-200">
        {tr.feed.title}
      </div>
      <ol className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {FEED.map((e, i) => (
          <li key={i} className="text-sm">
            <p className="text-neutral-300">{e.action}</p>
            <time className="text-xs text-neutral-600">
              {fmtIstanbul(e.when)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function PreviewPage() {
  const logout = async () => {};

  return (
    <AppShell profile={MOCK_PROFILE} logout={logout} feed={<DemoFeed />}>
      <div className="p-4 md:p-6">
        <div className="mb-4 rounded-lg border border-amber-900 bg-amber-950/60 px-3 py-2 text-xs text-amber-300">
          Önizleme — örnek verilerle. Giriş ve gerçek veriler için Supabase
          bağlantısı gerekiyor (SETUP.md Part A).
        </div>

        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-50">
            {tr.nav.board}
          </h1>
          <Button variant="primary">{tr.card.newCard}</Button>
        </div>

        <div className="flex gap-3 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <div key={col.status} className="w-64 shrink-0">
              <div className="mb-2 flex items-center gap-2">
                <StatusBadge status={col.status} />
                <span className="text-xs text-neutral-600">
                  {col.cards.length}
                </span>
              </div>
              <div className="space-y-2">
                {col.cards.map((c) => (
                  <CardTile key={c.id} card={c} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Panel title={tr.dashboard.myQueue}>
            <div className="space-y-2">
              {COLUMNS[2].cards.concat(COLUMNS[4].cards).map((c) => (
                <CardTile key={`q-${c.id}`} card={c} showStatus />
              ))}
            </div>
          </Panel>
          <Panel title={tr.dashboard.gapRadar}>
            <p className="rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
              🚩 Napoli Sokağı: önümüzdeki 5 günde planlı içerik yok
            </p>
          </Panel>
        </div>

        {/* ---- v2 demo: production ---- */}
        <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-50">
          {tr.nav.production} — {tr.production.shoots}
        </h2>
        <div className="space-y-2">
          {[
            {
              title: 'Yaz menüsü çekimi',
              client: 'Ustanın Yeri',
              when: '10 Tem 10:00–13:30',
              crew: 'Elif + Mert',
              vehicle: 'Beyaz Doblo',
              status: tr.production.statuses.confirmed,
              chip: 'border-sky-800 bg-sky-950/60 text-sky-300',
            },
            {
              title: 'Barista arkası reel çekimi',
              client: 'Kavis Kahve',
              when: '11 Tem 14:00–17:30',
              crew: 'Mert',
              vehicle: '—',
              status: tr.production.statuses.planned,
              chip: 'border-neutral-700 bg-neutral-900 text-neutral-300',
            },
          ].map((s) => (
            <div
              key={s.title}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm"
            >
              <span
                className={`rounded-full border px-2 py-0.5 text-xs ${s.chip}`}
              >
                {s.status}
              </span>
              <span className="font-medium text-neutral-100">{s.title}</span>
              <span className="text-neutral-500">{s.client}</span>
              <span className="text-neutral-400">🗓 {s.when}</span>
              <span className="text-neutral-400">
                {tr.production.crew}: {s.crew}
              </span>
              <span className="text-neutral-400">
                {tr.production.vehicle}: {s.vehicle}
              </span>
            </div>
          ))}
          <p className="text-xs text-neutral-600">
            {tr.production.defaultBlock}
          </p>
        </div>

        {/* ---- v2 demo: finance ---- */}
        <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-50">
          {tr.nav.finance}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`${tr.finance.packages} — ${tr.finance.quotaUsage}`}>
            <div className="space-y-3">
              {[
                { label: 'Ustanın Yeri · Gönderi', used: 9, quota: 12 },
                { label: 'Ustanın Yeri · Reel', used: 4, quota: 4 },
                { label: 'Kavis Kahve · Gönderi', used: 3, quota: 8 },
              ].map((q) => (
                <div key={q.label}>
                  <div className="mb-1 flex justify-between text-xs text-neutral-400">
                    <span>{q.label}</span>
                    <span className={q.used >= q.quota ? 'text-red-400' : ''}>
                      {q.used}/{q.quota}
                    </span>
                  </div>
                  <div className="h-1.5 rounded bg-neutral-800">
                    <div
                      className={`h-1.5 rounded ${q.used >= q.quota ? 'bg-red-500' : 'bg-sky-500'}`}
                      style={{
                        width: `${Math.min(100, (q.used / q.quota) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title={tr.finance.payments}>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between rounded-md border border-red-900 bg-red-950/40 px-3 py-2">
                <span className="text-red-300">
                  Napoli Sokağı — Haziran paketi
                </span>
                <span className="text-red-300">
                  ₺18.000 · {tr.finance.overdue}
                </span>
              </div>
              <div className="flex justify-between rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2">
                <span className="text-neutral-300">
                  Kavis Kahve — {tr.finance.extraWork}: menü afişi
                </span>
                <span className="text-neutral-400">₺2.500 · 15 Tem</span>
              </div>
            </div>
          </Panel>
        </div>

        {/* ---- v2 demo: automation ---- */}
        <h2 className="mb-3 mt-8 text-lg font-semibold text-neutral-50">
          {tr.automation.suggestionsInbox}
        </h2>
        <div className="space-y-2">
          {[
            {
              domain: tr.automation.domains.publish,
              text: '"Hafta sonu brunch" yayına hazır — onaylıyor musun?',
            },
            {
              domain: tr.automation.domains.post_shoot,
              text: 'Yaz menüsü çekimi bitti — kurgu/metin/kontrol görevlerini açayım mı?',
            },
          ].map((s) => (
            <div
              key={s.text}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm"
            >
              <span className="rounded-full border border-amber-800 bg-amber-950/60 px-2 py-0.5 text-xs text-amber-300">
                {s.domain}
              </span>
              <span className="flex-1 text-neutral-200">{s.text}</span>
              <Button variant="primary">{tr.automation.accept}</Button>
              <Button>{tr.automation.dismiss}</Button>
            </div>
          ))}
          <p className="text-xs text-neutral-600">{tr.automation.modeHelp}</p>
        </div>
      </div>
    </AppShell>
  );
}
