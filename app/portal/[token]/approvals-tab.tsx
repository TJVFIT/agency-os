'use client';

import { useState, useTransition } from 'react';

import { Button, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import type { ApprovalCard } from '@/lib/approvals/service';
import { submitPortalDecision } from './actions';
import { EmptyState, Orb, SectionLabel, StatusNote } from './glass';

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
    return <EmptyState icon="🎉" text={tr.portal.noPending} />;
  }

  if (remaining.length === 0) {
    return (
      <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-10 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
        <Orb className="!border-emerald-400/25 !bg-emerald-400/15 !text-lg !text-emerald-200 !shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_24px_rgba(52,211,153,0.2)]">
          ✓
        </Orb>
        <p className="text-sm text-emerald-200">{tr.approval.thanks}</p>
      </div>
    );
  }

  return (
    <div>
      <SectionLabel count={remaining.length}>
        {tr.portal.tabs.approvals}
      </SectionLabel>
      <div className="stagger-children space-y-3">
        {remaining.map((card) => {
          const langs = Object.keys(card.contents);
          const lang = activeLang[card.id] ?? langs[0] ?? 'tr';
          const content = card.contents[lang];
          const rejectComment = rejecting[card.id];
          return (
            <article
              key={card.id}
              className="rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] transition-shadow duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.75)]"
            >
              <div className="overflow-hidden rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
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
                          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${
                            l === lang
                              ? 'border-white/20 bg-white/[0.1] text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                              : 'border-white/[0.06] bg-white/[0.02] text-neutral-500 hover:border-white/[0.14] hover:text-neutral-300'
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
                    <p className="mt-1.5 text-xs leading-relaxed text-sky-400">
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
                      variant={
                        rejectComment !== undefined ? 'danger' : 'secondary'
                      }
                      className={`flex-1 ${TAP_TARGET}`}
                      onClick={() =>
                        setRejecting((p) => ({
                          ...p,
                          [card.id]: p[card.id] ?? '',
                        }))
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
                          setRejecting((p) => ({
                            ...p,
                            [card.id]: e.target.value,
                          }))
                        }
                        rows={2}
                        autoFocus
                      />
                      <Button
                        variant="danger"
                        className={`w-full ${TAP_TARGET}`}
                        onClick={() =>
                          submit(card.id, 'rejected', rejectComment)
                        }
                        disabled={pending}
                      >
                        {pending ? tr.common.loading : tr.common.confirm}
                      </Button>
                    </div>
                  )}
                  {failed[card.id] && (
                    <StatusNote tone="error" className="mt-2.5">
                      {tr.common.error}
                    </StatusNote>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
