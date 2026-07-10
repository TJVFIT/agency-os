'use client';

/**
 * /preview/settings — static demo of the Otomasyon showcase (no backend).
 * Master switch + five domain rows with fully working 3-way segmented
 * controls in local state, plus a fake push-notification toggle.
 */

import { useState } from 'react';

import { Button, Panel, PageHeader } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';

type AutomationMode = 'suggest' | 'semi' | 'full';
type AutomationDomain = keyof typeof tr.automation.domains;

const DOMAINS = Object.keys(tr.automation.domains) as AutomationDomain[];
const MODES: AutomationMode[] = ['suggest', 'semi', 'full'];
const MODE_RANK: Record<AutomationMode, number> = {
  suggest: 0,
  semi: 1,
  full: 2,
};

/** Master caps every domain: effective mode = min(master, own). */
function effectiveMode(
  master: AutomationMode,
  own: AutomationMode,
): AutomationMode {
  return MODE_RANK[master] < MODE_RANK[own] ? master : own;
}

function ModeSegments({
  value,
  onChange,
}: {
  value: AutomationMode;
  onChange: (mode: AutomationMode) => void;
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
            onClick={() => !active && onChange(mode)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              active
                ? 'bg-white/[0.12] text-neutral-50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4)]'
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

function AutomationShowcase() {
  const [master, setMaster] = useState<AutomationMode>('semi');
  const [modes, setModes] = useState<Record<AutomationDomain, AutomationMode>>({
    planner: 'suggest',
    publish: 'semi',
    post_shoot: 'full',
    compliance: 'semi',
    reports: 'full',
  });

  return (
    <Panel title={tr.automation.title} className="animate-enter">
      <div className="stagger-children flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
          <span className="text-sm font-semibold text-neutral-50">
            {tr.automation.master}
          </span>
          <ModeSegments value={master} onChange={setMaster} />
        </div>

        {DOMAINS.map((domain) => {
          const own = modes[domain];
          const effective = effectiveMode(master, own);
          return (
            <div
              key={domain}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.04] py-2.5 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="text-sm text-neutral-200">
                  {tr.automation.domains[domain]}
                </div>
                {effective !== own && (
                  <div className="animate-enter text-xs text-neutral-500">
                    → {tr.automation.modes[effective]}
                  </div>
                )}
              </div>
              <ModeSegments
                value={own}
                onChange={(mode) => setModes((m) => ({ ...m, [domain]: mode }))}
              />
            </div>
          );
        })}
      </div>

      <p className="mt-3 border-t border-white/[0.06] pt-3 text-xs leading-relaxed text-neutral-500">
        {tr.automation.modeHelp}
      </p>
    </Panel>
  );
}

function PushPanel() {
  const [enabled, setEnabled] = useState(false);

  return (
    <Panel title={tr.push.title} className="animate-enter self-start">
      {enabled ? (
        <div className="animate-enter flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
            {tr.push.enabled}
          </span>
        </div>
      ) : (
        <Button variant="primary" onClick={() => setEnabled(true)}>
          {tr.push.enable}
        </Button>
      )}
      <p className="mt-3 text-xs leading-relaxed text-neutral-600">
        {tr.push.installHint}
      </p>
    </Panel>
  );
}

export default function PreviewSettingsPage() {
  return (
    <div>
      <PageHeader title={tr.settings.title} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <AutomationShowcase />
        <PushPanel />
      </div>
    </div>
  );
}
