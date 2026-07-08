'use client';

import { useState } from 'react';

import { Button } from '@/components/ui';
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
        <span className="text-xs font-medium text-neutral-400">
          {tr.card.media}
        </span>
        <Button type="button" variant="secondary" onClick={openDialog}>
          {tr.card.chooseMedia}
        </Button>
      </div>

      {attached.length === 0 ? (
        <p className="rounded-md border border-dashed border-neutral-800 px-3 py-2 text-xs text-neutral-600">
          {tr.card.noMedia}
        </p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {attached.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
            >
              <span>{KIND_ICON[a.kind]}</span>
              <span className="max-w-[10rem] truncate">{a.name}</span>
              <button
                type="button"
                onClick={() => onChange(selectedIds.filter((x) => x !== a.id))}
                className="text-neutral-500 hover:text-red-400"
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
          <p className="text-sm text-neutral-400">{tr.assets.empty}</p>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {assets.map((a) => {
              const on = draft.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => toggle(a.id)}
                  className={`flex flex-col gap-1 rounded-lg border p-2 text-left text-xs transition-colors ${
                    on
                      ? 'border-neutral-300 bg-neutral-800'
                      : 'border-neutral-800 bg-neutral-950 hover:border-neutral-600'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-lg">{KIND_ICON[a.kind]}</span>
                    <span
                      className={`text-[0.65rem] ${
                        on ? 'text-neutral-100' : 'text-neutral-600'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                  </span>
                  <span className="truncate text-neutral-200">{a.name}</span>
                  <span className="text-[0.65rem] text-neutral-600">
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
