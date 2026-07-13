'use client';

import { useState, useTransition } from 'react';

import { Button, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import type { ApprovalCard } from '@/lib/approvals/service';
import { submitPortalDecision } from './actions';

type Decision = 'approved' | 'rejected';

/** Extra vertical padding on top of the Button primitive's default sizing —
 *  this is the client's own approve/reject action, opened on a phone, so it
 *  gets a bigger, thumb-reachable tap target than internal-tool buttons. */
const TAP_TARGET = '!py-3.5';

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
      <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-12 text-center">
        <span aria-hidden className="text-3xl">
          🎉
        </span>
        <p className="text-sm text-neutral-400">{tr.portal.noPending}</p>
      </div>
    );
  }

  if (remaining.length === 0) {
    return (
      <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-10 text-center">
        <span
          aria-hidden
          className="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-400/25 bg-emerald-400/15 text-lg text-emerald-200"
        >
          ✓
        </span>
        <p className="text-sm text-emerald-200">{tr.approval.thanks}</p>
      </div>
    );
  }

  return (
    <div className="stagger-children space-y-3">
      {remaining.map((card) => {
        const langs = Object.keys(card.contents);
        const lang = activeLang[card.id] ?? langs[0] ?? 'tr';
        const content = card.contents[lang];
        const rejectComment = rejecting[card.id];
        return (
          <article
            key={card.id}
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            {content?.media?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={content.media[0]}
                alt={card.title}
                className="aspect-[4/5] w-full object-cover"
              />
            )}
            <div className="p-3.5">
              <h2 className="mb-1.5 text-sm font-semibold tracking-tight text-neutral-100">
                {card.title}
              </h2>
              {langs.length > 1 && (
                <div className="mb-2.5 flex gap-1.5">
                  {langs.map((l) => (
                    <button
                      key={l}
                      onClick={() =>
                        setActiveLang((p) => ({ ...p, [card.id]: l }))
                      }
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide transition-colors duration-200 ${
                        l === lang
                          ? 'border-white/20 bg-white/[0.1] text-neutral-100'
                          : 'border-white/[0.06] text-neutral-500 hover:text-neutral-300'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
                {content?.caption}
              </p>
              {content?.hashtags?.length ? (
                <p className="mt-1.5 text-xs text-sky-400">
                  {content.hashtags
                    .map((h) => (h.startsWith('#') ? h : `#${h}`))
                    .join(' ')}
                </p>
              ) : null}

              <div className="mt-3.5 flex gap-2">
                <Button
                  variant="primary"
                  className={`flex-1 ${TAP_TARGET}`}
                  onClick={() => submit(card.id, 'approved', '')}
                  disabled={pending}
                >
                  ✓ {tr.approval.approveOne}
                </Button>
                <Button
                  variant={rejectComment !== undefined ? 'danger' : 'secondary'}
                  className={`flex-1 ${TAP_TARGET}`}
                  onClick={() =>
                    setRejecting((p) => ({ ...p, [card.id]: p[card.id] ?? '' }))
                  }
                  disabled={pending}
                >
                  ✗ {tr.approval.rejectOne}
                </Button>
              </div>
              {rejectComment !== undefined && (
                <div className="animate-enter mt-2.5 space-y-2">
                  <Textarea
                    placeholder={tr.approval.rejectCommentPlaceholder}
                    value={rejectComment}
                    onChange={(e) =>
                      setRejecting((p) => ({ ...p, [card.id]: e.target.value }))
                    }
                    rows={2}
                    autoFocus
                  />
                  <Button
                    variant="danger"
                    className={`w-full ${TAP_TARGET}`}
                    onClick={() => submit(card.id, 'rejected', rejectComment)}
                    disabled={pending}
                  >
                    {pending ? tr.common.loading : tr.common.confirm}
                  </Button>
                </div>
              )}
              {failed[card.id] && (
                <p className="mt-2.5 rounded-lg border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-center text-xs text-red-300">
                  {tr.common.error}
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
