'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input } from '@/components/ui';
import { updateProfile } from '@/lib/actions/settings';
import { tr } from '@/lib/i18n/tr';

export function ProfileForm({ fullName }: { fullName: string }) {
  const [value, setValue] = useState(fullName);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    start(async () => {
      const res = await updateProfile(value.trim());
      if (res.ok) setMsg(tr.common.saved);
      else setErr(tr.errors.validation);
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:max-w-sm">
      <Field label={tr.settings.fullName}>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          maxLength={120}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !value.trim()}
        >
          {pending ? tr.common.processing : tr.common.save}
        </Button>
        {msg && (
          <span className="animate-enter inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
            />
            {msg}
          </span>
        )}
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
    </form>
  );
}
