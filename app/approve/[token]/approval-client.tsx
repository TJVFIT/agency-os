'use client';

import { useState, useTransition } from 'react';

import { tr } from '@/lib/i18n/tr';
import type { ApprovalView } from '@/lib/approvals/service';
import { submitApprovalDecisions } from './actions';

type Decision = 'approved' | 'rejected';

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
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="mt-16 rounded-lg border border-emerald-900 bg-emerald-950 p-4 text-center text-sm text-emerald-200">
        {tr.approval.thanks}
      </p>
    );
  }

  if (view.cards.length === 0) {
    return (
      <p className="mt-16 text-center text-sm text-neutral-400">
        {tr.approval.nothingPending}
      </p>
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
    startTransition(async () => {
      const res = await submitApprovalDecisions({ token, decisions: payload });
      if (res.ok) setDone(true);
    });
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => submit('approved')}
        disabled={pending}
        className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {tr.approval.approveAll}
      </button>

      {view.cards.map((card) => {
        const langs = Object.keys(card.contents);
        const lang = activeLang[card.id] ?? langs[0] ?? 'tr';
        const content = card.contents[lang];
        const chosen = decisions[card.id];
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
                  onClick={() => setDecision(card.id, 'approved')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                    chosen?.decision === 'approved'
                      ? 'bg-emerald-600 text-white'
                      : 'border border-neutral-700 text-neutral-300'
                  }`}
                >
                  ✓ {tr.approval.approveOne}
                </button>
                <button
                  onClick={() => setDecision(card.id, 'rejected')}
                  className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                    chosen?.decision === 'rejected'
                      ? 'bg-red-600 text-white'
                      : 'border border-neutral-700 text-neutral-300'
                  }`}
                >
                  ✗ {tr.approval.rejectOne}
                </button>
              </div>
              {chosen?.decision === 'rejected' && (
                <textarea
                  placeholder={tr.approval.rejectCommentPlaceholder}
                  value={chosen.comment}
                  onChange={(e) =>
                    setDecision(card.id, 'rejected', e.target.value)
                  }
                  className="mt-2 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-100"
                  rows={2}
                />
              )}
            </div>
          </article>
        );
      })}

      <button
        onClick={() => submit()}
        disabled={pending || Object.keys(decisions).length === 0}
        className="w-full rounded-lg bg-neutral-100 py-2.5 text-sm font-semibold text-neutral-950 disabled:opacity-40"
      >
        {pending ? tr.common.loading : tr.common.confirm}
      </button>
    </div>
  );
}
