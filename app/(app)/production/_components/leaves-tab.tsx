'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Panel, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { ImpactDialog } from '@/components/impact-dialog';
import { applyImpact, computeImpact } from '@/lib/actions/impact';
import { createLeave, deleteLeave } from '@/lib/actions/production';
import { fmtIstanbulDate } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { ImpactItem } from '@/lib/impact';

import { EmptyState } from './empty-state';
import type { LeaveRow, ProfileOption } from './types';

interface LeaveDraft {
  profileId: string;
  startsOn: string;
  endsOn: string;
  note: string;
}

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
  // Leave paused for the impact dialog (v4 §9): the draft is kept until the
  // user decides how the affected shoots/cards should follow.
  const [impact, setImpact] = useState<{
    items: ImpactItem[];
    draft: LeaveDraft;
  } | null>(null);

  // Members may only file their own leave (mirrors RLS).
  const selectable = canManage
    ? profiles
    : profiles.filter((p) => p.id === userId);

  function onSubmit(formData: FormData) {
    setError(null);
    const draft: LeaveDraft = {
      profileId: String(formData.get('profileId')),
      startsOn: String(formData.get('startsOn')),
      endsOn: String(formData.get('endsOn')),
      note: String(formData.get('note') ?? ''),
    };
    startTransition(async () => {
      // v4 §9: surface the shoots/cards the leave window collides with
      // before saving. Zero impact (or a failed check) → save directly; the
      // createLeave validation still guards bad input.
      const impactRes = await computeImpact({
        kind: 'leave',
        profileId: draft.profileId,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
      });
      const items = impactRes.ok ? (impactRes.data ?? []) : [];
      if (items.length > 0) {
        setImpact({ items, draft });
        return; // saved (or abandoned) from the dialog
      }
      await saveLeave(draft, []);
    });
  }

  /** Save the leave, then apply the chosen linked updates. */
  async function saveLeave(draft: LeaveDraft, selectedIds: string[]) {
    const res = await createLeave(draft);
    if (!res.ok) {
      setError(tr.errors.validation);
      return;
    }
    if (selectedIds.length > 0) {
      const applied = await applyImpact({
        change: {
          kind: 'leave',
          profileId: draft.profileId,
          startsOn: draft.startsOn,
          endsOn: draft.endsOn,
        },
        selectedIds,
      });
      // The leave itself is saved; only the linked updates failed.
      if (!applied.ok) setError(tr.errors.generic);
    }
    setOpen(false);
    router.refresh();
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
      {error && (
        <p
          role="alert"
          className="animate-enter mb-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      {leaves.length === 0 ? (
        <EmptyState
          icon="🌴"
          text={tr.demo.noLeaves}
          cta={
            <Button variant="primary" onClick={() => setOpen(true)}>
              {tr.production.newLeave}
            </Button>
          }
        />
      ) : (
        <ul className="stagger-children space-y-1.5">
          {leaves.map((leave) => {
            const canDelete = canManage || leave.profile_id === userId;
            const initials = (leave.profiles?.full_name ?? '—')
              .split(/\s+/)
              .map((part) => part[0] ?? '')
              .join('')
              .slice(0, 2)
              .toLocaleUpperCase('tr-TR');
            return (
              <li
                key={leave.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.10] hover:bg-white/[0.05] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.6)]"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                  <span
                    aria-hidden
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[10px] font-semibold text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                  >
                    {initials}
                  </span>
                  <span className="text-sm font-medium text-neutral-100">
                    {leave.profiles?.full_name ?? '—'}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-neutral-400">
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
          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
            >
              {error}
            </p>
          )}
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

      <ImpactDialog
        open={impact !== null}
        items={impact?.items ?? []}
        pending={pending}
        onCancel={() => setImpact(null)} // leave form stays open, nothing saved
        onConfirm={(selectedIds) => {
          if (!impact) return;
          const { draft } = impact;
          setImpact(null);
          startTransition(async () => {
            await saveLeave(draft, selectedIds);
          });
        }}
      />
    </Panel>
  );
}
