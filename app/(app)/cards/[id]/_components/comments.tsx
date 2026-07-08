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

  function authorName(c: CardDetail['comments'][number]): string {
    if (c.profiles?.full_name) return c.profiles.full_name;
    if (c.author && profileNames[c.author]) return profileNames[c.author];
    return tr.feed.system;
  }

  function submit() {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const res = await addComment({ cardId, body: text });
      if (res.ok) {
        setBody('');
        router.refresh();
      }
    });
  }

  return (
    <Panel title={tr.card.comments}>
      <ul className="space-y-3">
        {comments.length === 0 && (
          <li className="text-sm text-neutral-500">{tr.card.noComments}</li>
        )}
        {comments.map((c) => (
          <li key={c.id} className="text-sm">
            <div className="mb-0.5 flex items-baseline gap-2">
              <span className="font-medium text-neutral-200">
                {authorName(c)}
              </span>
              <span className="text-xs text-neutral-600">
                {fmtIstanbul(c.created_at)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-neutral-300">{c.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
        <Textarea
          rows={2}
          value={body}
          placeholder={tr.card.commentPlaceholder}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
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
