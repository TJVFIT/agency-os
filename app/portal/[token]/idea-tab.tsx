'use client';

import { useState, useTransition } from 'react';

import { tr } from '@/lib/i18n/tr';
import { fmtIstanbulDate } from '@/lib/dates';
import type { PortalIdea } from '@/lib/portal/service';
import { submitPortalIdea } from './actions';

const STATUS_CHIP: Record<PortalIdea['status'], string> = {
  new: 'bg-neutral-800 text-neutral-300',
  refined: 'bg-sky-950 text-sky-300',
  accepted: 'bg-emerald-950 text-emerald-300',
  rejected: 'bg-red-950 text-red-300',
};

/** Fikir gönder tab — title+body form + the client's recent ideas. */
export function IdeaTab({
  token,
  ideas,
}: {
  token: string;
  ideas: PortalIdea[];
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!title.trim() || !body.trim()) return;
    setError(false);
    startTransition(async () => {
      const res = await submitPortalIdea({
        token,
        title: title.trim(),
        body: body.trim(),
      });
      if (res.ok) {
        setSent(true);
        setTitle('');
        setBody('');
      } else {
        setError(true);
      }
    });
  }

  return (
    <div className="space-y-4">
      {sent ? (
        <p className="rounded-lg border border-emerald-900 bg-emerald-950 p-4 text-center text-sm text-emerald-200">
          {tr.portal.ideaSent}
        </p>
      ) : (
        <div className="space-y-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tr.portal.ideaTitle}
            maxLength={200}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-400"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={tr.portal.ideaBody}
            maxLength={2000}
            rows={4}
            className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-neutral-400"
          />
          <button
            onClick={submit}
            disabled={pending || !title.trim() || !body.trim()}
            className="w-full rounded-lg bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-950 disabled:opacity-40"
          >
            {pending ? tr.common.loading : tr.portal.tabs.ideas}
          </button>
          {error && (
            <p className="text-center text-xs text-red-400">
              {tr.common.error}
            </p>
          )}
        </div>
      )}

      {ideas.length > 0 && (
        <ul className="space-y-2">
          {ideas.map((idea) => (
            <li
              key={idea.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-neutral-200">
                  {idea.title}
                </p>
                <p className="text-[11px] text-neutral-500">
                  {fmtIstanbulDate(idea.createdAt)}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] ${STATUS_CHIP[idea.status]}`}
              >
                {tr.portal.ideaStatuses[idea.status]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
