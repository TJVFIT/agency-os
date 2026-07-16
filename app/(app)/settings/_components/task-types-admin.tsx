'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button, Field, Input, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { createTaskType, updateTaskType } from '@/lib/actions/task-types';
import type { TaskType } from '@/lib/db/types';
import { tr } from '@/lib/i18n/tr';

/** Görev türleri manager (v4 §6) — Ayarlar panel for managers/admins. */
export function TaskTypesAdmin({
  taskTypes,
  profiles,
}: {
  taskTypes: TaskType[];
  profiles: { id: string; full_name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<'closed' | 'new' | TaskType>('closed');
  const [error, setError] = useState<string | null>(null);

  const profileNames = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name])),
    [profiles],
  );

  function onToggleActive(taskType: TaskType) {
    setError(null);
    startTransition(async () => {
      const res = await updateTaskType({
        taskTypeId: taskType.id,
        active: !taskType.active,
      });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      router.refresh();
    });
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const fields = {
        name: String(formData.get('name')),
        defaultMinutes: Number(formData.get('defaultMinutes') || 60),
        workloadPoints: Number(formData.get('workloadPoints') || 1),
        priority: Number(formData.get('priority') || 3),
        requiresReview: formData.get('requiresReview') === 'on',
        autoOpen: formData.get('autoOpen') === 'on',
        dependsOn: String(formData.get('dependsOn') || '') || null,
        defaultAssignee: String(formData.get('defaultAssignee') || '') || null,
      };
      const res =
        dialog === 'new' || dialog === 'closed'
          ? await createTaskType(fields)
          : await updateTaskType({ taskTypeId: dialog.id, ...fields });
      if (!res.ok) {
        setError(tr.errors.validation);
        return;
      }
      setDialog('closed');
      router.refresh();
    });
  }

  const editing = dialog !== 'closed' && dialog !== 'new' ? dialog : null;
  const dependsOptions = taskTypes.filter((t) => t.id !== editing?.id);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="animate-enter rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      )}

      {taskTypes.length === 0 ? (
        <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-10 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.14)]"
          >
            🗂️
          </span>
          <p className="text-sm text-neutral-500">{tr.taskTypes.empty}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[38rem] text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.08em] text-neutral-500">
                <th className="py-1.5 pr-3 font-medium">{tr.taskTypes.name}</th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.taskTypes.defaultMinutes}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.taskTypes.workloadPoints}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.taskTypes.priority}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.taskTypes.defaultAssignee}
                </th>
                <th className="py-1.5 pr-3 font-medium">{tr.card.status}</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody className="stagger-children">
              {taskTypes.map((taskType) => (
                <tr
                  key={taskType.id}
                  className="border-b border-white/[0.04] transition-colors duration-300 last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="py-2 pr-3 text-neutral-100">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      {taskType.name}
                      {taskType.requires_review && (
                        <span
                          className="rounded-full border border-sky-400/20 bg-sky-400/10 px-1.5 text-[10px] font-medium leading-4 text-sky-200"
                          title={tr.taskTypes.requiresReview}
                        >
                          ✓ {tr.taskTypes.requiresReview}
                        </span>
                      )}
                      {taskType.auto_open && (
                        <span
                          className="rounded-full border border-indigo-300/20 bg-indigo-400/10 px-1.5 text-[10px] font-medium leading-4 text-indigo-200"
                          title={tr.taskTypes.autoOpen}
                        >
                          ⚡ {tr.taskTypes.autoOpen}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-neutral-300">
                    {taskType.default_minutes}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-neutral-300">
                    {taskType.workload_points}
                  </td>
                  <td className="py-2 pr-3 tabular-nums text-neutral-300">
                    {taskType.priority}
                  </td>
                  <td className="py-2 pr-3 text-xs text-neutral-400">
                    {taskType.default_assignee
                      ? (profileNames.get(taskType.default_assignee) ?? '—')
                      : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
                        taskType.active
                          ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                          : 'border-white/[0.06] bg-white/[0.02] text-neutral-600'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          taskType.active
                            ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                            : 'bg-neutral-600'
                        }`}
                      />
                      {taskType.active ? tr.clients.active : tr.clients.inactive}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <Button
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setDialog(taskType)}
                        className="px-2.5 py-1 text-xs"
                      >
                        {tr.common.edit}
                      </Button>
                      <Button
                        variant={taskType.active ? 'danger' : 'secondary'}
                        disabled={pending}
                        onClick={() => onToggleActive(taskType)}
                        className="px-2.5 py-1 text-xs"
                      >
                        {taskType.active
                          ? tr.clients.inactive
                          : tr.clients.active}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <Button variant="primary" onClick={() => setDialog('new')}>
          {tr.taskTypes.add}
        </Button>
      </div>

      <Dialog
        open={dialog !== 'closed'}
        onClose={() => setDialog('closed')}
        title={editing ? tr.common.edit : tr.taskTypes.add}
      >
        <form action={onSubmit} className="space-y-3">
          <Field label={tr.taskTypes.name}>
            <Input
              name="name"
              defaultValue={editing?.name}
              required
              maxLength={120}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label={tr.taskTypes.defaultMinutes}>
              <Input
                name="defaultMinutes"
                type="number"
                min={5}
                max={1440}
                defaultValue={editing?.default_minutes ?? 60}
                required
              />
            </Field>
            <Field label={tr.taskTypes.workloadPoints}>
              <Input
                name="workloadPoints"
                type="number"
                min={0}
                max={100}
                defaultValue={editing?.workload_points ?? 1}
                required
              />
            </Field>
            <Field label={tr.taskTypes.priority}>
              <Select
                name="priority"
                defaultValue={String(editing?.priority ?? 3)}
                className="w-full"
              >
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                name="requiresReview"
                defaultChecked={editing?.requires_review ?? false}
                className="accent-indigo-400 outline-none"
              />
              {tr.taskTypes.requiresReview}
            </label>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                name="autoOpen"
                defaultChecked={editing?.auto_open ?? false}
                className="accent-indigo-400 outline-none"
              />
              {tr.taskTypes.autoOpen}
            </label>
          </div>
          <Field label={tr.taskTypes.dependsOn}>
            <Select
              name="dependsOn"
              defaultValue={editing?.depends_on ?? ''}
              className="w-full"
            >
              <option value="">{tr.common.none}</option>
              {dependsOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.taskTypes.defaultAssignee}>
            <Select
              name="defaultAssignee"
              defaultValue={editing?.default_assignee ?? ''}
              className="w-full"
            >
              <option value="">{tr.common.none}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialog('closed')}
            >
              {tr.common.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? tr.common.loading : tr.common.save}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
