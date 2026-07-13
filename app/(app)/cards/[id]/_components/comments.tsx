'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Panel, Textarea } from '@/components/ui';
import { addComment } from '@/lib/actions/comments';
import { fmtIstanbul } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { CardDetail } from '@/lib/db/queries';

/** Comments thread + composer. */
export function Comments({
  cardId,
  comments,
  profileNames,
}: {
  cardId: string;
  comments: CardDetail['comments'];
  profileNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  function authorName(c: CardDetail['comments'][number]): string {
    if (c.profiles?.full_name) return c.profiles.full_name;
    if (c.author && profileNames[c.author]) return profileNames[c.author];
    return tr.feed.system;
  }

  /** Up to two initials for the avatar chip — presentational only. */
  function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  }

  function submit() {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const res = await addComment({ cardId, body: text });
      if (res.ok) {
        setBody('');
        router.refresh();
      } else {
        setError(tr.errors.generic);
      }
    });
  }

  return (
    <Panel title={tr.card.comments}>
      <ul className="divide-y divide-white/[0.06]">
        {comments.length === 0 && (
          <li className="text-sm text-neutral-500">{tr.card.noComments}</li>
        )}
        {comments.map((c) => {
          const name = authorName(c);
          return (
            <li key={c.id} className="flex gap-2.5 py-3 text-sm first:pt-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[10px] font-semibold text-neutral-300">
                {initials(name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className="font-medium text-neutral-200">{name}</span>
                  <span className="text-xs text-neutral-600">
                    {fmtIstanbul(c.created_at)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-neutral-300">
                  {c.body}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
        <Textarea
          rows={2}
          value={body}
          placeholder={tr.card.commentPlaceholder}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="primary"
            disabled={pending || !body.trim()}
            onClick={submit}
          >
            {pending ? tr.common.loading : tr.card.sendComment}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
