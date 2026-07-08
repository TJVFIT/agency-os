'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
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
      <p className="flex items-center gap-2 text-sm text-neutral-200">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        {tr.settings.telegramLinked}
      </p>
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
      <p className="flex items-center gap-2 text-sm text-neutral-400">
        <span className="inline-block h-2 w-2 rounded-full bg-neutral-600" />
        {tr.settings.telegramNotLinked}
      </p>

      {code ? (
        <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
          <div className="text-xs text-neutral-400">
            {tr.settings.telegramCode}
          </div>
          <code className="mt-1 block font-mono text-lg tracking-widest text-neutral-100">
            {code}
          </code>
          <p className="mt-2 text-xs text-neutral-400">
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
