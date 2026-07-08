'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input, Panel } from '@/components/ui';
import { updateClientAction } from '@/lib/actions/clients';
import type { ClientColors } from '@/lib/db/domain';
import { tr } from '@/lib/i18n/tr';

import { SaveIndicator, type SaveState } from './save-state';

const LANGS = ['tr', 'en'] as const;
type Lang = (typeof LANGS)[number];

export function ClientSettingsEditor({
  clientId,
  name: initialName,
  industry: initialIndustry,
  langs: initialLangs,
  active: initialActive,
  colors: initialColors,
}: {
  clientId: string;
  name: string;
  industry: string;
  langs: string[];
  active: boolean;
  colors: ClientColors;
}) {
  const [name, setName] = useState(initialName);
  const [industry, setIndustry] = useState(initialIndustry);
  const [langs, setLangs] = useState<Lang[]>(
    initialLangs.filter((l): l is Lang => l === 'tr' || l === 'en'),
  );
  const [active, setActive] = useState(initialActive);
  const [primary, setPrimary] = useState(initialColors.primary ?? '#000000');
  const [secondary, setSecondary] = useState(
    initialColors.secondary ?? '#000000',
  );
  const [state, setState] = useState<SaveState>('idle');
  const [pending, startTransition] = useTransition();

  function toggleLang(l: Lang) {
    setLangs((prev) =>
      prev.includes(l)
        ? prev.length > 1
          ? prev.filter((x) => x !== l)
          : prev
        : [...prev, l],
    );
  }

  function save() {
    setState('saving');
    startTransition(async () => {
      const res = await updateClientAction({
        clientId,
        name: name.trim(),
        industry: industry.trim() || undefined,
        langs: langs.length ? langs : ['tr'],
        active,
        colors: { primary, secondary },
      });
      setState(res.ok ? 'saved' : 'error');
    });
  }

  return (
    <Panel
      title={tr.common.edit}
      actions={
        <div className="flex items-center gap-2">
          <SaveIndicator state={state} />
          <Button
            variant="primary"
            onClick={save}
            disabled={pending || !name.trim()}
          >
            {tr.common.save}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label={tr.clients.name}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
          />
        </Field>

        <Field label={tr.clients.industry}>
          <Input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            maxLength={60}
          />
        </Field>

        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {tr.clients.langs}
          </span>
          <div className="flex gap-2">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleLang(l)}
                className={`rounded-md border px-3 py-1.5 text-sm uppercase transition-colors ${
                  langs.includes(l)
                    ? 'border-neutral-400 bg-neutral-800 text-neutral-100'
                    : 'border-neutral-700 bg-neutral-950 text-neutral-500'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-400">
              {tr.clients.primaryColor}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-neutral-700 bg-neutral-950"
              />
              <Input
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-400">
              {tr.clients.secondaryColor}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
                className="h-8 w-10 cursor-pointer rounded border border-neutral-700 bg-neutral-950"
              />
              <Input
                value={secondary}
                onChange={(e) => setSecondary(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-neutral-700 bg-neutral-950 accent-neutral-200"
          />
          <span className="text-sm text-neutral-200">{tr.clients.active}</span>
        </label>
      </div>
    </Panel>
  );
}
