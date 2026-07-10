'use client';

import { useState, useTransition } from 'react';

import { tr } from '@/lib/i18n/tr';
import { fmtIstanbul, fmtIstanbulTime } from '@/lib/dates';
import type { PortalAvailability } from '@/lib/portal/service';
import { submitPortalAvailability } from './actions';

/** Müsaitlik tab — datetime-local range + note, plus upcoming windows. */
export function AvailabilityTab({
  token,
  windows,
}: {
  token: string;
  windows: PortalAvailability[];
}) {
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const valid = startsAt !== '' && endsAt !== '' && endsAt > startsAt;

  function submit() {
    if (!valid) return;
    setError(false);
    startTransition(async () => {
      const res = await submitPortalAvailability({
        token,
        startsAt,
        endsAt,
        note: note.trim(),
      });
      if (res.ok) {
        setSent(true);
        setStartsAt('');
        setEndsAt('');
        setNote('');
      } else {
        setError(true);
      }
    });
  }

  const inputCls =
    'w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none [color-scheme:dark] placeholder:text-neutral-600 focus:border-neutral-400';

  return (
    <div className="space-y-4">
      {sent ? (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950 p-4 text-center text-sm text-emerald-200">
          {tr.portal.availabilitySent}
        </p>
      ) : (
        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
            className={inputCls}
          />
          <input
            type="datetime-local"
            value={endsAt}
            min={startsAt || undefined}
            onChange={(e) => setEndsAt(e.target.value)}
            className={inputCls}
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={tr.portal.availabilityNote}
            maxLength={500}
            className={inputCls}
          />
          <button
            onClick={submit}
            disabled={pending || !valid}
            className="w-full rounded-lg bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-950 disabled:opacity-40"
          >
            {pending ? tr.common.loading : tr.portal.availabilityAdd}
          </button>
          {error && (
            <p className="text-center text-xs text-red-400">
              {tr.common.error}
            </p>
          )}
        </div>
      )}

      {windows.length > 0 && (
        <ul className="space-y-2">
          {windows.map((w) => (
            <li
              key={w.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            >
              <p className="text-sm text-neutral-200">
                {fmtIstanbul(w.startsAt)} – {fmtIstanbulTime(w.endsAt)}
              </p>
              {w.note && (
                <p className="mt-0.5 text-xs text-neutral-500">{w.note}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
