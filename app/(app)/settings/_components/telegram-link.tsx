'use client';

import { useState, useTransition } from 'react';

import { Button, Label } from '@/components/ui';
import { generateTelegramCode } from '@/lib/actions/settings';
import { tr, interpolate } from '@/lib/i18n/tr';

/**
 * Shows linked state or a button that mints a 10-minute /link code (SPEC §9).
 * `linked` reflects profile.telegram_chat_id at render time.
 */
export function TelegramLink({ linked }: { linked: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (linked) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
        {tr.settings.telegramLinked}
      </span>
    );
  }

  function onClick() {
    setErr(null);
    start(async () => {
      const res = await generateTelegramCode();
      if (res.ok && res.data) setCode(res.data.code);
      else setErr(tr.errors.generic);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-neutral-400">
        <span className="h-1.5 w-1.5 rounded-full bg-neutral-600" />
        {tr.settings.telegramNotLinked}
      </span>

      {code ? (
        <div className="animate-enter rounded-xl border border-white/10 bg-white/[0.03] p-3 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
          <Label>{tr.settings.telegramCode}</Label>
          <code className="mt-1 block font-mono text-lg tracking-widest text-neutral-100">
            {code}
          </code>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            {interpolate(tr.settings.telegramCodeHelp, { code })}
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button type="button" onClick={onClick} disabled={pending}>
            {pending ? tr.common.processing : tr.settings.generateCode}
          </Button>
          {err && <span className="text-xs text-red-400">{err}</span>}
        </div>
      )}
    </div>
  );
}
