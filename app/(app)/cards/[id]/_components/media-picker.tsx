'use client';

import { useState } from 'react';

import { Button, Label } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { tr } from '@/lib/i18n/tr';
import type { Enums } from '@/lib/db/types';

export interface PickableAsset {
  id: string;
  kind: Enums<'asset_kind'>;
  source: Enums<'asset_source'>;
  name: string;
  /** R2 key of a preview rendition (not a public URL; shown as a label). */
  thumbKey: string;
}

const KIND_ICON: Record<Enums<'asset_kind'>, string> = {
  image: '🖼',
  video: '🎬',
  other: '📄',
};

/** Dialog to (de)select client assets for the current-lang content. */
export function MediaPicker({
  assets,
  selectedIds,
  onChange,
}: {
  assets: PickableAsset[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selectedIds);

  function openDialog() {
    setDraft(selectedIds);
    setOpen(true);
  }

  function toggle(id: string) {
    setDraft((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  const selected = new Set(selectedIds);
  const attached = assets.filter((a) => selected.has(a.id));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Label className="mb-0">{tr.card.media}</Label>
        <Button type="button" variant="secondary" onClick={openDialog}>
          {tr.card.chooseMedia}
        </Button>
      </div>

      {attached.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-3 py-2.5 text-xs text-neutral-500">
          <span aria-hidden className="opacity-60">
            🖼
          </span>
          {tr.card.noMedia}
        </p>
      ) : (
        <ul className="stagger-children flex flex-wrap gap-2">
          {attached.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-colors duration-300 hover:border-white/20"
            >
              <span aria-hidden>{KIND_ICON[a.kind]}</span>
              <span className="max-w-[10rem] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((x) => x !== a.id))}
                className="rounded-full text-neutral-500 transition-colors duration-300 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40"
                aria-label={tr.common.remove}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr.card.chooseMedia}
      >
        {assets.length === 0 ? (
          <div className="animate-enter flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center">
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
            >
              🖼
            </span>
            <p className="text-xs text-neutral-500">{tr.assets.empty}</p>
          </div>
        ) : (
          <div className="stagger-children grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {assets.map((a) => {
              const on = draft.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggle(a.id)}
                  aria-pressed={on}
                  className={`flex flex-col gap-1 rounded-xl border p-2 text-left text-xs transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40 ${
                    on
                      ? 'border-indigo-300/40 bg-indigo-400/10 shadow-[0_0_0_3px_rgba(129,140,248,0.12)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span aria-hidden className="text-lg">
                      {KIND_ICON[a.kind]}
                    </span>
                    <span
                      aria-hidden
                      className={`flex h-4 w-4 items-center justify-center rounded-full border text-[9px] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                        on
                          ? 'border-indigo-300/40 bg-indigo-400/20 text-indigo-100'
                          : 'border-white/10 bg-white/[0.03] text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  </span>
                  <span className="truncate text-neutral-200">{a.name}</span>
                  <span className="text-[11px] text-neutral-600">
                    {tr.assets.sources[a.source]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            {tr.common.cancel}
          </Button>
          <Button type="button" variant="primary" onClick={apply}>
            {tr.common.confirm}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
