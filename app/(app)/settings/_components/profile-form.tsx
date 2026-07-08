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
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !value.trim()}
        >
          {pending ? tr.common.processing : tr.common.save}
        </Button>
        {msg && <span className="text-xs text-emerald-400">{msg}</span>}
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>
    </form>
  );
}
