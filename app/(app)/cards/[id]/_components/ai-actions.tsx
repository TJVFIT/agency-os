'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState, useTransition } from 'react';

import { Button, Input, Panel, Textarea } from '@/components/ui';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { enqueueAiJob } from '@/lib/actions/ai';
import { upsertCardContent } from '@/lib/actions/contents';
import { tr } from '@/lib/i18n/tr';
import type { AiJob } from '@/lib/db/types';
import type {
  CaptionResult,
  ReplyResult,
  TranslateResult,
} from '@/lib/ai/schemas';

type Kind = 'caption' | 'translate' | 'reply';

interface CaptionState {
  status: 'pending' | 'done' | 'error';
  result?: CaptionResult;
}
interface TranslateState {
  status: 'pending' | 'done' | 'error';
  result?: TranslateResult;
}
interface ReplyState {
  status: 'pending' | 'done' | 'error';
  result?: ReplyResult;
}

/** AI buttons row: 3 caption variants → pick, Translate, Draft reply.
 * Enqueues jobs and resolves them via the ai_jobs.update realtime event,
 * filtered to jobs enqueued from this view. */
export function AiActions({
  cardId,
  langs,
  userId,
}: {
  cardId: string;
  langs: string[];
  userId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // jobId → which action produced it (only jobs enqueued here).
  const jobKinds = useRef<Map<string, Kind>>(new Map());

  const [brief, setBrief] = useState('');
  const [incoming, setIncoming] = useState('');
  const [context, setContext] = useState('');

  const [caption, setCaption] = useState<CaptionState | null>(null);
  const [translate, setTranslate] = useState<TranslateState | null>(null);
  const [reply, setReply] = useState<ReplyState | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const hasEn = langs.includes('en');

  const onJobUpdate = useCallback((job: AiJob) => {
    const kind = jobKinds.current.get(job.id);
    if (!kind) return; // not one of ours
    if (job.status !== 'done' && job.status !== 'error') return;

    const failed = job.status === 'error' || !job.result;
    if (kind === 'caption') {
      setCaption(
        failed
          ? { status: 'error' }
          : {
              status: 'done',
              result: job.result as unknown as CaptionResult,
            },
      );
    } else if (kind === 'translate') {
      setTranslate(
        failed
          ? { status: 'error' }
          : {
              status: 'done',
              result: job.result as unknown as TranslateResult,
            },
      );
    } else if (kind === 'reply') {
      setReply(
        failed
          ? { status: 'error' }
          : { status: 'done', result: job.result as unknown as ReplyResult },
      );
    }
    jobKinds.current.delete(job.id);
  }, []);

  useRealtimeEvent('ai_jobs.update', onJobUpdate);

  function enqueue(kind: Kind, payload: unknown, reset: () => void) {
    reset();
    startTransition(async () => {
      const res = await enqueueAiJob(kind, payload);
      if (res.ok && res.data) {
        jobKinds.current.set(res.data.jobId, kind);
      } else {
        // reflect immediate failure in the relevant slot
        if (kind === 'caption') setCaption({ status: 'error' });
        if (kind === 'translate') setTranslate({ status: 'error' });
        if (kind === 'reply') setReply({ status: 'error' });
      }
    });
  }

  function runCaption() {
    enqueue('caption', { card_id: cardId, brief, platform: 'instagram' }, () =>
      setCaption({ status: 'pending' }),
    );
  }

  function runTranslate() {
    enqueue('translate', { card_id: cardId, src: 'tr', tgt: 'en' }, () =>
      setTranslate({ status: 'pending' }),
    );
  }

  function runReply() {
    if (!incoming.trim()) return;
    enqueue('reply', { card_id: cardId, message: incoming, context }, () =>
      setReply({ status: 'pending' }),
    );
  }

  function applyVariant(v: { caption: string; hashtags: string[] }) {
    setApplied(null);
    startTransition(async () => {
      const res = await upsertCardContent({
        cardId,
        lang: 'tr',
        caption: v.caption,
        hashtags: v.hashtags,
      });
      if (res.ok) {
        setApplied(tr.ai.variantApplied);
        router.refresh();
      }
    });
  }

  return (
    <Panel title="AI">
      {/* Caption generation */}
      <div className="space-y-2">
        <span className="block text-xs font-medium text-neutral-400">
          {tr.ai.brief}
        </span>
        <Textarea
          rows={2}
          value={brief}
          placeholder={tr.ai.brief}
          onChange={(e) => setBrief(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={pending || caption?.status === 'pending'}
            onClick={runCaption}
          >
            {caption?.status === 'pending'
              ? tr.ai.pending
              : tr.ai.generateCaptions}
          </Button>
          {hasEn && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending || translate?.status === 'pending'}
              onClick={runTranslate}
            >
              {translate?.status === 'pending'
                ? tr.ai.pending
                : tr.ai.translate}
            </Button>
          )}
        </div>
      </div>

      {/* Caption results */}
      {caption?.status === 'error' && (
        <p className="mt-3 text-sm text-red-400">{tr.ai.failed}</p>
      )}
      {caption?.status === 'done' && caption.result && (
        <div className="mt-3 space-y-2">
          <span className="block text-xs font-medium text-neutral-400">
            {tr.ai.pickVariant}
          </span>
          {caption.result.variants.map((v, i) => (
            <div
              key={i}
              className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
            >
              <p className="whitespace-pre-wrap text-sm text-neutral-200">
                {v.caption}
              </p>
              {v.hashtags.length > 0 && (
                <p className="mt-1 text-xs text-sky-400">
                  {v.hashtags
                    .map((h) => (h.startsWith('#') ? h : `#${h}`))
                    .join(' ')}
                </p>
              )}
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  variant="primary"
                  disabled={pending}
                  onClick={() => applyVariant(v)}
                >
                  {tr.common.add}
                </Button>
              </div>
            </div>
          ))}
          {applied && <p className="text-xs text-emerald-400">{applied}</p>}
        </div>
      )}

      {/* Translation result */}
      {translate?.status === 'error' && (
        <p className="mt-3 text-sm text-red-400">{tr.ai.failed}</p>
      )}
      {translate?.status === 'done' && translate.result && (
        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <p className="whitespace-pre-wrap text-sm text-neutral-200">
            {translate.result.translation}
          </p>
          {translate.result.notes && (
            <p className="mt-2 text-xs text-amber-400">
              {tr.ai.translationNotes}: {translate.result.notes}
            </p>
          )}
        </div>
      )}

      {/* Reply drafting */}
      <div className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
        <span className="block text-xs font-medium text-neutral-400">
          {tr.ai.replyIncoming}
        </span>
        <Textarea
          rows={2}
          value={incoming}
          placeholder={tr.ai.replyIncoming}
          onChange={(e) => setIncoming(e.target.value)}
        />
        <Input
          value={context}
          placeholder={tr.ai.replyContext}
          onChange={(e) => setContext(e.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          disabled={pending || reply?.status === 'pending' || !incoming.trim()}
          onClick={runReply}
        >
          {reply?.status === 'pending' ? tr.ai.pending : tr.ai.draftReply}
        </Button>
      </div>

      {reply?.status === 'error' && (
        <p className="mt-3 text-sm text-red-400">{tr.ai.failed}</p>
      )}
      {reply?.status === 'done' && reply.result && (
        <div className="mt-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
          <p className="whitespace-pre-wrap text-sm text-neutral-200">
            {reply.result.reply}
          </p>
          {reply.result.escalate && (
            <p className="mt-2 rounded-md border border-amber-900 bg-amber-950 px-2 py-1 text-xs text-amber-300">
              ⚠ {tr.ai.replyEscalate}
              {reply.result.escalate_reason
                ? ` — ${reply.result.escalate_reason}`
                : ''}
            </p>
          )}
        </div>
      )}

      {!userId && (
        <p className="mt-3 text-xs text-neutral-600">
          {tr.common.unauthenticated}
        </p>
      )}
    </Panel>
  );
}
