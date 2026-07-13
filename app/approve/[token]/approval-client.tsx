'use client';

import { useState, useTransition } from 'react';

import { Button, Textarea } from '@/components/ui';
import { tr } from '@/lib/i18n/tr';
import type { ApprovalView } from '@/lib/approvals/service';
import { submitApprovalDecisions } from './actions';

type Decision = 'approved' | 'rejected';

/** Extra vertical padding on top of the Button primitive's default sizing —
 *  this page is opened from a phone to approve a week of content, so every
 *  decision button gets a big, thumb-reachable tap target. */
const TAP_TARGET = '!py-3.5';

export function ApprovalClient({
  token,
  view,
}: {
  token: string;
  view: ApprovalView;
}) {
  const [decisions, setDecisions] = useState<
    Record<string, { decision: Decision; comment: string }>
  >({});
  const [activeLang, setActiveLang] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (done) {
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

  if (view.cards.length === 0) {
    return (
      <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-12 text-center">
        <span aria-hidden className="text-3xl">
          🎉
        </span>
        <p className="text-sm text-neutral-400">{tr.approval.nothingPending}</p>
      </div>
    );
  }

  function setDecision(cardId: string, decision: Decision, comment = '') {
    setDecisions((prev) => ({ ...prev, [cardId]: { decision, comment } }));
  }

  function submit(all?: Decision) {
    // 'Hepsini onayla' is the deliberate approve-all. The plain confirm only
    // submits cards the client explicitly decided — an undecided card is never
    // sent (and therefore never silently approved).
    const payload = all
      ? view.cards.map((c) => ({ cardId: c.id, decision: all, comment: '' }))
      : view.cards
          .filter((c) => decisions[c.id])
          .map((c) => {
            const chosen = decisions[c.id]!;
            return {
              cardId: c.id,
              decision: chosen.decision,
              comment: chosen.comment,
            };
          });
    if (payload.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await submitApprovalDecisions({ token, decisions: payload });
      if (res.ok) {
        setDone(true);
      } else {
        // Public surface — never fail silently. Tell the client why.
        setError(
          res.error === 'expired' ? tr.approval.expired : tr.errors.generic,
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <Button
        variant="primary"
        className={`w-full ${TAP_TARGET}`}
        onClick={() => submit('approved')}
        disabled={pending}
      >
        {tr.approval.approveAll}
      </Button>

      <div className="stagger-children space-y-3">
        {view.cards.map((card) => {
          const langs = Object.keys(card.contents);
          const lang = activeLang[card.id] ?? langs[0] ?? 'tr';
          const content = card.contents[lang];
          const chosen = decisions[card.id];
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
                    variant={
                      chosen?.decision === 'approved' ? 'primary' : 'secondary'
                    }
                    className={`flex-1 ${TAP_TARGET}`}
                    onClick={() => setDecision(card.id, 'approved')}
                  >
                    ✓ {tr.approval.approveOne}
                  </Button>
                  <Button
                    variant={
                      chosen?.decision === 'rejected' ? 'danger' : 'secondary'
                    }
                    className={`flex-1 ${TAP_TARGET}`}
                    onClick={() => setDecision(card.id, 'rejected')}
                  >
                    ✗ {tr.approval.rejectOne}
                  </Button>
                </div>
                {chosen?.decision === 'rejected' && (
                  <Textarea
                    placeholder={tr.approval.rejectCommentPlaceholder}
                    value={chosen.comment}
                    onChange={(e) =>
                      setDecision(card.id, 'rejected', e.target.value)
                    }
                    className="mt-2.5"
                    rows={2}
                  />
                )}
              </div>
            </article>
          );
        })}
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-center text-sm text-red-300">
          {error}
        </p>
      )}

      <Button
        variant="primary"
        className={`w-full ${TAP_TARGET}`}
        onClick={() => submit()}
        disabled={pending || Object.keys(decisions).length === 0}
      >
        {pending ? tr.common.loading : tr.common.confirm}
      </Button>
    </div>
  );
}
