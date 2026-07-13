'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

import { Button, Input, Label, Panel, Textarea } from '@/components/ui';
import { useRealtimeEvent } from '@/components/realtime-provider';
import { createSupabaseBrowser } from '@/lib/supabase/client';
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

// Safety net for a pending AI slot: if no terminal ai_jobs event resolves it
// within this window, reconcile once more and then fail loud.
const PENDING_TIMEOUT_MS = 90_000;

/** Small pulsing dot + label used inside buttons while a job is "işleniyor". */
function PendingLabel({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      {children}
    </>
  );
}

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
  platforms,
}: {
  cardId: string;
  langs: string[];
  userId: string | null;
  platforms?: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // The platform a generated caption must fit (length rules differ per
  // network). Use the card's first target platform; fall back to instagram.
  const captionPlatform = platforms?.find((p) => p) ?? 'instagram';

  // jobId → which action produced it (only jobs enqueued here).
  const jobKinds = useRef<Map<string, Kind>>(new Map());
  // Safety-net timers so a pending state can never hang forever if the
  // ai_jobs realtime UPDATE is missed or races job registration.
  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const [brief, setBrief] = useState('');
  const [incoming, setIncoming] = useState('');
  const [context, setContext] = useState('');

  const [caption, setCaption] = useState<CaptionState | null>(null);
  const [translate, setTranslate] = useState<TranslateState | null>(null);
  const [reply, setReply] = useState<ReplyState | null>(null);
  const [applied, setApplied] = useState<string | null>(null);

  const hasEn = langs.includes('en');

  const setError = useCallback((kind: Kind) => {
    if (kind === 'caption') setCaption({ status: 'error' });
    else if (kind === 'translate') setTranslate({ status: 'error' });
    else if (kind === 'reply') setReply({ status: 'error' });
  }, []);

  // Apply a terminal ai_job to its slot. Returns true if the job was terminal
  // (done/error) and resolved; false if still queued/running (leave pending).
  const applyResult = useCallback((kind: Kind, job: AiJob): boolean => {
    if (job.status !== 'done' && job.status !== 'error') return false;
    const failed = job.status === 'error' || !job.result;
    if (kind === 'caption') {
      setCaption(
        failed
          ? { status: 'error' }
          : { status: 'done', result: job.result as unknown as CaptionResult },
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
    return true;
  }, []);

  const onJobUpdate = useCallback(
    (job: AiJob) => {
      const kind = jobKinds.current.get(job.id);
      if (!kind) return; // not one of ours
      if (applyResult(kind, job)) jobKinds.current.delete(job.id);
    },
    [applyResult],
  );

  useRealtimeEvent('ai_jobs.update', onJobUpdate);

  // Fetch a job directly and resolve it if terminal. Covers the race where the
  // realtime UPDATE fires before we register the jobId, and dropped events.
  const reconcile = useCallback(
    async (jobId: string, kind: Kind): Promise<boolean> => {
      if (!jobKinds.current.has(jobId)) return true; // already resolved
      const supabase = createSupabaseBrowser();
      const { data } = await supabase
        .from('ai_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();
      if (data && applyResult(kind, data as AiJob)) {
        jobKinds.current.delete(jobId);
        return true;
      }
      return false;
    },
    [applyResult],
  );

  // Clear outstanding timers on unmount.
  useEffect(() => {
    const set = timers.current;
    return () => {
      for (const t of set) clearTimeout(t);
      set.clear();
    };
  }, []);

  function enqueue(kind: Kind, payload: unknown, reset: () => void) {
    reset();
    startTransition(async () => {
      const res = await enqueueAiJob(kind, payload);
      if (!res.ok || !res.data) {
        // reflect immediate failure in the relevant slot
        setError(kind);
        return;
      }
      const { jobId } = res.data;
      jobKinds.current.set(jobId, kind);
      // The worker may have already finished (and emitted the UPDATE) before we
      // registered the id above — reconcile immediately so we don't hang.
      void reconcile(jobId, kind);
      // Last resort: if still pending later, re-check; unstick to error so the
      // button can't stay disabled forever on a missed event / dead worker.
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        void reconcile(jobId, kind).then((resolved) => {
          if (!resolved && jobKinds.current.delete(jobId)) setError(kind);
        });
      }, PENDING_TIMEOUT_MS);
      timers.current.add(timer);
    });
  }

  function runCaption() {
    enqueue(
      'caption',
      { card_id: cardId, brief, platform: captionPlatform },
      () => setCaption({ status: 'pending' }),
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
        <Label>{tr.ai.brief}</Label>
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
            {caption?.status === 'pending' ? (
              <PendingLabel>{tr.ai.pending}</PendingLabel>
            ) : (
              tr.ai.generateCaptions
            )}
          </Button>
          {hasEn && (
            <Button
              type="button"
              variant="secondary"
              disabled={pending || translate?.status === 'pending'}
              onClick={runTranslate}
            >
              {translate?.status === 'pending' ? (
                <PendingLabel>{tr.ai.pending}</PendingLabel>
              ) : (
                tr.ai.translate
              )}
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
          <Label>{tr.ai.pickVariant}</Label>
          {caption.result.variants.map((v, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
            >
              <p className="whitespace-pre-wrap text-sm text-neutral-200">
                {v.caption}
              </p>
              {v.hashtags.length > 0 && (
                <p className="mt-1.5 text-xs text-sky-300">
                  {v.hashtags
                    .map((h) => (h.startsWith('#') ? h : `#${h}`))
                    .join(' ')}
                </p>
              )}
              <div className="mt-2.5 flex justify-end">
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
          {applied && (
            <p className="text-xs text-emerald-400">✓ {applied}</p>
          )}
        </div>
      )}

      {/* Translation result */}
      {translate?.status === 'error' && (
        <p className="mt-3 text-sm text-red-400">{tr.ai.failed}</p>
      )}
      {translate?.status === 'done' && translate.result && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="whitespace-pre-wrap text-sm text-neutral-200">
            {translate.result.translation}
          </p>
          {translate.result.notes && (
            <p className="mt-2 text-xs text-amber-300">
              {tr.ai.translationNotes}: {translate.result.notes}
            </p>
          )}
        </div>
      )}

      {/* Reply drafting */}
      <div className="mt-5 space-y-2 border-t border-white/[0.06] pt-4">
        <Label>{tr.ai.replyIncoming}</Label>
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
          {reply?.status === 'pending' ? (
            <PendingLabel>{tr.ai.pending}</PendingLabel>
          ) : (
            tr.ai.draftReply
          )}
        </Button>
      </div>

      {reply?.status === 'error' && (
        <p className="mt-3 text-sm text-red-400">{tr.ai.failed}</p>
      )}
      {reply?.status === 'done' && reply.result && (
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <p className="whitespace-pre-wrap text-sm text-neutral-200">
            {reply.result.reply}
          </p>
          {reply.result.escalate && (
            <p className="mt-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1.5 text-xs text-amber-200">
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
