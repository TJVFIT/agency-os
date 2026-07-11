'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';
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
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {tr.card.scheduledAt}
          </span>
          <input
            type="datetime-local"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-100 outline-none focus:border-neutral-400 [color-scheme:dark]"
          />
        </label>

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {tr.card.platforms}
          </span>
          {available.length === 0 ? (
            <p className="text-xs text-neutral-600">{tr.common.none}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {available.map((p) => {
                const on = selected.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggle(p)}
                    className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                      on
                        ? 'border-neutral-300 bg-neutral-800 text-neutral-100'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400 hover:border-neutral-600'
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
