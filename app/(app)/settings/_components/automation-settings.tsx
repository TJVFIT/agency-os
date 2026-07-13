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

/** Glow-dot color per mode — mirrors the state-dot language used across
 *  StatusBadge / TelegramLink. Neutral → amber → emerald as autonomy rises. */
const MASTER_DOT: Record<AutomationMode, string> = {
  suggest: 'bg-neutral-500',
  semi: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
  full: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
};

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

  const masterMode = modeOf('master');

  return (
    <div className="flex flex-col">
      {/* Master kill switch — deliberately heavier: its own tile, a glow
       *  dot reflecting the active mode, and top billing above the domain
       *  list it governs. Not alarmed red — this is a control, not a warning. */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-14px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-2.5">
          <span
            className={`h-2 w-2 shrink-0 rounded-full transition-colors duration-300 ${MASTER_DOT[masterMode]}`}
          />
          <span className="text-sm font-semibold tracking-tight text-neutral-50">
            {tr.automation.master}
          </span>
        </div>
        <ModeSegments
          value={masterMode}
          onChange={(m) => setMode('master', m)}
          disabled={pending}
        />
      </div>

      <div className="stagger-children flex flex-col">
        {AUTOMATION_DOMAINS.map((domain) => {
          const own = modeOf(domain);
          const effective = effectiveMode(settings, domain);
          return (
            <div
              key={domain}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.05] py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="text-sm text-neutral-200">
                  {tr.automation.domains[domain]}
                </div>
                {effective !== own && (
                  <div className="animate-enter text-xs text-amber-400">
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
      </div>

      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
      <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-neutral-500">
        {tr.automation.modeHelp}
      </p>
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
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
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
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 ${
              active
                ? 'bg-white/[0.12] text-neutral-50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {tr.automation.modes[mode]}
          </button>
        );
      })}
    </div>
  );
}
