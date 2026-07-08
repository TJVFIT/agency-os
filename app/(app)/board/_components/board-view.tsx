'use client';

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

import { Select } from '@/components/ui';
import { CardTile } from '@/components/card-tile';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { transitionCardStatus } from '@/lib/actions/cards';
import { CARD_STATUSES, type CardStatus } from '@/lib/status';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';
import type { Card } from '@/lib/db/types';

/** Columns shown on the board — the full forward chain minus `archived`. */
const COLUMNS: CardStatus[] = CARD_STATUSES.filter((s) => s !== 'archived');

const CARD_TYPES = ['post', 'reel', 'story', 'reply', 'other'] as const;

type Toast = { text: string; tone: 'error' } | null;

/** Map a TransitionReason (or generic action error) to a Turkish message. */
function reasonMessage(code: string): string {
  return (
    tr.statusReasons[code as keyof typeof tr.statusReasons] ??
    tr.board.dragError
  );
}

/** One draggable card. */
function DraggableCard({ card }: { card: CardWithClient }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'opacity-40' : undefined}
      style={{ touchAction: 'none' }}
    >
      <CardTile
        card={card}
        draggableProps={{
          ...attributes,
          ...listeners,
          className: 'cursor-grab active:cursor-grabbing',
        }}
      />
    </div>
  );
}

/** One droppable status column. */
function Column({
  status,
  cards,
}: {
  status: CardStatus;
  cards: CardWithClient[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex w-64 shrink-0 flex-col">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="text-sm font-semibold text-neutral-200">
          {tr.statuses[status]}
        </span>
        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs text-neutral-400">
          {cards.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-32 flex-1 flex-col gap-2 rounded-xl border p-2 transition-colors ${
          isOver
            ? 'border-neutral-500 bg-neutral-900'
            : 'border-neutral-800 bg-neutral-900/40'
        }`}
      >
        {cards.length === 0 ? (
          <p className="px-1 py-2 text-xs text-neutral-600">{tr.board.empty}</p>
        ) : (
          cards.map((card) => <DraggableCard key={card.id} card={card} />)
        )}
      </div>
    </div>
  );
}

export function BoardView({
  initialCards,
  clients,
  profiles,
}: {
  initialCards: CardWithClient[];
  clients: { id: string; name: string }[];
  profiles: { id: string; full_name: string }[];
}) {
  const [cards, setCards] = useState<CardWithClient[]>(initialCards);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  // Filters (controlled).
  const [clientId, setClientId] = useState('');
  const [assignee, setAssignee] = useState('');
  const [type, setType] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Realtime: patch cards in place (SPEC §13) without a refresh.
  useRealtimeEvent('cards.change', (payload) => {
    setCards((prev) => {
      if (payload.eventType === 'DELETE') {
        const oldId = payload.old?.id;
        return oldId ? prev.filter((c) => c.id !== oldId) : prev;
      }
      const next = payload.new;
      if (!next) return prev;
      // Archived cards drop off the board.
      if (next.status === 'archived') {
        return prev.filter((c) => c.id !== next.id);
      }
      const idx = prev.findIndex((c) => c.id === next.id);
      if (idx === -1) {
        // New card from elsewhere — keep the client join we already know, if any.
        return [{ ...next, clients: null }, ...prev];
      }
      // Preserve the joined client (realtime rows carry only the cards table).
      const merged: CardWithClient = { ...prev[idx], ...next };
      const copy = prev.slice();
      copy[idx] = merged;
      return copy;
    });
  });

  const filtered = useMemo(
    () =>
      cards.filter(
        (c) =>
          (!clientId || c.client_id === clientId) &&
          (!assignee || c.assignee === assignee) &&
          (!type || c.type === type),
      ),
    [cards, clientId, assignee, type],
  );

  const byStatus = useMemo(() => {
    const map = new Map<CardStatus, CardWithClient[]>();
    for (const status of COLUMNS) map.set(status, []);
    for (const card of filtered) {
      map.get(card.status as CardStatus)?.push(card);
    }
    return map;
  }, [filtered]);

  const activeCard = activeId
    ? (cards.find((c) => c.id === activeId) ?? null)
    : null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const cardId = String(active.id);
    const to = String(over.id) as CardStatus;
    const card = cards.find((c) => c.id === cardId);
    if (!card || card.status === to) return;

    const from = card.status as CardStatus;

    // Optimistic move.
    setCards((prev) =>
      prev.map((c) =>
        c.id === cardId ? { ...c, status: to as Card['status'] } : c,
      ),
    );
    setToast(null);

    const res = await transitionCardStatus({ cardId, to });
    if (!res.ok) {
      // Revert and surface the reason.
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId ? { ...c, status: from as Card['status'] } : c,
        ),
      );
      setToast({ text: reasonMessage(res.error), tone: 'error' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label={tr.board.filterClient}
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
        >
          <option value="">{tr.board.filterClient}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          aria-label={tr.board.filterAssignee}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="">{tr.board.filterAssignee}</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
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
        {toast && (
          <span className="ml-auto rounded-md border border-red-900 bg-red-950 px-2.5 py-1 text-xs text-red-200">
            {toast.text}
          </span>
        )}
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              cards={byStatus.get(status) ?? []}
            />
          ))}
        </div>
        <DragOverlay>
          {activeCard ? (
            <div className="w-60 rotate-1">
              <CardTile card={activeCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
