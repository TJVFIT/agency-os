'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import { fmtIstanbulDate } from '@/lib/dates';
import type { PortalIdea } from '@/lib/portal/service';
import { submitPortalIdea } from './actions';
import { Bezel, ROW, SectionLabel, StatusNote } from './glass';

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
        <StatusNote tone="success" className="!rounded-xl !p-4 !text-sm">
          {tr.portal.ideaSent}
        </StatusNote>
      )}

      <Bezel innerClassName="space-y-3 p-3.5">
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
        {error && <StatusNote tone="error">{tr.common.error}</StatusNote>}
      </Bezel>

      {ideas.length > 0 && (
        <section>
          <SectionLabel count={ideas.length}>
            {tr.portal.ideasInbox}
          </SectionLabel>
          <ul className="stagger-children space-y-2">
            {ideas.map((idea) => (
              <li
                key={idea.id}
                className={`flex items-center justify-between gap-2 px-3 py-2.5 ${ROW}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-100">
                    {idea.title}
                  </p>
                  <p className="text-[11px] tabular-nums text-neutral-500">
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
