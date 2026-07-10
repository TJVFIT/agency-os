'use client';

/**
 * Demo kanban board — static walkthrough page (/preview). Columns come from
 * BOARD_STATUSES, cards from the shared demo dataset. Filters work fully
 * client-side; "Yeni kart" opens a fake dialog that appends into the idea
 * column in local state. No Supabase, no drag-and-drop, no server actions.
 */

import { useEffect, useMemo, useState } from 'react';

import { CardTile } from '@/components/card-tile';
import { StatusBadge } from '@/components/status-badge';
import { Button, Field, Input, Select } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import type { CardStatus } from '@/lib/status';
import type { CardWithClient } from '@/lib/db/queries';

import {
  BOARD_STATUSES,
  DEMO_CARDS,
  DEMO_CLIENTS,
  demoCard,
} from '../_demo/data';

type DemoCardType = 'post' | 'reel' | 'story' | 'reply' | 'other';

const CARD_TYPES: DemoCardType[] = ['post', 'reel', 'story', 'reply', 'other'];

/** CardTile wrapper that swallows link clicks — the demo has no card pages. */
function DemoCardTile({ card }: { card: CardWithClient }) {
  return (
    <div onClickCapture={(e) => e.preventDefault()}>
      <CardTile card={card} />
    </div>
  );
}

function Column({
  status,
  cards,
}: {
  status: CardStatus;
  cards: CardWithClient[];
}) {
  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <StatusBadge status={status} />
        <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-px text-[11px] tabular-nums text-neutral-400">
          {cards.length}
        </span>
      </div>
      <div className="flex min-h-40 flex-1 flex-col gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        {cards.length === 0 ? (
          <p className="px-1 py-2 text-xs text-neutral-600">{tr.board.empty}</p>
        ) : (
          cards.map((card) => <DemoCardTile key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}

function NewCardDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (title: string, clientId: string, type: DemoCardType) => void;
}) {
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState(DEMO_CLIENTS[0].id);
  const [type, setType] = useState<DemoCardType>('post');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  function submit() {
    onCreate(title.trim(), clientId, type);
    setTitle('');
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-enter w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <section className="rounded-2xl bg-gradient-to-b from-white/[0.12] via-white/[0.05] to-white/[0.02] p-px shadow-[0_24px_80px_-16px_rgba(0,0,0,0.9)]">
          <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight text-neutral-100">
                {tr.card.newCard}
              </h2>
              <button
                onClick={onClose}
                aria-label={tr.common.close}
                className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition-colors duration-300 hover:bg-white/[0.06] hover:text-neutral-200"
              >
                ✕
              </button>
            </header>
            <div className="space-y-3 p-4">
              <Field label={tr.card.title}>
                <Input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={tr.card.title}
                />
              </Field>
              <Field label={tr.card.client}>
                <Select
                  className="w-full"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  {DEMO_CLIENTS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={tr.card.type}>
                <Select
                  className="w-full"
                  value={type}
                  onChange={(e) => setType(e.target.value as DemoCardType)}
                >
                  {CARD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {tr.cardTypes[t]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={onClose}>
                  {tr.common.cancel}
                </Button>
                <Button
                  variant="primary"
                  disabled={title.trim().length === 0}
                  onClick={submit}
                >
                  {tr.common.create}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default function PreviewBoardPage() {
  const [cards, setCards] = useState<CardWithClient[]>(DEMO_CARDS);
  const [clientId, setClientId] = useState('');
  const [type, setType] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const filtered = useMemo(
    () =>
      cards.filter(
        (c) =>
          (!clientId || c.client_id === clientId) && (!type || c.type === type),
      ),
    [cards, clientId, type],
  );

  const byStatus = useMemo(() => {
    const map = new Map<CardStatus, CardWithClient[]>();
    for (const status of BOARD_STATUSES) map.set(status, []);
    for (const card of filtered) {
      map.get(card.status as CardStatus)?.push(card);
    }
    return map;
  }, [filtered]);

  function createCard(title: string, cid: string, t: DemoCardType) {
    const card = demoCard(title, 'idea', cid, t);
    setCards((prev) => [card, ...prev]);
  }

  return (
    <>
      <header className="animate-enter mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-50">
          {tr.board.title}
        </h1>
        <Button variant="primary" icon="+" onClick={() => setDialogOpen(true)}>
          {tr.card.newCard}
        </Button>
      </header>

      <div className="animate-enter mb-4 flex flex-wrap items-center gap-2">
        <Select
          aria-label={tr.board.filterClient}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">{tr.board.filterClient}</option>
          {DEMO_CLIENTS.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={tr.board.filterType}
          value={type}
          onChange={(e) => setType(e.target.value)}
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
          />
        ))}
      </div>

      <NewCardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreate={createCard}
      />
    </>
  );
}
