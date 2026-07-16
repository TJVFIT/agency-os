'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Label, Select } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { updateCardMeta } from '@/lib/actions/cards';
import { setCardTaskType } from '@/lib/actions/task-types';
import { fmtIstanbulDate } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardDetail } from '@/lib/db/queries';

/** Editable title + status + client + assignee + görev türü + due date. */
export function CardHeader({
  card,
  profiles,
  taskTypes = [],
}: {
  card: CardDetail;
  profiles: { id: string; full_name: string }[];
  /** All görev türleri — inactive ones render only as the current value. */
  taskTypes?: { id: string; name: string; active: boolean }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(card.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const primary = (card.clients?.colors as { primary?: string } | null)
    ?.primary;

  function saveTitle() {
    setEditingTitle(false);
    const next = title.trim();
    if (!next || next === card.title) {
      setTitle(card.title);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updateCardMeta({ cardId: card.id, title: next });
      if (!res.ok) {
        setError(tr.errors.generic);
        setTitle(card.title);
      } else {
        router.refresh();
      }
    });
  }

  function saveAssignee(value: string) {
    startTransition(async () => {
      const res = await updateCardMeta({
        cardId: card.id,
        assignee: value || null,
      });
      if (res.ok) router.refresh();
    });
  }

  function saveTaskType(value: string) {
    setError(null);
    startTransition(async () => {
      const res = await setCardTaskType({
        cardId: card.id,
        taskTypeId: value || null,
      });
      if (!res.ok) setError(tr.errors.generic);
      else router.refresh();
    });
  }

  // Deactivated types stay selectable only as the card's current value.
  const taskTypeOptions = taskTypes.filter(
    (t) => t.active || t.id === card.task_type_id,
  );

  return (
    <header className="animate-enter rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] transition-shadow duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_16px_56px_-12px_rgba(0,0,0,0.75)]">
      <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-medium text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: primary || '#525252',
                boxShadow: primary ? `0 0 6px ${primary}66` : undefined,
              }}
            />
            <span className="max-w-[12rem] truncate">
              {card.clients?.name ?? '—'}
            </span>
          </span>
          <span className="inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-0.5 text-[11px] font-medium text-neutral-500">
            {tr.cardTypes[card.type]}
          </span>
          <StatusBadge status={card.status} />
        </div>

        {editingTitle ? (
          <input
            value={title}
            autoFocus
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') {
                setTitle(card.title);
                setEditingTitle(false);
              }
            }}
            maxLength={200}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xl font-semibold tracking-tight text-neutral-50 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)] outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus:border-indigo-300/40 focus:bg-white/[0.05] focus:shadow-[0_0_0_3px_rgba(129,140,248,0.12)]"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            title={tr.common.edit}
            className="block max-w-full truncate rounded-lg px-1.5 py-0.5 -mx-1.5 text-left text-xl font-semibold tracking-tight text-neutral-50 transition-colors duration-300 hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40"
          >
            {card.title}
          </button>
        )}
        {error && (
          <p className="animate-enter mt-2 inline-block rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/[0.06] pt-3 text-sm">
          <label className="flex items-center gap-2">
            <Label className="mb-0">{tr.card.assignee}</Label>
            {/* key remounts the uncontrolled select when a görev türü
                prefills the assignee server-side (setCardTaskType). */}
            <Select
              key={card.assignee ?? ''}
              defaultValue={card.assignee ?? ''}
              disabled={pending}
              onChange={(e) => saveAssignee(e.target.value)}
            >
              <option value="">{tr.card.noAssignee}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.id.slice(0, 8)}
                </option>
              ))}
            </Select>
          </label>

          {taskTypeOptions.length > 0 && (
            <label className="flex items-center gap-2">
              <Label className="mb-0">{tr.taskTypes.onCard}</Label>
              <Select
                defaultValue={card.task_type_id ?? ''}
                disabled={pending}
                onChange={(e) => saveTaskType(e.target.value)}
              >
                <option value="">{tr.common.none}</option>
                {taskTypeOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {card.due_at && (
            <span className="flex items-center gap-2 text-neutral-300">
              <Label className="mb-0">{tr.card.dueDate}</Label>
              <span className="tabular-nums">
                {fmtIstanbulDate(card.due_at)}
              </span>
            </span>
          )}
          {card.scheduled_at && (
            <span className="flex items-center gap-2 text-neutral-300">
              <Label className="mb-0">{tr.card.scheduledAt}</Label>
              <span className="tabular-nums">
                {fmtIstanbulDate(card.scheduled_at)}
              </span>
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
