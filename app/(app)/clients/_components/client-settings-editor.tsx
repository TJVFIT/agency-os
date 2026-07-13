'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input, Label, Panel } from '@/components/ui';
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
          <Label>{tr.clients.langs}</Label>
          <div className="flex gap-2">
            {LANGS.map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => toggleLang(l)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium uppercase transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                  langs.includes(l)
                    ? 'border-indigo-300/40 bg-indigo-400/10 text-indigo-200'
                    : 'border-white/10 bg-white/[0.03] text-neutral-500 hover:border-white/20'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{tr.clients.primaryColor}</Label>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                <input
                  type="color"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  className="h-9 w-11 cursor-pointer appearance-none border-none bg-transparent p-0 [&::-moz-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none"
                />
              </span>
              <Input
                value={primary}
                onChange={(e) => setPrimary(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <div>
            <Label>{tr.clients.secondaryColor}</Label>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
                <input
                  type="color"
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  className="h-9 w-11 cursor-pointer appearance-none border-none bg-transparent p-0 [&::-moz-color-swatch]:border-none [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:border-none"
                />
              </span>
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
            className="h-4 w-4 rounded border-white/15 bg-white/[0.03] accent-neutral-200"
          />
          <span className="text-sm text-neutral-200">{tr.clients.active}</span>
        </label>
      </div>
    </Panel>
  );
}
