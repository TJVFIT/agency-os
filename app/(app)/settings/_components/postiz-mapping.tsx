'use client';

import { useState, useTransition } from 'react';

import { Button, Input } from '@/components/ui';
import { mapPostizIntegration } from '@/lib/actions/settings';
import { tr } from '@/lib/i18n/tr';

export type PostizAccount = {
  id: string;
  clientName: string;
  platform: string;
  handle: string;
  postiz_integration_id: string | null;
};

export function PostizMapping({ accounts }: { accounts: PostizAccount[] }) {
  if (accounts.length === 0) {
    return <p className="text-sm text-neutral-500">{tr.common.none}</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-neutral-900">
      {accounts.map((a) => (
        <AccountRow key={a.id} account={a} />
      ))}
    </div>
  );
}

function platformLabel(platform: string): string {
  const key = platform as keyof typeof tr.platforms;
  return tr.platforms[key] ?? platform;
}

function AccountRow({ account }: { account: PostizAccount }) {
  const [value, setValue] = useState(account.postiz_integration_id ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSave() {
    setMsg(null);
    setErr(null);
    const trimmed = value.trim();
    start(async () => {
      const res = await mapPostizIntegration({
        accountId: account.id,
        integrationId: trimmed === '' ? null : trimmed,
      });
      if (res.ok) setMsg(tr.common.saved);
      else setErr(tr.errors.generic);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 py-2.5">
      <div className="min-w-[10rem]">
        <div className="text-sm text-neutral-200">{account.clientName}</div>
        <div className="text-xs text-neutral-500">
          {platformLabel(account.platform)} · @{account.handle}
        </div>
      </div>
      <div className="flex flex-1 items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="postiz_integration_id"
          maxLength={200}
        />
        <Button type="button" onClick={onSave} disabled={pending}>
          {pending ? tr.common.processing : tr.common.save}
        </Button>
      </div>
      {msg && <span className="text-xs text-emerald-400">{msg}</span>}
      {err && <span className="text-xs text-red-400">{err}</span>}
    </div>
  );
}
