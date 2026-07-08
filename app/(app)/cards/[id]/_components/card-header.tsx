'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Select } from '@/components/ui';
import { StatusBadge } from '@/components/status-badge';
import { updateCardMeta } from '@/lib/actions/cards';
import { fmtIstanbulDate } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardDetail } from '@/lib/db/queries';

/** Editable title + status + client + assignee + due date. */
export function CardHeader({
  card,
  profiles,
}: {
  card: CardDetail;
  profiles: { id: string; full_name: string }[];
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

  return (
    <header className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
        <span className="flex items-center gap-1.5">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: primary || '#525252' }}
          />
          {card.clients?.name ?? '—'}
        </span>
        <span className="text-neutral-700">·</span>
        <span>{tr.cardTypes[card.type]}</span>
        <span className="text-neutral-700">·</span>
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
          className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1 text-lg font-semibold text-neutral-50 outline-none focus:border-neutral-400"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingTitle(true)}
          title={tr.common.edit}
          className="block max-w-full truncate rounded-md px-1 -mx-1 text-left text-lg font-semibold text-neutral-50 hover:bg-neutral-800"
        >
          {card.title}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">{tr.card.assignee}</span>
          <Select
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

        {card.due_at && (
          <span className="text-neutral-400">
            <span className="text-xs text-neutral-500">
              {tr.card.dueDate}:{' '}
            </span>
            {fmtIstanbulDate(card.due_at)}
          </span>
        )}
        {card.scheduled_at && (
          <span className="text-neutral-400">
            <span className="text-xs text-neutral-500">
              {tr.card.scheduledAt}:{' '}
            </span>
            {fmtIstanbulDate(card.scheduled_at)}
          </span>
        )}
      </div>
    </header>
  );
}
