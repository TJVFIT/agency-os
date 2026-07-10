'use client';

import { useState, useTransition } from 'react';

import { tr } from '@/lib/i18n/tr';
import type { ApprovalCard } from '@/lib/approvals/service';
import { submitPortalDecision } from './actions';

type Decision = 'approved' | 'rejected';

/**
 * Onaylar tab — per-card approve / reject+comment, adapted from
 * app/approve/[token]/approval-client.tsx. Decisions submit one card at a
 * time (the portal is durable, not a weekly batch).
 */
export function ApprovalsTab({
  token,
  cards,
}: {
  token: string;
  cards: ApprovalCard[];
}) {
  const [activeLang, setActiveLang] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<Record<string, string>>({});
  const [decided, setDecided] = useState<Record<string, Decision>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [pending, startTransition] = useTransition();

  const remaining = cards.filter((c) => !decided[c.id]);

  function submit(cardId: string, decision: Decision, comment: string) {
    startTransition(async () => {
      const res = await submitPortalDecision({
        token,
        cardId,
        decision,
        comment,
      });
      if (res.ok) {
        setDecided((p) => ({ ...p, [cardId]: decision }));
        setRejecting((p) => {
          const next = { ...p };
          delete next[cardId];
          return next;
        });
      } else {
        setFailed((p) => ({ ...p, [cardId]: true }));
      }
    });
  }

  if (cards.length === 0) {
    return (
      <p className="mt-16 text-center text-sm text-neutral-400">
        {tr.portal.noPending}
      </p>
    );
  }

  if (remaining.length === 0) {
    return (
      <p className="mt-16 rounded-lg border border-emerald-900 bg-emerald-950 p-4 text-center text-sm text-emerald-200">
        {tr.approval.thanks}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {remaining.map((card) => {
        const langs = Object.keys(card.contents);
        const lang = activeLang[card.id] ?? langs[0] ?? 'tr';
        const content = card.contents[lang];
        const rejectComment = rejecting[card.id];
        return (
          <article
            key={card.id}
            className="rounded-xl border border-neutral-800 bg-neutral-900"
          >
            {content?.media?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={content.media[0]}
                alt={card.title}
                className="aspect-[4/5] w-full rounded-t-xl object-cover"
              />
            )}
            <div className="p-3">
              <h2 className="mb-1 text-sm font-medium text-neutral-100">
                {card.title}
              </h2>
              {langs.length > 1 && (
                <div className="mb-2 flex gap-1">
                  {langs.map((l) => (
                    <button
                      key={l}
                      onClick={() =>
                        setActiveLang((p) => ({ ...p, [card.id]: l }))
                      }
                      className={`rounded px-2 py-0.5 text-xs uppercase ${
                        l === lang
                          ? 'bg-neutral-700 text-neutral-100'
                          : 'text-neutral-500'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm text-neutral-300">
                {content?.caption}
              </p>
              {content?.hashtags?.length ? (
                <p className="mt-1 text-xs text-sky-400">
                  {content.hashtags
                    .map((h) => (h.startsWith('#') ? h : `#${h}`))
                    .join(' ')}
                </p>
              ) : null}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => submit(card.id, 'approved', '')}
                  disabled={pending}
                  className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  ✓ {tr.approval.approveOne}
                </button>
                <button
                  onClick={() =>
                    setRejecting((p) => ({ ...p, [card.id]: p[card.id] ?? '' }))
                  }
                  disabled={pending}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium disabled:opacity-50 ${
                    rejectComment !== undefined
                      ? 'bg-red-600 text-white'
                      : 'border border-neutral-700 text-neutral-300'
                  }`}
                >
                  ✗ {tr.approval.rejectOne}
                </button>
              </div>
              {rejectComment !== undefined && (
                <div className="mt-2">
                  <textarea
                    placeholder={tr.approval.rejectCommentPlaceholder}
                    value={rejectComment}
                    onChange={(e) =>
                      setRejecting((p) => ({ ...p, [card.id]: e.target.value }))
                    }
                    className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100"
                    rows={2}
                  />
                  <button
                    onClick={() => submit(card.id, 'rejected', rejectComment)}
                    disabled={pending}
                    className="mt-1 w-full rounded-lg bg-neutral-100 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-40"
                  >
                    {pending ? tr.common.loading : tr.common.confirm}
                  </button>
                </div>
              )}
              {failed[card.id] && (
                <p className="mt-2 text-xs text-red-400">{tr.common.error}</p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
