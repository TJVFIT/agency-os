'use client';

/**
 * Shared "pick when this goes live" dialog — the client-facing scheduling
 * moment of the demo workspace. Opened from the board (approved cards) and
 * the calendar (pills + unscheduled strip). Treats the datetime-local value
 * as Istanbul wall-clock, stores UTC ISO via store.scheduleCard (which also
 * logs to the live feed).
 */

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button, Field, Input, Label } from '@/components/ui';
import { fmtIstanbul, istanbulToUtc } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';

import { useDemoStore, type StoreCard } from './store';

function platformLabel(platform: string): string {
  return platform in tr.platforms
    ? tr.platforms[platform as keyof typeof tr.platforms]
    : platform;
}

/** Modal chrome shared by the demo dialogs (schedule, new content…). */
export function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="animate-enter w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <section className="rounded-2xl bg-gradient-to-b from-white/[0.14] via-white/[0.05] to-white/[0.02] p-px shadow-[0_24px_80px_-16px_rgba(0,0,0,0.9),0_0_64px_-24px_rgba(129,140,248,0.3)]">
          <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <h2 className="text-sm font-semibold tracking-tight text-neutral-100">
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label={tr.common.close}
                className="flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.06] hover:text-neutral-200 active:scale-[0.92]"
              >
                ✕
              </button>
            </header>
            <div className="p-4">{children}</div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function ScheduleDialog({
  card,
  onClose,
}: {
  card: StoreCard;
  onClose: () => void;
}) {
  const store = useDemoStore();
  const client = store.clients.find((c) => c.id === card.clientId);
  const color = client?.colors.primary ?? '#525252';

  /** One checkbox per platform — first handle wins if a platform repeats. */
  const accountOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of client?.accounts ?? []) {
      if (!seen.has(a.platform)) seen.set(a.platform, a.handle);
    }
    return [...seen.entries()].map(([platform, handle]) => ({
      platform,
      handle,
    }));
  }, [client]);

  const [value, setValue] = useState(() =>
    card.scheduledAt
      ? fmtIstanbul(card.scheduledAt, "yyyy-MM-dd'T'HH:mm")
      : `${fmtIstanbul(new Date(Date.now() + 86_400_000), 'yyyy-MM-dd')}T12:00`,
  );
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => {
    const owned = new Set(accountOptions.map((o) => o.platform));
    const fromCard = card.platforms.filter((p) => owned.has(p));
    return new Set(fromCard.length > 0 ? fromCard : [...owned]);
  });
  const [done, setDone] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const picked = value ? istanbulToUtc(value) : null;
  // eslint-disable-next-line react-hooks/purity -- intentional wall-clock read: "is the picked time still in the future" must reflect now
  const isFuture = picked !== null && picked.getTime() > Date.now();
  const needsPlatform = accountOptions.length > 0 && selected.size === 0;
  const canConfirm = isFuture && !needsPlatform && !done;

  function toggle(platform: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  function confirmSchedule() {
    if (!canConfirm || picked === null) return;
    store.scheduleCard(card.id, picked.toISOString(), [...selected]);
    setDone(true);
    timer.current = window.setTimeout(onClose, 1200);
  }

  return (
    <DialogShell title={tr.demo.schedulePost} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-neutral-500">
          {tr.demo.scheduleHelp}
        </p>

        {/* Which card is being placed — client color + title for context. */}
        <div className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: color, boxShadow: `0 0 8px ${color}99` }}
          />
          <span className="min-w-0 truncate text-sm font-medium text-neutral-100">
            {card.title}
          </span>
          <span className="ml-auto shrink-0 text-xs text-neutral-500">
            {client?.name ?? '—'}
          </span>
        </div>

        <Field label={tr.card.scheduledAt}>
          <Input
            type="datetime-local"
            required
            className="[color-scheme:dark]"
            value={value}
            min={fmtIstanbul(new Date(), "yyyy-MM-dd'T'HH:mm")}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        {value !== '' && !isFuture && (
          <p className="text-xs text-amber-300/90">
            {tr.statusReasons.schedule_requires_future_date}
          </p>
        )}

        <div>
          <Label>{tr.card.platforms}</Label>
          {accountOptions.length === 0 ? (
            <Link
              href="/preview/clients"
              className="group flex items-center justify-between gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5 text-sm text-neutral-400 transition-colors duration-300 hover:border-white/20 hover:text-neutral-200"
            >
              {tr.demo.connectAccounts}
              <span
                aria-hidden
                className="transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:translate-x-0.5"
              >
                →
              </span>
            </Link>
          ) : (
            <div className="grid gap-1.5">
              {accountOptions.map(({ platform, handle }) => {
                const checked = selected.has(platform);
                return (
                  <label
                    key={platform}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                      checked
                        ? 'border-indigo-300/40 bg-indigo-400/[0.08] text-neutral-100 shadow-[0_0_0_3px_rgba(129,140,248,0.08),inset_0_1px_0_rgba(255,255,255,0.05)]'
                        : 'border-white/[0.08] bg-white/[0.02] text-neutral-400 hover:border-white/15'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(platform)}
                      className="h-3.5 w-3.5 accent-indigo-400"
                    />
                    <span className="font-medium">
                      {platformLabel(platform)}
                    </span>
                    <span className="ml-auto font-mono text-xs text-neutral-500">
                      @{handle.replace(/^@/, '')}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {needsPlatform && (
            <p className="mt-1.5 text-xs text-amber-300/90">
              {tr.statusReasons.schedule_requires_platform}
            </p>
          )}
        </div>

        {done ? (
          <div
            role="status"
            className="animate-enter flex items-center justify-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200 shadow-[0_0_32px_-8px_rgba(52,211,153,0.4),inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            />
            {tr.demo.scheduledOk}
          </div>
        ) : (
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              {tr.common.cancel}
            </Button>
            <Button
              variant="primary"
              disabled={!canConfirm}
              onClick={confirmSchedule}
            >
              {tr.common.confirm}
            </Button>
          </div>
        )}
      </div>
    </DialogShell>
  );
}
