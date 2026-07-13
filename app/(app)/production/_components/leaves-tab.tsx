'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Panel, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { createLeave, deleteLeave } from '@/lib/actions/production';
import { fmtIstanbulDate } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';

import type { LeaveRow, ProfileOption } from './types';

/** İzinler tab: leave list + add (self, or anyone for managers) + delete. */
export function LeavesTab({
  leaves,
  profiles,
  userId,
  canManage,
}: {
  leaves: LeaveRow[];
  profiles: ProfileOption[];
  userId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Members may only file their own leave (mirrors RLS).
  const selectable = canManage
    ? profiles
    : profiles.filter((p) => p.id === userId);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createLeave({
        profileId: String(formData.get('profileId')),
        startsOn: String(formData.get('startsOn')),
        endsOn: String(formData.get('endsOn')),
        note: String(formData.get('note') ?? ''),
      });
      if (!res.ok) {
        setError(tr.errors.validation);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function onDelete(leaveId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteLeave({ leaveId });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Panel
      title={tr.production.leaves}
      actions={
        <Button variant="primary" onClick={() => setOpen(true)}>
          {tr.production.newLeave}
        </Button>
      }
    >
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      {leaves.length === 0 ? (
        <p className="text-sm text-neutral-500">{tr.common.none}</p>
      ) : (
        <ul className="stagger-children space-y-1.5">
          {leaves.map((leave) => {
            const canDelete = canManage || leave.profile_id === userId;
            return (
              <li
                key={leave.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.10] hover:bg-white/[0.05]"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="text-sm font-medium text-neutral-100">
                    {leave.profiles?.full_name ?? '—'}
                  </span>
                  <span className="font-mono text-xs text-neutral-400">
                    {fmtIstanbulDate(leave.starts_on)} –{' '}
                    {fmtIstanbulDate(leave.ends_on)}
                  </span>
                  {leave.note && (
                    <span className="text-xs text-neutral-500">
                      {leave.note}
                    </span>
                  )}
                </div>
                {canDelete && (
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => onDelete(leave.id)}
                    className="px-2.5 py-1 text-xs"
                  >
                    {tr.common.delete}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr.production.newLeave}
      >
        <form action={onSubmit} className="space-y-3">
          <Field label={tr.card.assignee}>
            <Select
              name="profileId"
              defaultValue={userId}
              required
              className="w-full"
            >
              {selectable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr.production.leaveStart}>
              <Input name="startsOn" type="date" required />
            </Field>
            <Field label={tr.production.leaveEnd}>
              <Input name="endsOn" type="date" required />
            </Field>
          </div>
          <Field label={tr.portal.availabilityNote}>
            <Input name="note" maxLength={500} />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
            >
              {tr.common.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? tr.common.loading : tr.common.add}
            </Button>
          </div>
        </form>
      </Dialog>
    </Panel>
  );
}
