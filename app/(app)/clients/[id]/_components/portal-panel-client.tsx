'use client';

import { useState, useTransition } from 'react';

import { Button, Label, Panel } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import { fmtIstanbulDate } from '@/lib/dates';
import {
  acceptIdea,
  createPortalLink,
  rejectIdea,
  revokePortalLink,
} from '@/lib/actions/portal';
import type { Database } from '@/lib/db/types';

type IdeaStatus = Database['public']['Enums']['idea_status'];

export interface IdeaRow {
  id: string;
  title: string;
  body: string;
  status: IdeaStatus;
  refinedTitle: string | null;
  refinedSummary: string | null;
  createdAt: string;
}

const STATUS_CHIP: Record<IdeaStatus, string> = {
  new: 'border border-white/10 bg-white/[0.05] text-neutral-300',
  refined: 'border border-sky-400/20 bg-sky-400/10 text-sky-200',
  accepted: 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
  rejected: 'border border-red-400/20 bg-red-400/10 text-red-200',
};

export function PortalPanelClient({
  clientId,
  link,
  ideas,
  canManage,
}: {
  clientId: string;
  link: { id: string; url: string } | null;
  ideas: IdeaRow[];
  canManage: boolean;
}) {
  // createPortalLink returns the URL directly so the panel updates without
  // waiting for the revalidated route payload.
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const url = createdUrl ?? link?.url ?? null;

  function run(fn: () => Promise<{ ok: boolean }>) {
    setError(false);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(true);
    });
  }

  function copy() {
    if (!url) return;
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Panel title={tr.portal.title}>
      <div className="space-y-4">
        {/* Portal link management */}
        <div>
          <Label>{tr.portal.portalLink}</Label>
          {url ? (
            <div className="space-y-2">
              <p className="break-all rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 font-mono text-xs text-neutral-300">
                {url}
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={copy} disabled={pending}>
                  {copied ? tr.common.copied : tr.common.copy}
                </Button>
                {canManage && link && (
                  <Button
                    variant="danger"
                    disabled={pending}
                    onClick={() => {
                      setCreatedUrl(null);
                      run(() =>
                        revokePortalLink({ linkId: link.id, clientId }),
                      );
                    }}
                  >
                    {tr.portal.revokeLink}
                  </Button>
                )}
              </div>
            </div>
          ) : canManage ? (
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await createPortalLink({ clientId });
                  if (res.ok && res.data) setCreatedUrl(res.data.url);
                  return res;
                })
              }
            >
              {tr.portal.createLink}
            </Button>
          ) : (
            <p className="text-xs text-neutral-500">{tr.common.none}</p>
          )}
        </div>

        {/* Fikir kutusu */}
        <div>
          <Label>{tr.portal.ideasInbox}</Label>
          {ideas.length === 0 ? (
            <p className="text-xs text-neutral-500">{tr.common.none}</p>
          ) : (
            <ul className="space-y-2">
              {ideas.map((idea) => (
                <li
                  key={idea.id}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-neutral-200">
                        {idea.refinedTitle ?? idea.title}
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
                  </div>
                  {idea.body && (
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-neutral-400">
                      {idea.body}
                    </p>
                  )}
                  {idea.refinedSummary && (
                    <p className="mt-1 rounded-md border border-sky-400/20 bg-sky-400/10 px-2 py-1 text-xs text-sky-200">
                      <span className="font-medium">
                        {tr.portal.refinedSummary}:
                      </span>{' '}
                      {idea.refinedSummary}
                    </p>
                  )}
                  {canManage &&
                    (idea.status === 'new' || idea.status === 'refined') && (
                      <div className="mt-2 flex gap-2">
                        <Button
                          variant="primary"
                          disabled={pending}
                          onClick={() =>
                            run(() => acceptIdea({ ideaId: idea.id }))
                          }
                        >
                          {tr.portal.acceptIdea}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={pending}
                          onClick={() =>
                            run(() => rejectIdea({ ideaId: idea.id }))
                          }
                        >
                          {tr.portal.rejectIdea}
                        </Button>
                      </div>
                    )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-xs text-red-400">{tr.common.error}</p>}
      </div>
    </Panel>
  );
}
