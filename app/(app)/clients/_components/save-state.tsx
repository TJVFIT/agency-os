'use client';

import { tr } from '@/lib/i18n/tr';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Small inline indicator reused by every editor's save button row. */
export function SaveIndicator({
  state,
  errorText,
}: {
  state: SaveState;
  errorText?: string;
}) {
  if (state === 'saving')
    return (
      <span className="text-xs text-neutral-500">{tr.common.loading}</span>
    );
  if (state === 'saved')
    return <span className="text-xs text-emerald-400">{tr.common.saved}</span>;
  if (state === 'error')
    return (
      <span className="text-xs text-red-400">
        {errorText ?? tr.common.error}
      </span>
    );
  return null;
}
