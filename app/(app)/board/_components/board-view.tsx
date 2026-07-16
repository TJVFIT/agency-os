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
import { StatusBadge } from '@/components/status-badge';
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

/** Unified glass count chip — tabular numerals, hairline border + tint. */
function CountChip({
  children,
  className = '',
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-px text-[11px] font-medium tabular-nums text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

/** Designed per-column empty state: icon orb + one-line hint, centered. */
function ColumnEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-white/[0.06] px-3 py-8 text-center">
      <span
        aria-hidden
        className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-neutral-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M22 12h-6l-2 3h-4l-2-3H2" />
          <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
        </svg>
      </span>
      <p className="text-xs leading-snug text-neutral-600">{tr.board.empty}</p>
    </div>
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
      className={`transition-opacity duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        isDragging ? 'opacity-30 saturate-50' : ''
      }`}
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
        <StatusBadge status={status} />
        <CountChip>{cards.length}</CountChip>
      </div>
      <div
        ref={setNodeRef}
        className={`flex min-h-44 flex-1 flex-col gap-2 rounded-2xl border p-2 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOver
            ? 'border-indigo-300/40 bg-indigo-400/[0.06] shadow-[inset_0_1px_0_rgba(165,180,252,0.15),0_0_28px_-6px_rgba(129,140,248,0.5)]'
            : 'border-white/[0.06] bg-gradient-to-b from-white/[0.03] to-white/[0.01] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-white/[0.10] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_16px_40px_-20px_rgba(0,0,0,0.9)]'
        }`}
      >
        {cards.length === 0 ? (
          <ColumnEmpty />
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

  const hasFilter = Boolean(clientId || assignee || type);

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

    // Revert the optimistic move back to the source column.
    const revert = () =>
      setCards((prev) =>
        prev.map((c) =>
          c.id === cardId ? { ...c, status: from as Card['status'] } : c,
        ),
      );

    try {
      const res = await transitionCardStatus({ cardId, to });
      if (!res.ok) {
        revert();
        setToast({ text: reasonMessage(res.error), tone: 'error' });
      }
    } catch {
      // Network/server failure: the action rejected rather than returning !ok.
      revert();
      setToast({ text: tr.board.dragError, tone: 'error' });
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter toolbar: glass bar with hairline border + inset highlight. */}
      <div className="animate-enter flex flex-wrap items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_28px_-16px_rgba(0,0,0,0.7)]">
        <span className="inline-flex items-center gap-1.5 pr-1 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
          <svg
            aria-hidden
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <path d="M4 6h16M7 12h10M10 18h4" />
          </svg>
          {tr.common.filter}
        </span>
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
        <div className="ml-auto flex items-center gap-2">
          {toast && (
            <span
              role="status"
              className="animate-enter inline-flex items-center gap-1.5 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-1.5 text-xs leading-snug text-red-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]"
              />
              {toast.text}
            </span>
          )}
          <CountChip aria-label={tr.board.title} className="px-2.5 py-1">
            {hasFilter ? `${filtered.length} / ${cards.length}` : cards.length}
          </CountChip>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="stagger-children flex gap-3 overflow-x-auto overscroll-x-contain pb-3">
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
            <div className="w-60 rotate-1 scale-[1.03] drop-shadow-[0_24px_48px_rgba(0,0,0,0.7)]">
              <CardTile card={activeCard} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
