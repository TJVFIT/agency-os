'use client';

import { useState } from 'react';

import { Button, Input, Label, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';

/** Editable add/remove list of plain strings (tone rules, banned words, …). */
export function StringList({
  label,
  items,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  items: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const [draft, setDraft] = useState('');

  function add() {
    const v = draft.trim();
    if (!v) return;
    onChange([...items, v]);
    setDraft('');
  }

  return (
    <div>
      <Label>{label}</Label>
      {items.length > 0 && (
        <ul className="mb-2 space-y-1">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-300 hover:border-white/[0.12]"
            >
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-neutral-200">
                {item}
              </span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-neutral-600 transition-colors duration-300 hover:bg-red-400/10 hover:text-red-300"
                aria-label={tr.common.remove}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-start gap-2">
        {multiline ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            rows={2}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        ) : (
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        )}
        <Button type="button" variant="secondary" onClick={add}>
          {tr.common.add}
        </Button>
      </div>
    </div>
  );
}
