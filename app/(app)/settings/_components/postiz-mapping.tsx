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
    return (
      <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.14)]"
        >
          🔗
        </span>
        <p className="text-sm text-neutral-500">{tr.common.none}</p>
      </div>
    );
  }
  return (
    <div className="stagger-children flex flex-col divide-y divide-white/[0.06]">
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
    <div className="-mx-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-2 py-2.5 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.02]">
      <div className="min-w-[10rem]">
        <div className="truncate text-sm font-medium text-neutral-100">
          {account.clientName}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-px text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            {platformLabel(account.platform)}
          </span>
          <span className="truncate font-mono">@{account.handle}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="postiz_integration_id"
          maxLength={200}
          className="min-w-[8rem] font-mono text-xs"
        />
        <Button type="button" onClick={onSave} disabled={pending}>
          {pending ? tr.common.processing : tr.common.save}
        </Button>
      </div>
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
  );
}
