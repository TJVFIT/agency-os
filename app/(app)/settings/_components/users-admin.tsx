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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-xs text-neutral-500">
              <th className="py-2 pr-4 font-medium">{tr.settings.fullName}</th>
              <th className="py-2 font-medium">{tr.settings.role}</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => (
              <UserRow key={p.id} profile={p} isSelf={p.id === currentUserId} />
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <InviteDialog />
      </div>
    </div>
  );
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
    <tr className="border-b border-neutral-900">
      <td className="py-2 pr-4 text-neutral-200">
        {profile.full_name || profile.id.slice(0, 8)}
        {isSelf && <span className="ml-2 text-xs text-neutral-500">(siz)</span>}
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
          {err && <span className="text-xs text-red-400">{err}</span>}
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
          {err && <span className="text-xs text-red-400">{err}</span>}
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
