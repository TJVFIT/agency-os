'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import { fmtIstanbul, fmtIstanbulTime } from '@/lib/dates';
import type { PortalAvailability } from '@/lib/portal/service';
import { submitPortalAvailability } from './actions';
import { Bezel, ROW, SectionLabel, StatusNote } from './glass';

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
        <StatusNote tone="success" className="!rounded-xl !p-4 !text-sm">
          {tr.portal.availabilitySent}
        </StatusNote>
      ) : (
        <Bezel innerClassName="space-y-3 p-3.5">
          <Field label={tr.production.leaveStart}>
            <Input
              type="datetime-local"
              className="tabular-nums [color-scheme:dark]"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
            />
          </Field>
          <Field label={tr.production.leaveEnd}>
            <Input
              type="datetime-local"
              className="tabular-nums [color-scheme:dark]"
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
          {error && <StatusNote tone="error">{tr.common.error}</StatusNote>}
        </Bezel>
      )}

      {windows.length > 0 && (
        <section>
          <SectionLabel count={windows.length}>
            {tr.portal.tabs.availability}
          </SectionLabel>
          <ul className="stagger-children space-y-2">
            {windows.map((w) => (
              <li key={w.id} className={`px-3 py-2.5 ${ROW}`}>
                <p className="text-sm tabular-nums text-neutral-200">
                  {fmtIstanbul(w.startsAt)} – {fmtIstanbulTime(w.endsAt)}
                </p>
                {w.note && (
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-500">
                    {w.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
