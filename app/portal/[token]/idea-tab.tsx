'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import { fmtIstanbulDate } from '@/lib/dates';
import type { PortalIdea } from '@/lib/portal/service';
import { submitPortalIdea } from './actions';

const STATUS_CHIP: Record<PortalIdea['status'], string> = {
  new: 'border-white/10 bg-white/[0.05] text-neutral-300',
  refined: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
  accepted: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  rejected: 'border-red-400/20 bg-red-400/10 text-red-200',
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
      {sent && (
        <p className="animate-enter rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-center text-sm text-emerald-200">
          {tr.portal.ideaSent}
        </p>
      )}

      <div className="space-y-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <Field label={tr.portal.ideaTitle}>
          <Input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setSent(false);
            }}
            maxLength={200}
          />
        </Field>
        <Field label={tr.portal.ideaBody}>
          <Textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              setSent(false);
            }}
            maxLength={2000}
            rows={4}
          />
        </Field>
        <Button
          variant="primary"
          className="w-full !py-3.5"
          disabled={pending || !title.trim() || !body.trim()}
          onClick={submit}
        >
          {pending ? tr.common.loading : tr.portal.tabs.ideas}
        </Button>
        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-center text-xs text-red-300">
            {tr.common.error}
          </p>
        )}
      </div>

      {ideas.length > 0 && (
        <section>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
            {tr.portal.ideasInbox}
          </h3>
          <ul className="stagger-children space-y-2">
            {ideas.map((idea) => (
              <li
                key={idea.id}
                className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {idea.title}
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    {fmtIstanbulDate(idea.createdAt)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_CHIP[idea.status]}`}
                >
                  {tr.portal.ideaStatuses[idea.status]}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
