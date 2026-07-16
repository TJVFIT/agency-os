'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { inviteUser, setUserRole } from '@/lib/actions/settings';
import type { Profile } from '@/lib/db/types';
import type { Role } from '@/lib/status';
import { tr } from '@/lib/i18n/tr';

const ROLES: Role[] = ['admin', 'manager', 'member'];

export function UsersAdmin({
  profiles,
  currentUserId,
}: {
  profiles: Profile[];
  currentUserId: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {profiles.length === 0 ? (
        <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.14)]"
          >
            👥
          </span>
          <p className="text-sm text-neutral-500">{tr.common.none}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="border-b border-white/[0.08] text-left">
                <th className="py-2 pr-4 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                  {tr.settings.fullName}
                </th>
                <th className="py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                  {tr.settings.role}
                </th>
              </tr>
            </thead>
            <tbody className="stagger-children">
              {profiles.map((p) => (
                <UserRow
                  key={p.id}
                  profile={p}
                  isSelf={p.id === currentUserId}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <InviteDialog />
      </div>
    </div>
  );
}

/** Avatar-orb initials — first letters of up to two words, Turkish-aware
 *  uppercasing; falls back to the id prefix for unnamed profiles. */
function initialsOf(fullName: string | null, id: string): string {
  const name = (fullName ?? '').trim();
  if (!name) return id.slice(0, 2).toLocaleUpperCase('tr-TR');
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR'))
    .join('');
}

function UserRow({ profile, isSelf }: { profile: Profile; isSelf: boolean }) {
  const [role, setRole] = useState<Role>(profile.role);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onChange(next: Role) {
    const prev = role;
    setRole(next);
    setErr(null);
    start(async () => {
      const res = await setUserRole({ profileId: profile.id, role: next });
      if (!res.ok) {
        setRole(prev);
        setErr(tr.errors.generic);
      }
    });
  }

  return (
    <tr className="border-b border-white/[0.05] transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] last:border-b-0 hover:bg-white/[0.02]">
      <td className="py-2 pr-4">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-[11px] font-semibold text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            {initialsOf(profile.full_name, profile.id)}
          </span>
          <span className="truncate text-neutral-200">
            {profile.full_name || profile.id.slice(0, 8)}
          </span>
          {isSelf && (
            <span className="shrink-0 rounded-full border border-indigo-300/20 bg-indigo-400/10 px-1.5 py-px text-[10px] font-medium text-indigo-200">
              ({tr.assistant.you})
            </span>
          )}
        </div>
      </td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          <Select
            value={role}
            onChange={(e) => onChange(e.target.value as Role)}
            disabled={pending}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tr.roles[r]}
              </option>
            ))}
          </Select>
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
      </td>
    </tr>
  );
}

function InviteDialog() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setEmail('');
    setFullName('');
    setRole('member');
    setPassword('');
    setErr(null);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const res = await inviteUser({
        email: email.trim(),
        fullName: fullName.trim(),
        role,
        password,
      });
      if (res.ok) {
        reset();
        setOpen(false);
      } else {
        setErr(
          res.error === 'validation' ? tr.errors.validation : tr.errors.generic,
        );
      }
    });
  }

  return (
    <>
      <Button type="button" variant="primary" onClick={() => setOpen(true)}>
        {tr.settings.inviteUser}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr.settings.inviteUser}
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <Field label={tr.auth.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="off"
            />
          </Field>
          <Field label={tr.settings.fullName}>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field label={tr.settings.role}>
            <Select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {tr.roles[r]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.auth.password}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
          </Field>
          {err && (
            <p className="animate-enter rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {err}
            </p>
          )}
          <div className="mt-1 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {tr.common.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? tr.common.processing : tr.common.create}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
