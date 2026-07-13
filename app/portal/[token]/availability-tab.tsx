'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input } from '@/components/ui';
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

  return (
    <div className="space-y-4">
      {sent ? (
        <p className="animate-enter rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-200">
          {tr.portal.availabilitySent}
        </p>
      ) : (
        <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <Field label={tr.production.leaveStart}>
            <Input
              type="datetime-local"
              className="[color-scheme:dark]"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label={tr.production.leaveEnd}>
            <Input
              type="datetime-local"
              className="[color-scheme:dark]"
              value={endsAt}
              min={startsAt || undefined}
              onChange={(e) => setEndsAt(e.target.value)}
            />
          </Field>
          <Field label={tr.portal.availabilityNote}>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </Field>
          <Button
            variant="primary"
            className="w-full !py-3.5"
            disabled={pending || !valid}
            onClick={submit}
          >
            {pending ? tr.common.loading : tr.portal.availabilityAdd}
          </Button>
          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-center text-xs text-red-300">
              {tr.common.error}
            </p>
          )}
        </div>
      )}

      {windows.length > 0 && (
        <ul className="stagger-children space-y-2">
          {windows.map((w) => (
            <li
              key={w.id}
              className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
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
