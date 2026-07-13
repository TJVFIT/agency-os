'use client';

import { useState } from 'react';

import { Button, Field, Input } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { istanbulToUtc } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import { PLATFORMS, type Platform } from '@/lib/db/types';

export interface ScheduleAccount {
  id: string;
  platform: string;
  handle: string;
}

function isPlatform(v: string): v is Platform {
  return (PLATFORMS as readonly string[]).includes(v);
}

/** Schedule dialog: datetime-local (Istanbul) + platform checkboxes. */
export function ScheduleDialog({
  open,
  onClose,
  accounts,
  currentPlatforms,
  pending,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  accounts: ScheduleAccount[];
  currentPlatforms: string[];
  pending: boolean;
  onSubmit: (input: { scheduledAt: string; platforms: Platform[] }) => void;
}) {
  // Distinct platforms the client actually has connected accounts for.
  const available = Array.from(
    new Set(accounts.map((a) => a.platform).filter(isPlatform)),
  ) as Platform[];

  const [local, setLocal] = useState('');
  // Preselect only card platforms that have a matching connected account —
  // orphans have no checkbox and must not be silently submitted.
  const [selected, setSelected] = useState<Platform[]>(
    currentPlatforms.filter(
      (p): p is Platform => isPlatform(p) && available.includes(p),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  function toggle(p: Platform) {
    setSelected((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  function submit() {
    setError(null);
    if (!local) {
      setError(tr.statusReasons.schedule_requires_future_date);
      return;
    }
    const utc = istanbulToUtc(local);
    if (utc.getTime() <= Date.now()) {
      setError(tr.statusReasons.schedule_requires_future_date);
      return;
    }
    // Guard against submitting platforms with no connected account.
    const platforms = selected.filter((p) => available.includes(p));
    if (platforms.length === 0) {
      setError(tr.statusReasons.schedule_requires_platform);
      return;
    }
    onSubmit({ scheduledAt: utc.toISOString(), platforms });
  }

  return (
    <Dialog open={open} onClose={onClose} title={tr.card.scheduleTitle}>
      <div className="space-y-4">
        <Field label={tr.card.scheduledAt}>
          <Input
            type="datetime-local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className="[color-scheme:dark]"
          />
        </Field>

        <div>
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            {tr.card.platforms}
          </span>
          {available.length === 0 ? (
            <p className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs text-neutral-500">
              {tr.common.none}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {available.map((p) => {
                const on = selected.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggle(p)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                      on
                        ? 'border-indigo-300/40 bg-indigo-400/10 text-indigo-200 shadow-[0_0_0_3px_rgba(129,140,248,0.12)]'
                        : 'border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-neutral-200'
                    }`}
                  >
                    {on ? '✓ ' : ''}
                    {tr.platforms[p]}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tr.common.cancel}
          </Button>
          <Button
            type="button"
            variant="primary"
            disabled={pending}
            onClick={submit}
          >
            {pending ? tr.common.loading : tr.card.schedule}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
