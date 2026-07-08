'use client';

import { useState, useTransition } from 'react';

import { Button, Input, Panel } from '@/components/ui';
import { updateClientAction } from '@/lib/actions/clients';
import { tr } from '@/lib/i18n/tr';

import { SaveIndicator, type SaveState } from './save-state';

/** Normalize to a bare tag without leading '#', trimmed, no spaces. */
function norm(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, '');
}

export function HashtagBankEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: string[];
}) {
  const [tags, setTags] = useState<string[]>(initial);
  const [draft, setDraft] = useState('');
  const [state, setState] = useState<SaveState>('idle');
  const [pending, startTransition] = useTransition();

  function add() {
    const v = norm(draft);
    if (!v) return;
    if (!tags.includes(v)) setTags((prev) => [...prev, v]);
    setDraft('');
  }

  function save() {
    setState('saving');
    startTransition(async () => {
      const res = await updateClientAction({ clientId, hashtagBank: tags });
      setState(res.ok ? 'saved' : 'error');
    });
  }

  return (
    <Panel
      title={tr.clients.hashtagBank}
      actions={
        <div className="flex items-center gap-2">
          <SaveIndicator state={state} />
          <Button variant="primary" onClick={save} disabled={pending}>
            {tr.common.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5">
            {tags.map((t) => (
              <li
                key={t}
                className="flex items-center gap-1 rounded-full border border-neutral-700 bg-neutral-950 px-2 py-0.5 text-xs text-sky-300"
              >
                <span>#{t}</span>
                <button
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  className="text-neutral-500 hover:text-red-400"
                  aria-label={tr.common.remove}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={tr.clients.hashtagPlaceholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={add}>
            {tr.common.add}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
