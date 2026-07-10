'use client';

/**
 * Demo kanban board — live local workspace (/preview). Columns are the seven
 * pipeline stages; every card comes from the persistent demo store (nothing
 * is example data). Hover actions move a card through the pipeline; approved
 * cards open the shared schedule dialog. All input persists in localStorage.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { CardTile } from '@/components/card-tile';
import { StatusBadge } from '@/components/status-badge';
import { Button, Field, Input, PageHeader, Select } from '@/components/ui';
import { istanbulToUtc } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardStatus } from '@/lib/status';

import { DialogShell, ScheduleDialog } from '../_demo/schedule-dialog';
import {
  toCardWithClient,
  useDemoStore,
  type StoreCard,
  type StoreCardType,
  type StoreClient,
} from '../_demo/store';

/** Pipeline columns in natural order — archived stays off the board. */
const BOARD_STATUSES: readonly CardStatus[] = [
  'idea',
  'copy_draft',
  'visual_ready',
  'translated',
  'approved',
  'scheduled',
  'published',
];

const CARD_TYPES: StoreCardType[] = ['post', 'reel', 'story', 'other'];

/** Tile + hover quick actions: step back/forward, schedule when approved. */
function BoardCard({
  card,
  client,
  onSchedule,
}: {
  card: StoreCard;
  client: StoreClient | undefined;
  onSchedule: (card: StoreCard) => void;
}) {
  const store = useDemoStore();
  const idx = BOARD_STATUSES.indexOf(card.status);
  const prev = idx > 0 ? BOARD_STATUSES[idx - 1] : null;
  const next =
    idx > -1 && idx < BOARD_STATUSES.length - 1
      ? BOARD_STATUSES[idx + 1]
      : null;

  const stepBtn =
    'flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-xs text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 hover:bg-white/[0.08] hover:text-neutral-100 active:scale-[0.92]';

  return (
    <div className="group/card">
      {/* Swallow the tile's internal link — the demo has no card pages. */}
      <div onClickCapture={(e) => e.preventDefault()}>
        <CardTile card={toCardWithClient(card, client)} />
      </div>
      <div className="flex items-center justify-end gap-1 pt-1 opacity-0 transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-focus-within/card:opacity-100 group-hover/card:opacity-100">
        {prev && (
          <button
            title={`${tr.card.moveTo}: ${tr.statuses[prev]}`}
            aria-label={`${tr.card.moveTo}: ${tr.statuses[prev]}`}
            onClick={() => store.moveCard(card.id, prev)}
            className={stepBtn}
          >
            ‹
          </button>
        )}
        {card.status === 'approved' && (
          <Button
            variant="ghost"
            className="!px-2.5 !py-0.5 !text-xs"
            onClick={() => onSchedule(card)}
          >
            {tr.card.schedule}
          </Button>
        )}
        {next && (
          <button
            title={`${tr.card.moveTo}: ${tr.statuses[next]}`}
            aria-label={`${tr.card.moveTo}: ${tr.statuses[next]}`}
            onClick={() => store.moveCard(card.id, next)}
            className={stepBtn}
          >
            ›
          </button>
        )}
      </div>
    </div>
  );
}

function Column({
  status,
  cards,
  clientById,
  onSchedule,
}: {
  status: CardStatus;
  cards: StoreCard[];
  clientById: ReadonlyMap<string, StoreClient>;
  onSchedule: (card: StoreCard) => void;
}) {
  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <StatusBadge status={status} />
        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-px text-[11px] tabular-nums text-neutral-400">
          {cards.length}
        </span>
      </div>
      <div className="flex min-h-40 flex-1 flex-col gap-2 rounded-xl border border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.10]">
        {cards.length === 0 ? (
          <p className="px-1 py-2 text-xs text-neutral-600">{tr.board.empty}</p>
        ) : (
          cards.map((card) => (
            <BoardCard
              key={card.id}
              card={card}
              client={clientById.get(card.clientId)}
              onSchedule={onSchedule}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** "Yeni içerik" — creates an idea card for one of the visitor's clients. */
function NewContentDialog({ onClose }: { onClose: () => void }) {
  const store = useDemoStore();
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(store.clients[0]?.id ?? '');
  const [type, setType] = useState<StoreCardType>('post');
  const [due, setDue] = useState('');

  const canCreate = title.trim().length > 0 && clientId !== '';

  function submit() {
    if (!canCreate) return;
    store.addCard({
      clientId,
      title: title.trim(),
      type,
      status: 'idea',
      dueAt: due ? istanbulToUtc(due).toISOString() : null,
      platforms: [],
    });
    onClose();
  }

  return (
    <DialogShell title={tr.demo.newContent} onClose={onClose}>
      {store.clients.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <span aria-hidden className="text-2xl">
            🏪
          </span>
          <p className="text-sm text-neutral-400">{tr.demo.noClients}</p>
          <Link
            href="/preview/clients"
            className="inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-3.5 py-1.5 text-sm font-medium text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.97]"
          >
            {tr.demo.addFirstClient}
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[11px]"
            >
              →
            </span>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={tr.card.client}>
            <Select
              className="w-full"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              {store.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.card.title}>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={tr.card.title}
            />
          </Field>
          <Field label={tr.card.type}>
            <Select
              className="w-full"
              value={type}
              onChange={(e) => setType(e.target.value as StoreCardType)}
            >
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {tr.cardTypes[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.card.dueDate}>
            <Input
              type="datetime-local"
              className="[color-scheme:dark]"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button variant="primary" disabled={!canCreate} onClick={submit}>
              {tr.common.create}
            </Button>
          </div>
        </div>
      )}
    </DialogShell>
  );
}

function EmptyBoard({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="animate-enter rounded-2xl bg-gradient-to-b from-white/[0.10] via-white/[0.04] to-white/[0.02] p-px shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7)]">
      <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-[calc(1rem-1px)] bg-[#0a0a0b] px-6 py-20 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(30rem_16rem_at_50%_-4rem,rgba(129,140,248,0.12),transparent_70%)]"
        />
        <span className="relative mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-neutral-400">
          {tr.board.title}
        </span>
        <span
          aria-hidden
          className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_32px_rgba(129,140,248,0.15)]"
        >
          🗂️
        </span>
        <p className="relative max-w-sm text-sm leading-relaxed text-neutral-400">
          {tr.demo.noCards}
        </p>
        <Button
          variant="primary"
          icon="+"
          className="relative mt-5 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08),0_0_40px_-8px_rgba(165,180,252,0.45)]"
          onClick={onCreate}
        >
          {tr.demo.newContent}
        </Button>
      </div>
    </section>
  );
}

export default function PreviewBoardPage() {
  const store = useDemoStore();
  const [clientFilter, setClientFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [scheduling, setScheduling] = useState<StoreCard | null>(null);

  const clientById = useMemo(
    () => new Map(store.clients.map((c) => [c.id, c])),
    [store.clients],
  );

  const filtered = useMemo(
    () =>
      store.cards.filter(
        (c) =>
          (!clientFilter || c.clientId === clientFilter) &&
          (!typeFilter || c.type === typeFilter),
      ),
    [store.cards, clientFilter, typeFilter],
  );

  const byStatus = useMemo(() => {
    const map = new Map<CardStatus, StoreCard[]>();
    for (const status of BOARD_STATUSES) map.set(status, []);
    for (const card of filtered) map.get(card.status)?.push(card);
    return map;
  }, [filtered]);

  if (!store.hydrated) return null;

  return (
    <>
      <PageHeader title={tr.board.title}>
        <Button variant="primary" icon="+" onClick={() => setDialogOpen(true)}>
          {tr.demo.newContent}
        </Button>
      </PageHeader>

      {store.cards.length === 0 ? (
        <EmptyBoard onCreate={() => setDialogOpen(true)} />
      ) : (
        <>
          <div className="animate-enter mb-4 flex flex-wrap items-center gap-2">
            <Select
              aria-label={tr.board.filterClient}
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
            >
              <option value="">{tr.board.filterClient}</option>
              {store.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label={tr.board.filterType}
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">{tr.board.filterType}</option>
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {tr.cardTypes[t]}
                </option>
              ))}
            </Select>
          </div>

          <div className="stagger-children flex gap-3 overflow-x-auto pb-3">
            {BOARD_STATUSES.map((status) => (
              <Column
                key={status}
                status={status}
                cards={byStatus.get(status) ?? []}
                clientById={clientById}
                onSchedule={setScheduling}
              />
            ))}
          </div>
        </>
      )}

      {dialogOpen && <NewContentDialog onClose={() => setDialogOpen(false)} />}
      {scheduling && (
        <ScheduleDialog card={scheduling} onClose={() => setScheduling(null)} />
      )}
    </>
  );
}
