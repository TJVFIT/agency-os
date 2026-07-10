'use client';

import { useState, useTransition } from 'react';

import {
  AUTOMATION_DOMAINS,
  effectiveMode,
  type AutomationDomain,
  type AutomationMode,
} from '@/lib/automation';
import { setAutomationMode } from '@/lib/actions/automation';
import { tr } from '@/lib/i18n/tr';

const MODES: AutomationMode[] = ['suggest', 'semi', 'full'];

type SettingRow = { key: string; mode: AutomationMode };

/**
 * Otomasyon section (admin only, UPGRADE_SPEC §9): master switch + per-domain
 * three-way mode controls. When the master lowers a domain (effective mode
 * differs from the domain's own), the effective mode is shown inline.
 */
export function AutomationSettings({ initial }: { initial: SettingRow[] }) {
  const [settings, setSettings] = useState<SettingRow[]>(() => {
    const get = (key: string): AutomationMode =>
      initial.find((s) => s.key === key)?.mode ?? 'semi';
    return [
      { key: 'master', mode: get('master') },
      ...AUTOMATION_DOMAINS.map((d) => ({ key: d, mode: get(d) })),
    ];
  });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const modeOf = (key: string): AutomationMode =>
    settings.find((s) => s.key === key)?.mode ?? 'semi';

  function setMode(key: 'master' | AutomationDomain, mode: AutomationMode) {
    const prev = settings;
    setSettings(settings.map((s) => (s.key === key ? { ...s, mode } : s)));
    setErr(null);
    start(async () => {
      const res = await setAutomationMode({ key, mode });
      if (!res.ok) {
        setSettings(prev);
        setErr(tr.errors.generic);
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 pb-3">
        <span className="text-sm font-medium text-neutral-100">
          {tr.automation.master}
        </span>
        <ModeSegments
          value={modeOf('master')}
          onChange={(m) => setMode('master', m)}
          disabled={pending}
        />
      </div>

      {AUTOMATION_DOMAINS.map((domain) => {
        const own = modeOf(domain);
        const effective = effectiveMode(settings, domain);
        return (
          <div
            key={domain}
            className="flex items-center justify-between gap-3 border-b border-neutral-900 py-2.5 last:border-b-0"
          >
            <div className="min-w-0">
              <div className="text-sm text-neutral-200">
                {tr.automation.domains[domain]}
              </div>
              {effective !== own && (
                <div className="text-xs text-amber-400">
                  → {tr.automation.modes[effective]}
                </div>
              )}
            </div>
            <ModeSegments
              value={own}
              onChange={(m) => setMode(domain, m)}
              disabled={pending}
            />
          </div>
        );
      })}

      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      <p className="mt-2 text-xs text-neutral-500">{tr.automation.modeHelp}</p>
    </div>
  );
}

function ModeSegments({
  value,
  onChange,
  disabled,
}: {
  value: AutomationMode;
  onChange: (mode: AutomationMode) => void;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      className="inline-flex shrink-0 overflow-hidden rounded-md border border-neutral-700"
    >
      {MODES.map((mode) => {
        const active = mode === value;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => !active && onChange(mode)}
            className={`px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? 'bg-neutral-100 text-neutral-950'
                : 'bg-neutral-950 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200'
            }`}
          >
            {tr.automation.modes[mode]}
          </button>
        );
      })}
    </div>
  );
}
