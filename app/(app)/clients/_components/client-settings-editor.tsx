'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input, Label, Panel } from '@/components/ui';
import { updateClientAction } from '@/lib/actions/clients';
import type { ClientColors } from '@/lib/db/domain';
import { tr } from '@/lib/i18n/tr';

import { SaveIndicator, type SaveState } from './save-state';

const LANGS = ['tr', 'en'] as const;
type Lang = (typeof LANGS)[number];

type ClientLocation = {
  lat?: number;
  lng?: number;
  district?: string;
} | null;

export function ClientSettingsEditor({
  clientId,
  name: initialName,
  industry: initialIndustry,
  langs: initialLangs,
  active: initialActive,
  colors: initialColors,
  location: initialLocation,
  shootBlockMinutes: initialShootBlock,
}: {
  clientId: string;
  name: string;
  industry: string;
  langs: string[];
  active: boolean;
  colors: ClientColors;
  location: ClientLocation;
  /** Çekim bloğu override (v4); null = app_settings global applies. */
  shootBlockMinutes: number | null;
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
  const [lat, setLat] = useState(
    typeof initialLocation?.lat === 'number' ? String(initialLocation.lat) : '',
  );
  const [lng, setLng] = useState(
    typeof initialLocation?.lng === 'number' ? String(initialLocation.lng) : '',
  );
  const [district, setDistrict] = useState(initialLocation?.district ?? '');
  const [shootBlock, setShootBlock] = useState(
    initialShootBlock != null ? String(initialShootBlock) : '',
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
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    const hasCoords =
      lat.trim() !== '' &&
      lng.trim() !== '' &&
      !Number.isNaN(latNum) &&
      !Number.isNaN(lngNum);
    const shootBlockTrim = shootBlock.trim();
    startTransition(async () => {
      const res = await updateClientAction({
        clientId,
        name: name.trim(),
        industry: industry.trim() || undefined,
        langs: langs.length ? langs : ['tr'],
        active,
        colors: { primary, secondary },
        location: hasCoords
          ? {
              lat: latNum,
              lng: lngNum,
              ...(district.trim() && { district: district.trim() }),
            }
          : null,
        // Empty input clears the override → the global block applies.
        shootBlockMinutes:
          shootBlockTrim === '' ? null : Number(shootBlockTrim),
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
                className={`rounded-full border px-3.5 py-1.5 text-xs font-medium uppercase tracking-[0.08em] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.97] ${
                  langs.includes(l)
                    ? 'border-indigo-300/40 bg-indigo-400/10 text-indigo-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                    : 'border-white/10 bg-white/[0.03] text-neutral-500 hover:border-white/20 hover:text-neutral-300'
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

        <div>
          <Label>{tr.production.location}</Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label={tr.production.lat}>
              <Input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                inputMode="decimal"
                placeholder="39.92"
                className="font-mono tabular-nums"
              />
            </Field>
            <Field label={tr.production.lng}>
              <Input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                inputMode="decimal"
                placeholder="32.85"
                className="font-mono tabular-nums"
              />
            </Field>
            <div className="col-span-2 sm:col-span-1">
              <Field label={tr.production.district}>
                <Input
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  maxLength={120}
                />
              </Field>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-neutral-500">
            {tr.production.locationHint}
          </p>
        </div>

        <div>
          <Field label={tr.opsSettings.shootBlockClient}>
            <Input
              type="number"
              min={30}
              max={720}
              step={5}
              value={shootBlock}
              onChange={(e) => setShootBlock(e.target.value)}
              placeholder="210"
              className="w-32 tabular-nums"
            />
          </Field>
          <p className="mt-1 text-[11px] text-neutral-500">
            {tr.opsSettings.shootBlockHint}
          </p>
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 transition-colors duration-300 hover:border-white/[0.12]">
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
