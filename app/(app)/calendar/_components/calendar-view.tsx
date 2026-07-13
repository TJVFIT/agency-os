'use client';

import { useMemo, useState, useTransition } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';

import { Button, PageHeader, Panel, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { CardTile } from '@/components/card-tile';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { rescheduleCard } from '@/lib/actions/cards';
import { createApprovalLink } from '@/lib/actions/approvals';
import {
  fmtIstanbul,
  fmtIstanbulDate,
  istanbulDateString,
  istanbulToUtc,
  istanbulWeekStart,
} from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';

type View = 'month' | 'week';

interface ClientOption {
  id: string;
  name: string;
  langs: string[];
}

/** yyyy-MM-dd (Istanbul) for a card's effective calendar date, or null. */
function cardDay(card: CardWithClient): string | null {
  const ts = card.scheduled_at ?? card.due_at;
  return ts ? fmtIstanbul(ts, 'yyyy-MM-dd') : null;
}

/** Add `n` days to a UTC anchor date (Turkey is a fixed UTC+3, no DST). */
function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + n);
  return copy;
}

/** Turkish short weekday headers, Monday-first. */
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export function CalendarView({
  cards: initialCards,
  clients,
}: {
  cards: CardWithClient[];
  clients: ClientOption[];
}) {
  const [cards, setCards] = useState<CardWithClient[]>(initialCards);
  const [clientId, setClientId] = useState<string>('all');
  const [view, setView] = useState<View>('month');
  // Anchor day (any day inside the visible range), as a UTC Date.
  const [anchor, setAnchor] = useState<Date>(() => istanbulWeekStart());
  const [link, setLink] = useState<{ whatsapp: string } | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Live patch cards in place (SPEC §13).
  useRealtimeEvent('cards.change', (payload) => {
    setCards((prev) => {
      if (payload.eventType === 'DELETE') {
        const id = payload.old?.id;
        return id ? prev.filter((c) => c.id !== id) : prev;
      }
      const next = payload.new;
      if (!next) return prev;
      const idx = prev.findIndex((c) => c.id === next.id);
      if (idx === -1) {
        if (next.status === 'archived') return prev;
        return [...prev, { ...next, clients: null } as CardWithClient];
      }
      const merged = prev.slice();
      merged[idx] = { ...merged[idx], ...next };
      if (merged[idx].status === 'archived')
        return merged.filter((c) => c.id !== next.id);
      return merged;
    });
  });

  const filtered = useMemo(
    () =>
      clientId === 'all'
        ? cards
        : cards.filter((c) => c.client_id === clientId),
    [cards, clientId],
  );

  const unscheduled = useMemo(
    () => filtered.filter((c) => !cardDay(c)),
    [filtered],
  );

  // Bucket dated cards by Istanbul day string.
  const byDay = useMemo(() => {
    const map = new Map<string, CardWithClient[]>();
    for (const c of filtered) {
      const day = cardDay(c);
      if (!day) continue;
      const list = map.get(day);
      if (list) list.push(c);
      else map.set(day, [c]);
    }
    return map;
  }, [filtered]);

  // Visible weeks: array of weeks, each an array of 7 UTC day anchors.
  const weeks = useMemo(() => {
    if (view === 'week') {
      const start = istanbulWeekStart(anchor);
      return [Array.from({ length: 7 }, (_, i) => addDays(start, i))];
    }
    // Month: 6 rows starting from the Monday on/before the 1st of the month.
    const monthStr = fmtIstanbul(anchor, 'yyyy-MM'); // Istanbul month
    const first = new Date(`${monthStr}-01T00:00:00Z`);
    const gridStart = istanbulWeekStart(first);
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => addDays(gridStart, w * 7 + d)),
    );
  }, [view, anchor]);

  const currentMonthStr = fmtIstanbul(anchor, 'yyyy-MM');
  const singleClient = clientId !== 'all';

  const rangeLabel =
    view === 'week'
      ? (() => {
          const start = istanbulWeekStart(anchor);
          return `${fmtIstanbulDate(start)} – ${fmtIstanbulDate(addDays(start, 6))}`;
        })()
      : fmtIstanbul(anchor, 'MMMM yyyy');

  function shift(delta: number) {
    setAnchor((prev) =>
      view === 'week'
        ? addDays(istanbulWeekStart(prev), delta * 7)
        : (() => {
            const m = fmtIstanbul(prev, 'yyyy-MM');
            const base = new Date(`${m}-01T00:00:00Z`);
            base.setUTCMonth(base.getUTCMonth() + delta);
            return base;
          })(),
    );
  }

  function onDragEnd(event: DragEndEvent) {
    const cardId = String(event.active.id);
    const overId = event.over?.id;
    if (!overId || typeof overId !== 'string' || !overId.startsWith('day:'))
      return;
    const targetDay = overId.slice(4); // yyyy-MM-dd (Istanbul)

    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    if (cardDay(card) === targetDay) return; // no move

    // Preserve the card's existing wall-clock time, else default to 09:00.
    const ts = card.scheduled_at ?? card.due_at;
    const time = ts ? fmtIstanbul(ts, 'HH:mm') : '09:00';
    const atIso = istanbulToUtc(`${targetDay}T${time}:00`).toISOString();
    const field: 'scheduled_at' | 'due_at' =
      card.status === 'scheduled' ? 'scheduled_at' : 'due_at';

    const snapshot = cards;
    // Optimistic move.
    setCards((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, [field]: atIso } : c)),
    );
    setRescheduleError(null);

    startTransition(async () => {
      try {
        const res = await rescheduleCard({ cardId, at: atIso });
        if (!res.ok) {
          setCards(snapshot); // revert
          setRescheduleError(
            tr.statusReasons[res.error as keyof typeof tr.statusReasons] ??
              tr.board.dragError,
          );
        }
      } catch {
        // Network/server failure: revert and tell the user why.
        setCards(snapshot);
        setRescheduleError(tr.board.dragError);
      }
    });
  }

  function sendWeekForApproval(weekAnchor: Date) {
    if (!singleClient) return;
    setApprovalError(null);
    const weekStart = istanbulDateString(istanbulWeekStart(weekAnchor));
    startTransition(async () => {
      const res = await createApprovalLink({ clientId, weekStart });
      if (res.ok && res.data) setLink({ whatsapp: res.data.whatsapp });
      else if (!res.ok)
        setApprovalError(
          tr.statusReasons[res.error as keyof typeof tr.statusReasons] ??
            tr.errors.generic,
        );
    });
  }

  return (
    <>
      <PageHeader title={tr.nav.calendar}>
        <Select
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          aria-label={tr.calendar.allClients}
        >
          <option value="all">{tr.calendar.allClients}</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <button
            onClick={() => setView('month')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${
              view === 'month'
                ? 'bg-neutral-50 text-neutral-950 shadow-[0_2px_8px_rgba(255,255,255,0.15)]'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            {tr.calendar.monthView}
          </button>
          <button
            onClick={() => setView('week')}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${
              view === 'week'
                ? 'bg-neutral-50 text-neutral-950 shadow-[0_2px_8px_rgba(255,255,255,0.15)]'
                : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            {tr.calendar.weekView}
          </button>
        </div>
      </PageHeader>

      <div className="animate-enter mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => shift(-1)} aria-label="prev">
          ‹
        </Button>
        <span className="min-w-40 text-center text-sm font-medium tracking-tight text-neutral-200">
          {rangeLabel}
        </span>
        <Button variant="secondary" onClick={() => shift(1)} aria-label="next">
          ›
        </Button>
        <Button variant="ghost" onClick={() => setAnchor(istanbulWeekStart())}>
          {tr.common.today}
        </Button>
        {view === 'week' && singleClient && (
          <Button
            variant="primary"
            className="ml-auto"
            disabled={pending}
            onClick={() => sendWeekForApproval(anchor)}
          >
            {tr.calendar.sendWeekForApproval}
          </Button>
        )}
      </div>

      {approvalError && (
        <p className="mb-3 rounded-full border border-red-500/25 bg-red-500/[0.08] px-3 py-1.5 text-xs text-red-200">
          {approvalError}
        </p>
      )}

      {rescheduleError && (
        <p className="mb-3 rounded-full border border-red-500/25 bg-red-500/[0.08] px-3 py-1.5 text-xs text-red-200">
          {rescheduleError}
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            {/* Weekday header */}
            <div className="mb-1 grid grid-cols-7 gap-1.5">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="px-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="stagger-children space-y-1.5">
              {weeks.map((week, wi) => (
                <div key={wi} className="relative">
                  {view === 'month' && singleClient && (
                    <button
                      onClick={() => sendWeekForApproval(week[0])}
                      disabled={pending}
                      title={tr.calendar.sendWeekForApproval}
                      className="absolute -left-1 top-1 z-10 hidden -translate-x-full rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 hover:bg-white/[0.08] disabled:opacity-50 xl:block"
                    >
                      ⇢
                    </button>
                  )}
                  <div className="grid grid-cols-7 gap-1.5">
                    {week.map((dayDate) => {
                      const dayStr = fmtIstanbul(dayDate, 'yyyy-MM-dd');
                      const inMonth =
                        view === 'week' ||
                        fmtIstanbul(dayDate, 'yyyy-MM') === currentMonthStr;
                      const isToday = dayStr === istanbulDateString();
                      return (
                        <DayCell
                          key={dayStr}
                          dayStr={dayStr}
                          label={fmtIstanbul(dayDate, 'd')}
                          dimmed={!inMonth}
                          isToday={isToday}
                          tall={view === 'week'}
                          cards={byDay.get(dayStr) ?? []}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Unscheduled tray */}
          <Panel title={tr.calendar.unscheduled} className="self-start">
            {unscheduled.length === 0 ? (
              <p className="text-sm text-neutral-500">{tr.board.empty}</p>
            ) : (
              <div className="stagger-children space-y-1.5">
                {unscheduled.map((c) => (
                  <DraggableCard key={c.id} card={c} />
                ))}
              </div>
            )}
          </Panel>
        </div>
      </DndContext>

      <Dialog
        open={link !== null}
        onClose={() => setLink(null)}
        title={tr.approval.linkCreated}
      >
        {link && <CopyBlock text={link.whatsapp} />}
      </Dialog>
    </>
  );
}

function DayCell({
  dayStr,
  label,
  dimmed,
  isToday,
  tall,
  cards,
}: {
  dayStr: string;
  label: string;
  dimmed: boolean;
  isToday: boolean;
  tall: boolean;
  cards: CardWithClient[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayStr}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-lg border p-1.5 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        tall ? 'min-h-64' : 'min-h-28'
      } ${dimmed ? 'opacity-45' : ''} ${
        isOver
          ? 'border-indigo-300/50 bg-indigo-400/[0.10] shadow-[inset_0_1px_0_rgba(165,180,252,0.15),0_0_24px_-8px_rgba(129,140,248,0.5)]'
          : isToday
            ? 'border-indigo-300/30 bg-indigo-400/[0.05] shadow-[inset_0_1px_0_rgba(165,180,252,0.1)]'
            : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.03]'
      }`}
    >
      <span
        className={`mb-1 text-xs tabular-nums ${
          isToday ? 'font-semibold text-indigo-200' : 'text-neutral-500'
        }`}
      >
        {isToday ? `• ${label}` : label}
      </span>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto">
        {cards.map((c) => (
          <DraggableCard key={c.id} card={c} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ card }: { card: CardWithClient }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.id,
  });
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'opacity-40' : ''}
      style={{ touchAction: 'none' }}
    >
      <CardTile
        card={card}
        showStatus
        draggableProps={{
          ...attributes,
          ...listeners,
          className: 'cursor-grab active:cursor-grabbing',
        }}
      />
    </div>
  );
}

function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm text-neutral-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
        {text}
      </p>
      <div className="flex justify-end">
        <Button
          variant="primary"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? tr.common.copied : tr.common.copy}
        </Button>
      </div>
    </div>
  );
}
