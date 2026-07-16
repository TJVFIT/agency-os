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
import { ImpactDialog } from '@/components/impact-dialog';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { rescheduleCard } from '@/lib/actions/cards';
import { createApprovalLink } from '@/lib/actions/approvals';
import { applyImpact, computeImpact } from '@/lib/actions/impact';
import {
  fmtIstanbul,
  fmtIstanbulDate,
  istanbulDateString,
  istanbulToUtc,
  istanbulWeekStart,
} from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardWithClient } from '@/lib/db/queries';
import type { ImpactItem } from '@/lib/impact';

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

/** Round glass chip for ‹ › period navigation. */
const NAV_BTN =
  'flex h-7 w-7 items-center justify-center rounded-full text-sm text-neutral-400 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.08] hover:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40 active:scale-[0.92]';

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
  // Drag paused for the impact dialog: the optimistic move is on screen,
  // `snapshot` restores the pre-drag state on cancel (v4 §21).
  const [impact, setImpact] = useState<{
    items: ImpactItem[];
    cardId: string;
    atIso: string;
    /** Pre-move anchor — applyImpact recomputes deltas from it (the row
     * already holds the new date by the time the linked updates run). */
    fromIso: string | null;
    snapshot: CardWithClient[];
  } | null>(null);
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

  // Presentation only: does any visible day carry a card? Drives the
  // designed empty state above the grid.
  const hasVisibleCards = useMemo(
    () =>
      weeks.some((week) =>
        week.some((d) => byDay.has(fmtIstanbul(d, 'yyyy-MM-dd'))),
      ),
    [weeks, byDay],
  );

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
        // v4 §21: check what else the move touches before persisting. When
        // linked work is affected, the impact dialog decides how to proceed.
        const impactRes = await computeImpact({
          kind: 'card_reschedule',
          cardId,
          at: atIso,
          from: ts ?? undefined,
        });
        const items = impactRes.ok ? (impactRes.data ?? []) : [];
        if (items.length > 0) {
          setImpact({ items, cardId, atIso, fromIso: ts, snapshot });
          return; // persisted (or reverted) from the dialog
        }
        await persistReschedule(cardId, atIso, ts, snapshot, []);
      } catch {
        // Network/server failure: revert and tell the user why.
        setCards(snapshot);
        setRescheduleError(tr.board.dragError);
      }
    });
  }

  /** Save the card's new date, then apply the chosen linked updates.
   * `fromIso` is the pre-move anchor: by the time applyImpact recomputes,
   * the row already holds `atIso`, so the original date must travel with
   * the change (validated server-side) or every delta would be zero. */
  async function persistReschedule(
    cardId: string,
    atIso: string,
    fromIso: string | null,
    snapshot: CardWithClient[],
    selectedIds: string[],
  ) {
    try {
      const res = await rescheduleCard({ cardId, at: atIso });
      if (!res.ok) {
        setCards(snapshot); // revert
        setRescheduleError(
          tr.statusReasons[res.error as keyof typeof tr.statusReasons] ??
            tr.board.dragError,
        );
        return;
      }
      if (selectedIds.length > 0) {
        const applied = await applyImpact({
          change: {
            kind: 'card_reschedule',
            cardId,
            at: atIso,
            from: fromIso ?? undefined,
          },
          selectedIds,
        });
        // The card itself is saved; only the linked updates failed.
        if (!applied.ok) setRescheduleError(tr.errors.generic);
      }
    } catch {
      setCards(snapshot);
      setRescheduleError(tr.board.dragError);
    }
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
        <div
          role="group"
          aria-label={tr.calendar.title}
          className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40 active:scale-[0.96] ${
                view === v
                  ? 'bg-neutral-50 text-neutral-950 shadow-[0_2px_8px_rgba(255,255,255,0.15)]'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              {v === 'month' ? tr.calendar.monthView : tr.calendar.weekView}
            </button>
          ))}
        </div>
      </PageHeader>

      {/* Period toolbar: ‹ range › pill • today • busy chip • week approval */}
      <div className="animate-enter mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label={tr.demo.prevMonth}
            title={tr.demo.prevMonth}
            className={NAV_BTN}
          >
            ‹
          </button>
          <span className="min-w-36 px-1 text-center text-sm font-medium tabular-nums tracking-tight text-neutral-200">
            {rangeLabel}
          </span>
          <button
            type="button"
            onClick={() => shift(1)}
            aria-label={tr.demo.nextMonth}
            title={tr.demo.nextMonth}
            className={NAV_BTN}
          >
            ›
          </button>
        </div>
        <Button variant="ghost" onClick={() => setAnchor(istanbulWeekStart())}>
          {tr.common.today}
        </Button>
        {pending && (
          <span
            role="status"
            className="animate-enter inline-flex items-center gap-1.5 rounded-full border border-indigo-300/20 bg-indigo-400/[0.08] px-2.5 py-1 text-[11px] text-indigo-200"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.8)]"
            />
            {tr.common.processing}
          </span>
        )}
        {view === 'week' && singleClient && (
          <Button
            variant="primary"
            className="ml-auto"
            disabled={pending}
            icon="→"
            onClick={() => sendWeekForApproval(anchor)}
          >
            {tr.calendar.sendWeekForApproval}
          </Button>
        )}
      </div>

      {approvalError && <AlertBanner text={approvalError} />}
      {rescheduleError && <AlertBanner text={rescheduleError} />}

      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="animate-enter grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
          <div className="min-w-0">
            {!hasVisibleCards && <RangeEmptyState />}

            {/* Grid scrolls inside its own container on narrow screens;
                xl restores overflow for the per-week approval chip gutter. */}
            <div className="overflow-x-auto pb-1 xl:overflow-visible">
              <div className="min-w-[640px]">
                {/* Weekday header — day numbers join in week view */}
                <div className="mb-1 grid grid-cols-7 gap-1.5">
                  {WEEKDAYS.map((w, i) => {
                    const headDay =
                      view === 'week' ? weeks[0]?.[i] : undefined;
                    return (
                      <div
                        key={w}
                        className="px-1.5 text-[11px] font-medium uppercase tracking-[0.08em] tabular-nums text-neutral-500"
                      >
                        {headDay ? `${w} ${fmtIstanbul(headDay, 'd')}` : w}
                      </div>
                    );
                  })}
                </div>

                <div className="stagger-children space-y-1.5">
                  {weeks.map((week, wi) => (
                    <div key={wi} className="relative">
                      {view === 'month' && singleClient && (
                        <button
                          onClick={() => sendWeekForApproval(week[0])}
                          disabled={pending}
                          title={tr.calendar.sendWeekForApproval}
                          aria-label={tr.calendar.sendWeekForApproval}
                          className="absolute -left-1.5 top-1 z-10 hidden h-7 w-7 -translate-x-full items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-xs text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-indigo-300/40 hover:bg-indigo-400/10 hover:text-indigo-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40 active:scale-[0.92] disabled:opacity-40 xl:flex"
                        >
                          ⇢
                        </button>
                      )}
                      <div className="grid grid-cols-7 gap-1.5">
                        {week.map((dayDate) => {
                          const dayStr = fmtIstanbul(dayDate, 'yyyy-MM-dd');
                          const inMonth =
                            view === 'week' ||
                            fmtIstanbul(dayDate, 'yyyy-MM') ===
                              currentMonthStr;
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
            </div>
          </div>

          {/* Unscheduled tray */}
          <Panel
            title={tr.calendar.unscheduled}
            className="self-start"
            actions={
              <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] tabular-nums text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                {unscheduled.length}
              </span>
            }
          >
            {unscheduled.length === 0 ? (
              <div className="flex flex-col items-center gap-2.5 py-6 text-center">
                <span
                  aria-hidden
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  🗂️
                </span>
                <p className="text-xs leading-relaxed text-neutral-500">
                  {tr.board.empty}
                </p>
              </div>
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

      <ImpactDialog
        open={impact !== null}
        items={impact?.items ?? []}
        pending={pending}
        onCancel={() => {
          if (impact) setCards(impact.snapshot); // undo the optimistic move
          setImpact(null);
        }}
        onConfirm={(selectedIds) => {
          if (!impact) return;
          const { cardId, atIso, fromIso, snapshot } = impact;
          setImpact(null);
          startTransition(async () => {
            await persistReschedule(
              cardId,
              atIso,
              fromIso,
              snapshot,
              selectedIds,
            );
          });
        }}
      />
    </>
  );
}

/** Red tint alert row — unified error pattern (glowing dot + soft tint). */
function AlertBanner({ text }: { text: string }) {
  return (
    <p
      role="alert"
      className="animate-enter mb-3 flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 text-xs leading-relaxed text-red-200"
    >
      <span
        aria-hidden
        className="mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-red-400 shadow-[0_0_10px_rgba(239,68,68,0.7)]"
      />
      {text}
    </p>
  );
}

/** Designed empty state for a visible range with no dated cards. */
function RangeEmptyState() {
  return (
    <section className="animate-enter mb-3 rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_16px_48px_-16px_rgba(0,0,0,0.65)]">
      <div className="relative flex flex-col items-center gap-2.5 overflow-hidden rounded-[calc(1rem-1px)] bg-[#0a0a0b] px-6 py-8 text-center">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(24rem_10rem_at_50%_-3rem,rgba(129,140,248,0.11),transparent_70%)]"
        />
        <span
          aria-hidden
          className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-lg shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.16)]"
        >
          📅
        </span>
        <p className="relative text-sm text-neutral-400">{tr.board.empty}</p>
      </div>
    </section>
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
        className={`mb-1 flex items-center gap-1 text-xs tabular-nums ${
          isToday ? 'font-semibold text-indigo-200' : 'text-neutral-500'
        }`}
      >
        {isToday && (
          <span
            aria-hidden
            className="h-1 w-1 rounded-full bg-indigo-300 shadow-[0_0_6px_rgba(165,180,252,0.9)]"
          />
        )}
        {label}
      </span>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto overscroll-contain">
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
      className={`transition-opacity duration-200 ${isDragging ? 'opacity-40' : ''}`}
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
      <p className="whitespace-pre-wrap rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm leading-relaxed text-neutral-200 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
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
