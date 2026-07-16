'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Select } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { createCard } from '@/lib/actions/cards';
import { tr } from '@/lib/i18n/tr';
import type { Client, Profile, TaskType } from '@/lib/db/types';

const TYPES = ['post', 'reel', 'story', 'reply', 'other'] as const;

/** Create-card dialog shared by board, dashboard and calendar. */
export function NewCardDialog({
  clients,
  profiles,
  taskTypes = [],
  defaultClientId,
}: {
  clients: Pick<Client, 'id' | 'name'>[];
  profiles: Pick<Profile, 'id' | 'full_name'>[];
  /** Active görev türleri (v4 §6) — the select renders only when non-empty. */
  taskTypes?: Pick<TaskType, 'id' | 'name'>[];
  defaultClientId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await createCard({
        clientId: String(formData.get('clientId')),
        title: String(formData.get('title')),
        type: formData.get('type') as (typeof TYPES)[number],
        assignee: (formData.get('assignee') as string) || null,
        priority: Number(formData.get('priority')),
        taskTypeId: (formData.get('taskTypeId') as string) || null,
      });
      if (!res.ok) {
        setError(tr.errors.validation);
        return;
      }
      setOpen(false);
      if (res.data) router.push(`/cards/${res.data.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        {tr.card.newCard}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={tr.card.newCard}
      >
        <form action={onSubmit} className="space-y-3">
          <Field label={tr.card.title}>
            <Input name="title" required maxLength={200} autoFocus />
          </Field>
          <Field label={tr.card.client}>
            <Select
              name="clientId"
              defaultValue={defaultClientId}
              required
              className="w-full"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr.card.type}>
              <Select name="type" defaultValue="post" className="w-full">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {tr.cardTypes[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={tr.card.priority}>
              <Select name="priority" defaultValue="3" className="w-full">
                {[1, 2, 3, 4, 5].map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {taskTypes.length > 0 && (
            <Field label={tr.taskTypes.onCard}>
              <Select name="taskTypeId" defaultValue="" className="w-full">
                <option value="">{tr.common.none}</option>
                {taskTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={tr.card.assignee}>
            <Select name="assignee" defaultValue="" className="w-full">
              <option value="">{tr.card.noAssignee}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
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
              {pending ? tr.common.loading : tr.common.create}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
