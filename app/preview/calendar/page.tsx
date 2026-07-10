'use client';

/**
 * Demo calendar — static walkthrough page (/preview). Month view of Temmuz
 * 2026 with demo cards as client-colored pills; Ay/Hafta toggle switches to
 * one detailed week (6–12 Temmuz) with times. "Haftayı onaya gönder" shows a
 * toast-like chip. No Supabase, no drag-and-drop, no server actions.
 */

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui';
import { fmtIstanbul, fmtIstanbulTime } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';

import { DEMO_CARDS, DEMO_CLIENTS } from '../_demo/data';

/** Turkish short weekday headers, Monday-first. */
const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const MONTH_LABEL = 'Temmuz 2026';
const WEEK_LABEL = '6 – 12 Temmuz 2026';
const TODAY = '2026-07-10';

/** Monday 29 Haziran 2026 → Sunday 2 Ağustos 2026: 5 full grid rows. */
const GRID_DAYS = Array.from({ length: 35 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 5, 29) + i * 86_400_000);
  return {
    key: d.toISOString().slice(0, 10),
    day: d.getUTCDate(),
    inMonth: d.getUTCMonth() === 6,
  };
});

/** Detailed week for the Hafta view — the week containing "today". */
const WEEK_DAYS = GRID_DAYS.slice(7, 14); // 6–12 Temmuz

interface Pill {
  title: string;
  clientId: string;
  time: string;
}

/** Local demo-only placements to fill the month out (dataset extension is
 *  allowed only as local constants inside this page). */
const EXTRA_PILLS: Array<Pill & { day: string }> = [
  {
    day: '2026-07-06',
    time: '11:00',
    title: 'Margherita günü',
    clientId: 'c3',
  },
  {
    day: '2026-07-08',
    time: '18:00',
    title: 'Yeni şube açılışı',
    clientId: 'c1',
  },
  {
    day: '2026-07-14',
    time: '12:30',
    title: 'Usta eli kebap hikâyesi',
    clientId: 'c1',
  },
  {
    day: '2026-07-16',
    time: '09:00',
    title: 'Sabah açılış hikâyesi',
    clientId: 'c2',
  },
  {
    day: '2026-07-17',
    time: '13:00',
    title: 'Bayram menüsü duyurusu',
    clientId: 'c3',
  },
  {
    day: '2026-07-21',
    time: '10:30',
    title: 'Haftanın kahvesi: Fıstıklı Latte',
    clientId: 'c2',
  },
  {
    day: '2026-07-23',
    time: '17:00',
    title: 'Mutfaktan kısa reel',
    clientId: 'c1',
  },
  {
    day: '2026-07-28',
    time: '12:00',
    title: 'Yeni yaz menüsü tanıtımı',
    clientId: 'c1',
  },
  {
    day: '2026-07-30',
    time: '19:00',
    title: 'Uzayan peynir: künefe reel serisi',
    clientId: 'c3',
  },
];

const CLIENT_COLOR: Record<string, string> = Object.fromEntries(
  DEMO_CLIENTS.map((c) => [c.id, c.colors.primary]),
);

/** day (yyyy-MM-dd, Istanbul) → pills, from dated demo cards + local extras. */
const PILLS_BY_DAY: ReadonlyMap<string, Pill[]> = (() => {
  const map = new Map<string, Pill[]>();
  const add = (day: string, pill: Pill) => {
    const list = map.get(day);
    if (list) list.push(pill);
    else map.set(day, [pill]);
  };
  for (const c of DEMO_CARDS) {
    const ts = c.scheduled_at ?? c.due_at;
    if (!ts) continue;
    add(fmtIstanbul(ts, 'yyyy-MM-dd'), {
      title: c.title,
      clientId: c.client_id,
      time: fmtIstanbulTime(ts),
    });
  }
  for (const { day, ...pill } of EXTRA_PILLS) add(day, pill);
  return map;
})();

function PillChip({ pill, big }: { pill: Pill; big?: boolean }) {
  const color = CLIENT_COLOR[pill.clientId] ?? '#525252';
  return (
    <div
      className={`cursor-default rounded-md border transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 ${
        big ? 'px-2 py-1.5' : 'truncate px-1.5 py-0.5 text-[10px] leading-4'
      } text-neutral-200`}
      style={{ background: `${color}14`, borderColor: `${color}40` }}
      title={pill.title}
    >
      {big ? (
        <>
          <span className="flex items-center gap-1.5 text-[10px] tabular-nums text-neutral-400">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: color, boxShadow: `0 0 6px ${color}99` }}
            />
            {pill.time}
          </span>
          <span className="mt-0.5 block text-xs font-medium leading-snug">
            {pill.title}
          </span>
        </>
      ) : (
        <>
          <span
            aria-hidden
            className="mr-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
            style={{ background: color, boxShadow: `0 0 6px ${color}99` }}
          />
          {pill.title}
        </>
      )}
    </div>
  );
}

function DayCell({
  dayKey,
  label,
  dimmed,
  tall,
}: {
  dayKey: string;
  label: string;
  dimmed?: boolean;
  tall?: boolean;
}) {
  const isToday = dayKey === TODAY;
  const pills = PILLS_BY_DAY.get(dayKey) ?? [];
  return (
    <div
      className={`flex flex-col rounded-lg border p-1.5 transition-colors duration-300 ${
        tall ? 'min-h-72' : 'min-h-24'
      } ${dimmed ? 'opacity-40' : ''} ${
        isToday
          ? 'border-indigo-300/40 bg-indigo-400/[0.06] shadow-[inset_0_1px_0_rgba(165,180,252,0.15)]'
          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'
      }`}
    >
      <span
        className={`mb-1 text-xs tabular-nums ${
          isToday ? 'font-semibold text-indigo-200' : 'text-neutral-500'
        }`}
      >
        {isToday ? `• ${label}` : label}
      </span>
      <div className={`flex flex-1 flex-col ${tall ? 'gap-1.5' : 'gap-1'}`}>
        {pills.map((pill, i) => (
          <PillChip key={i} pill={pill} big={tall} />
        ))}
      </div>
    </div>
  );
}

export default function PreviewCalendarPage() {
  const [view, setView] = useState<'month' | 'week'>('month');
  const [toast, setToast] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  function sendWeekForApproval() {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setToast(true);
    timer.current = window.setTimeout(() => setToast(false), 2600);
  }

  return (
    <>
      <header className="animate-enter mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-50">
          {tr.calendar.title}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {(['month', 'week'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  view === v
                    ? 'bg-neutral-50 text-neutral-950 shadow-[0_2px_8px_rgba(255,255,255,0.15)]'
                    : 'text-neutral-400 hover:text-neutral-100'
                }`}
              >
                {v === 'month' ? tr.calendar.monthView : tr.calendar.weekView}
              </button>
            ))}
          </div>
          <Button variant="secondary" onClick={sendWeekForApproval}>
            {tr.calendar.sendWeekForApproval}
          </Button>
        </div>
      </header>

      {/* Range strip + client legend */}
      <div className="animate-enter mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium tracking-tight text-neutral-200">
          {view === 'month' ? MONTH_LABEL : WEEK_LABEL}
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {DEMO_CLIENTS.map((c) => (
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
      </div>

      <div className="animate-enter overflow-x-auto pb-2">
        <div className="min-w-[640px]">
          {/* Weekday header */}
          <div className="mb-1 grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((w, i) => (
              <div
                key={w}
                className="px-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500"
              >
                {view === 'week' ? `${w} ${WEEK_DAYS[i].day}` : w}
              </div>
            ))}
          </div>

          {view === 'month' ? (
            <div className="stagger-children space-y-1.5">
              {[0, 1, 2, 3, 4].map((w) => (
                <div key={w} className="grid grid-cols-7 gap-1.5">
                  {GRID_DAYS.slice(w * 7, w * 7 + 7).map((d) => (
                    <DayCell
                      key={d.key}
                      dayKey={d.key}
                      label={String(d.day)}
                      dimmed={!d.inMonth}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="stagger-children grid grid-cols-7 gap-1.5">
              {WEEK_DAYS.map((d) => (
                <DayCell
                  key={d.key}
                  dayKey={d.key}
                  label={String(d.day)}
                  tall
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div
          role="status"
          className="animate-enter fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full border border-emerald-400/25 bg-[#0a0a0b]/95 px-4 py-2 text-sm text-emerald-200 shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_0_1px_rgba(52,211,153,0.1)] backdrop-blur"
        >
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
          />
          {tr.approval.linkCreated}
        </div>
      )}
    </>
  );
}
