'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Label, Select } from '@/components/ui';
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
    <header className="animate-enter rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
      <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b] p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-neutral-300">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background: primary || '#525252',
                boxShadow: primary ? `0 0 6px ${primary}66` : undefined,
              }}
            />
            {card.clients?.name ?? '—'}
          </span>
          <span className="inline-flex items-center rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-0.5 text-[11px] font-medium text-neutral-500">
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
            className="block max-w-full truncate rounded-lg px-1.5 py-0.5 -mx-1.5 text-left text-xl font-semibold tracking-tight text-neutral-50 transition-colors duration-300 hover:bg-white/[0.06]"
          >
            {card.title}
          </button>
        )}
        {error && <p className="mt-1.5 text-xs text-red-400">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-white/[0.06] pt-3 text-sm">
          <label className="flex items-center gap-2">
            <Label className="mb-0">{tr.card.assignee}</Label>
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
            <span className="flex items-center gap-2 text-neutral-300">
              <Label className="mb-0">{tr.card.dueDate}</Label>
              {fmtIstanbulDate(card.due_at)}
            </span>
          )}
          {card.scheduled_at && (
            <span className="flex items-center gap-2 text-neutral-300">
              <Label className="mb-0">{tr.card.scheduledAt}</Label>
              {fmtIstanbulDate(card.scheduled_at)}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
