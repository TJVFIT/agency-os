'use client';

import { tr } from '@/lib/i18n/tr';

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const CONFIG: Record<
  Exclude<SaveState, 'idle'>,
  { dot: string; text: string }
> = {
  saving: { dot: 'animate-pulse bg-neutral-500', text: 'text-neutral-500' },
  saved: {
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
    text: 'text-emerald-300',
  },
  error: {
    dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]',
    text: 'text-red-300',
  },
};

/** Subtle dot + label indicator reused by every editor's save button row. */
export function SaveIndicator({
  state,
  errorText,
}: {
  state: SaveState;
  errorText?: string;
}) {
  if (state === 'idle') return null;
  const { dot, text } = CONFIG[state];
  const label =
    state === 'saving'
      ? tr.common.loading
      : state === 'saved'
        ? tr.common.saved
        : (errorText ?? tr.common.error);

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors duration-300 ${text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}
