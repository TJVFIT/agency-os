'use client';

import { useState, useTransition } from 'react';

import { Button, Input, Label, Panel, Select } from '@/components/ui';
import {
  addSocialAccountAction,
  removeSocialAccountAction,
} from '@/lib/actions/clients';
import {
  PLATFORMS,
  type ClientSocialAccount,
  type Platform,
} from '@/lib/db/types';
import { tr } from '@/lib/i18n/tr';

import { CountChip, EmptyState } from './empty-state';
import { SaveIndicator, type SaveState } from './save-state';

export function SocialAccountsEditor({
  clientId,
  accounts,
  canManage,
}: {
  clientId: string;
  accounts: ClientSocialAccount[];
  canManage: boolean;
}) {
  const [platform, setPlatform] = useState<Platform>(PLATFORMS[0]);
  const [handle, setHandle] = useState('');
  const [state, setState] = useState<SaveState>('idle');
  const [pending, startTransition] = useTransition();

  function add() {
    const h = handle.trim();
    if (!h) return;
    setState('saving');
    startTransition(async () => {
      const res = await addSocialAccountAction({
        clientId,
        platform,
        handle: h,
      });
      if (res.ok) {
        setHandle('');
        setState('saved');
      } else {
        setState('error');
      }
    });
  }

  function remove(accountId: string) {
    setState('saving');
    startTransition(async () => {
      const res = await removeSocialAccountAction(accountId, clientId);
      setState(res.ok ? 'saved' : 'error');
    });
  }

  return (
    <Panel
      title={tr.clients.socialAccounts}
      actions={
        <div className="flex items-center gap-2">
          <SaveIndicator state={state} />
          <CountChip value={accounts.length} />
        </div>
      }
    >
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <EmptyState compact icon="🔗" text={tr.common.none} />
        ) : (
          <ul className="stagger-children space-y-1.5">
            {accounts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-300 hover:border-white/[0.12]"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] font-medium text-neutral-300">
                    {tr.platforms[a.platform as Platform] ?? a.platform}
                  </span>
                  <span className="truncate text-sm text-neutral-200">
                    {a.handle}
                  </span>
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    disabled={pending}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-neutral-600 transition-colors duration-300 hover:bg-red-400/10 hover:text-red-300 disabled:opacity-50"
                    aria-label={tr.common.remove}
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {canManage && (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[8rem] flex-1">
              <Label>{tr.clients.platform}</Label>
              <Select
                value={platform}
                onChange={(e) => setPlatform(e.target.value as Platform)}
                className="w-full"
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {tr.platforms[p]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-[8rem] flex-1">
              <Label>{tr.clients.handle}</Label>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@handle"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onClick={add}
              disabled={pending || !handle.trim()}
              className="shrink-0"
            >
              {tr.clients.addAccount}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
