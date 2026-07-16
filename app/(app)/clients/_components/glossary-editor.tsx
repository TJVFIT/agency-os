'use client';

import { useState, useTransition } from 'react';

import { Button, Input, Panel, Select } from '@/components/ui';
import { updateClientAction } from '@/lib/actions/clients';
import type { GlossaryEntry } from '@/lib/db/domain';
import { tr } from '@/lib/i18n/tr';

import { CountChip, EmptyState } from './empty-state';
import { SaveIndicator, type SaveState } from './save-state';

type Row = { term: string; rule: 'keep' | 'translate_to'; value: string };

export function GlossaryEditor({
  clientId,
  initial,
}: {
  clientId: string;
  initial: GlossaryEntry[];
}) {
  const [rows, setRows] = useState<Row[]>(
    initial.map((e) => ({
      term: e.term,
      rule: e.rule,
      value: e.value ?? '',
    })),
  );
  const [state, setState] = useState<SaveState>('idle');
  const [pending, startTransition] = useTransition();

  function update(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { term: '', rule: 'keep', value: '' }]);
  }

  function save() {
    setState('saving');
    const glossary: GlossaryEntry[] = rows
      .filter((r) => r.term.trim())
      .map((r) =>
        r.rule === 'translate_to'
          ? { term: r.term.trim(), rule: 'translate_to', value: r.value.trim() }
          : { term: r.term.trim(), rule: 'keep' },
      );
    startTransition(async () => {
      const res = await updateClientAction({ clientId, glossary });
      setState(res.ok ? 'saved' : 'error');
    });
  }

  return (
    <Panel
      title={tr.clients.glossary}
      actions={
        <div className="flex items-center gap-2">
          <SaveIndicator state={state} />
          <CountChip value={rows.length} />
          <Button variant="primary" onClick={save} disabled={pending}>
            {tr.common.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-2">
        {rows.length === 0 && (
          <EmptyState compact icon="📖" text={tr.common.none} />
        )}
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex flex-wrap items-start gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-300 hover:border-white/[0.12]"
          >
            <Input
              value={row.term}
              onChange={(e) => update(i, { term: e.target.value })}
              placeholder={tr.clients.glossaryTerm}
              className="min-w-[7rem] flex-1"
            />
            <Select
              value={row.rule}
              onChange={(e) =>
                update(i, { rule: e.target.value as Row['rule'] })
              }
            >
              <option value="keep">{tr.clients.glossaryKeep}</option>
              <option value="translate_to">
                {tr.clients.glossaryTranslateTo}
              </option>
            </Select>
            {row.rule === 'translate_to' && (
              <Input
                value={row.value}
                onChange={(e) => update(i, { value: e.target.value })}
                placeholder={tr.clients.glossaryValue}
                className="min-w-[7rem] flex-1"
              />
            )}
            <button
              type="button"
              onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
              className="mt-1.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-neutral-600 transition-colors duration-300 hover:bg-red-400/10 hover:text-red-300"
              aria-label={tr.common.remove}
            >
              ✕
            </button>
          </div>
        ))}
        <Button type="button" variant="secondary" onClick={addRow}>
          {tr.common.add}
        </Button>
      </div>
    </Panel>
  );
}
