'use client';

/**
 * Demo calendar — live local workspace (/preview). Month/week views over the
 * visitor's own scheduled cards (Istanbul wall-clock, client-colored pills).
 * Clicking a pill reopens the shared schedule dialog to move it; the strip
 * below pulls approved-but-unplaced cards onto the calendar. ‹ › navigates
 * months; the view starts on the current month.
 */

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button, Panel } from '@/components/ui';
import { fmtIstanbul, fmtIstanbulTime, istanbulDateString } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';

import { ScheduleDialog } from '../_demo/schedule-dialog';
import { useDemoStore, type StoreCard, type StoreClient } from '../_demo/store';

/** Turkish short weekday headers, Monday-first. */
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const DAY_MS = 86_400_000;

interface GridDay {
  key: string; // yyyy-MM-dd
  day: number;
  inMonth: boolean;
}

/** Monday-first grid of full weeks covering the given month. */
function buildGrid(year: number, month: number): GridDay[] {
  const first = Date.UTC(year, month, 1);
  const offset = (new Date(first).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((offset + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(first + (i - offset) * DAY_MS);
    return {
      key: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === month,
    };
  });
}

interface Pill {
  card: StoreCard;
  time: string;
  color: string;
}

function PillChip({
  pill,
  big,
  onPick,
}: {
  pill: Pill;
  big?: boolean;
  onPick: (card: StoreCard) => void;
}) {
  const { card, color, time } = pill;
  return (
    <button
      type="button"
      onClick={() => onPick(card)}
      title={`${time} · ${card.title}`}
      className={`w-full rounded-md border text-left text-neutral-200 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:border-white/25 ${
        big ? 'px-2 py-1.5' : 'truncate px-1.5 py-0.5 text-[10px] leading-4'
      }`}
      style={{ background: `${color}14`, borderColor: `${color}40` }}
    >
      {big ? (
        <>
          <span className="flex items-center gap-1.5 text-[10px] tabular-nums text-neutral-400">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 6px ${color}99` }}
            />
            {time}
          </span>
          <span className="mt-0.5 block text-xs font-medium leading-snug">
            {card.title}
          </span>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
            style={{ background: color, boxShadow: `0 0 6px ${color}99` }}
          />
          <span className="tabular-nums text-neutral-400">{time}</span>{' '}
          {card.title}
        </>
      )}
    </button>
  );
}

function DayCell({
  day,
  isToday,
  pills,
  tall,
  onPick,
}: {
  day: GridDay;
  isToday: boolean;
  pills: Pill[];
  tall?: boolean;
  onPick: (card: StoreCard) => void;
}) {
  return (
    <div
      className={`flex flex-col rounded-lg border p-1.5 transition-colors duration-300 ${
        tall ? 'min-h-72' : 'min-h-24'
      } ${day.inMonth ? '' : 'opacity-40'} ${
        isToday
          ? 'border-indigo-300/40 bg-indigo-400/[0.06] shadow-[inset_0_1px_0_rgba(165,180,252,0.15),0_0_24px_-8px_rgba(129,140,248,0.45)]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.03]'
      }`}
    >
      <span
        className={`mb-1 text-xs tabular-nums ${
          isToday ? 'font-semibold text-indigo-200' : 'text-neutral-500'
        }`}
      >
        {isToday ? `• ${day.day}` : day.day}
      </span>
      <div className={`flex flex-1 flex-col ${tall ? 'gap-1.5' : 'gap-1'}`}>
        {pills.map((pill) => (
          <PillChip key={pill.card.id} pill={pill} big={tall} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

export default function PreviewCalendarPage() {
  const store = useDemoStore();
  const todayKey = istanbulDateString(new Date());
  const [view, setView] = useState<'month' | 'week'>('month');
  const [cursor, setCursor] = useState(() => {
    const [y, m] = todayKey.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const [scheduling, setScheduling] = useState<StoreCard | null>(null);

  const clientById = useMemo(
    () => new Map<string, StoreClient>(store.clients.map((c) => [c.id, c])),
    [store.clients],
  );

  const grid = useMemo(() => buildGrid(cursor.y, cursor.m), [cursor]);

  /** Week row: the one containing today when visible, else the first row. */
  const weekDays = useMemo(() => {
    const idx = grid.findIndex((d) => d.key === todayKey);
    const start = idx >= 0 ? Math.floor(idx / 7) * 7 : 0;
    return grid.slice(start, start + 7);
  }, [grid, todayKey]);

  const pillsByDay = useMemo(() => {
    const map = new Map<string, Pill[]>();
    for (const card of store.cards) {
      if (!card.scheduledAt) continue;
      const key = fmtIstanbul(card.scheduledAt, 'yyyy-MM-dd');
      const pill: Pill = {
        card,
        time: fmtIstanbulTime(card.scheduledAt),
        color: clientById.get(card.clientId)?.colors.primary ?? '#525252',
      };
      const list = map.get(key);
      if (list) list.push(pill);
      else map.set(key, [pill]);
    }
    for (const list of map.values())
      list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [store.cards, clientById]);

  const scheduledCount = useMemo(
    () => store.cards.filter((c) => c.scheduledAt !== null).length,
    [store.cards],
  );

  /** Approved (or dateless "scheduled") cards waiting for a slot. */
  const unscheduled = useMemo(
    () =>
      store.cards.filter(
        (c) =>
          c.scheduledAt === null &&
          (c.status === 'approved' || c.status === 'scheduled'),
      ),
    [store.cards],
  );

  const monthLabel = fmtIstanbul(
    new Date(Date.UTC(cursor.y, cursor.m, 15, 12)),
    'LLLL yyyy',
  );

  if (!store.hydrated) return null;

  const navBtn =
    'flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 hover:bg-white/[0.08] hover:text-neutral-100 active:scale-[0.92]';

  return (
    <>
      <header className="animate-enter mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-50">
          {tr.calendar.title}
        </h1>
        <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          {(['month', 'week'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${
                view === v
                  ? 'bg-neutral-50 text-neutral-950 shadow-[0_2px_8px_rgba(255,255,255,0.15)]'
                  : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              {v === 'month' ? tr.calendar.monthView : tr.calendar.weekView}
            </button>
          ))}
        </div>
      </header>

      {/* Month navigation + client legend */}
      <div className="animate-enter mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="inline-flex items-center gap-1">
          <button
            aria-label={tr.demo.prevMonth}
            title={tr.demo.prevMonth}
            onClick={() =>
              setCursor(({ y, m }) =>
                m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 },
              )
            }
            className={navBtn}
          >
            ‹
          </button>
          <span className="min-w-32 text-center text-sm font-medium tracking-tight text-neutral-200">
            {monthLabel}
          </span>
          <button
            aria-label={tr.demo.nextMonth}
            title={tr.demo.nextMonth}
            onClick={() =>
              setCursor(({ y, m }) =>
                m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 },
              )
            }
            className={navBtn}
          >
            ›
          </button>
        </div>
        {store.clients.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {store.clients.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] text-neutral-400"
              >
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background: c.colors.primary,
                    boxShadow: `0 0 6px ${c.colors.primary}99`,
                  }}
                />
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Inviting empty state — nothing on the calendar yet */}
      {scheduledCount === 0 && (
        <section className="animate-enter mb-3 rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_16px_48px_-16px_rgba(0,0,0,0.65)]">
          <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-[calc(1rem-1px)] bg-[#0a0a0b] px-6 py-10 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(24rem_12rem_at_50%_-3rem,rgba(129,140,248,0.11),transparent_70%)]"
            />
            <span
              aria-hidden
              className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.16)]"
            >
              📅
            </span>
            <p className="relative max-w-sm text-sm leading-relaxed text-neutral-400">
              {tr.demo.noScheduled}
            </p>
            {unscheduled.length > 0 ? (
              <Button
                variant="primary"
                className="relative shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08),0_0_40px_-8px_rgba(165,180,252,0.45)]"
                onClick={() => setScheduling(unscheduled[0])}
              >
                {tr.card.schedule}
              </Button>
            ) : (
              <Link
                href="/preview/board"
                className="group relative inline-flex items-center gap-1.5 rounded-full bg-neutral-50 px-3.5 py-1.5 text-sm font-medium text-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_4px_16px_rgba(255,255,255,0.08),0_0_40px_-8px_rgba(165,180,252,0.45)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white active:scale-[0.97]"
              >
                {tr.demo.newContent}
                <span
                  aria-hidden
                  className="flex h-5 w-5 items-center justify-center rounded-full bg-black/10 text-[11px] transition-transform duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.1)] group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>
            )}
          </div>
        </section>
      )}

      <div className="animate-enter overflow-x-auto pb-2">
        <div className="min-w-[640px]">
          {/* Weekday header */}
          <div className="mb-1 grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className="px-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500"
              >
                {view === 'week' ? `${w} ${weekDays[i]?.day ?? ''}` : w}
              </div>
            ))}
          </div>

          {view === 'month' ? (
            <div className="stagger-children space-y-1.5">
              {Array.from({ length: grid.length / 7 }, (_, w) => (
                <div key={w} className="grid grid-cols-7 gap-1.5">
                  {grid.slice(w * 7, w * 7 + 7).map((d) => (
                    <DayCell
                      key={d.key}
                      day={d}
                      isToday={d.key === todayKey}
                      pills={pillsByDay.get(d.key) ?? []}
                      onPick={setScheduling}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="stagger-children grid grid-cols-7 gap-1.5">
              {weekDays.map((d) => (
                <DayCell
                  key={d.key}
                  day={d}
                  isToday={d.key === todayKey}
                  pills={pillsByDay.get(d.key) ?? []}
                  tall
                  onPick={setScheduling}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Unscheduled strip — approved cards waiting for a publish slot */}
      {unscheduled.length > 0 && (
        <Panel title={tr.demo.unscheduledStrip} className="animate-enter mt-4">
          <ul className="stagger-children space-y-2">
            {unscheduled.map((card) => {
              const client = clientById.get(card.clientId);
              const color = client?.colors.primary ?? '#525252';
              return (
                <li
                  key={card.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.05]"
                >
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{
                      background: color,
                      boxShadow: `0 0 8px ${color}99`,
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">
                    {card.title}
                  </span>
                  <span className="shrink-0 text-xs text-neutral-500">
                    {client?.name ?? '—'}
                  </span>
                  <span className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.04] px-1.5 py-px text-[10px] text-neutral-500">
                    {tr.cardTypes[card.type]}
                  </span>
                  <Button
                    variant="secondary"
                    className="shrink-0"
                    onClick={() => setScheduling(card)}
                  >
                    {tr.card.schedule}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {scheduling && (
        <ScheduleDialog card={scheduling} onClose={() => setScheduling(null)} />
      )}
    </>
  );
}
