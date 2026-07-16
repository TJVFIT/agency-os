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
        <div className="animate-enter relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_24px_-14px_rgba(0,0,0,0.6)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(16rem_8rem_at_50%_-2rem,rgba(129,140,248,0.12),transparent_70%)]"
          />
          <Label className="relative">{tr.settings.telegramCode}</Label>
          <code className="relative mt-1 block font-mono text-2xl font-semibold tabular-nums tracking-[0.3em] text-neutral-50">
            {code}
          </code>
          <p className="relative mt-2 border-t border-white/[0.06] pt-2 text-xs leading-relaxed text-neutral-400">
            {interpolate(tr.settings.telegramCodeHelp, { code })}
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={onClick} disabled={pending}>
            {pending ? tr.common.processing : tr.settings.generateCode}
          </Button>
          {err && (
            <span className="animate-enter inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-1 text-[11px] font-medium text-red-200">
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]"
              />
              {err}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
