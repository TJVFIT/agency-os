'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input } from '@/components/ui';
import { updateShootBlockMinutes } from '@/lib/actions/settings';
import { tr } from '@/lib/i18n/tr';

type SaveState = 'idle' | 'saved' | 'error';

/**
 * Admin editor for the global çekim bloğu (app_settings.shoot_block_minutes,
 * v4). Per-client overrides live on the client detail page; empty overrides
 * fall back to this value (resolveShootBlockMinutes).
 */
export function OpsSettings({
  shootBlockMinutes,
}: {
  shootBlockMinutes: number;
}) {
  const [value, setValue] = useState(String(shootBlockMinutes));
  const [state, setState] = useState<SaveState>('idle');
  const [pending, startTransition] = useTransition();

  function save() {
    setState('idle');
    const minutes = Number(value.trim());
    startTransition(async () => {
      const res = await updateShootBlockMinutes(minutes);
      setState(res.ok ? 'saved' : 'error');
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Field label={tr.opsSettings.shootBlockGlobal}>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={30}
            max={720}
            step={5}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setState('idle');
            }}
            className="w-28 tabular-nums"
            aria-label={tr.opsSettings.shootBlockGlobal}
          />
          <Button
            variant="primary"
            onClick={save}
            disabled={pending || value.trim() === ''}
          >
            {pending ? tr.common.loading : tr.common.save}
          </Button>
          {state === 'saved' && (
            <span className="animate-enter inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-300">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
              />
              {tr.common.saved}
            </span>
          )}
          {state === 'error' && (
            <span
              role="alert"
              className="animate-enter inline-flex items-center gap-1.5 text-[11px] font-medium text-red-300"
            >
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]"
              />
              {tr.errors.validation}
            </span>
          )}
        </div>
      </Field>
      <p className="text-[11px] leading-relaxed text-neutral-500">
        {tr.opsSettings.shootBlockHint}
      </p>
    </div>
  );
}
