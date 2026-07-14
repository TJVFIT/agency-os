/**
 * ai_jobs poll loop (SPEC §6.1). Every 2s claim a small batch via
 * claim_ai_jobs (FOR UPDATE SKIP LOCKED), run each handler sequentially
 * (concurrency 1 — one FFmpeg/whisper job at a time, §7.2), write the result,
 * and on failure apply exponential backoff up to 5 attempts before flagging
 * the job `error` + alerting admins.
 */

import type { AiJob, Enums } from '../../lib/db/types';
import { db, logActivity } from './supabase';
import { log } from './log';
import { notifyAdmins } from './telegram';
import {
  handleCaption,
  handlePlan,
  handleReply,
  handleReport,
  handleTranslate,
} from './handlers/ai';
import {
  handleCompliance,
  handleIdeaRefine,
  handlePoster,
  handleScenario,
} from './handlers/creative';
import { handleBgRemove, handleImageVariants } from './handlers/media';
import { handleEditPhoto, handleEditVideo } from './handlers/edit';
import { handleRenderReel } from './handlers/reel';
import { handlePublish } from './handlers/publish';

const POLL_MS = 2000;
const MAX_ATTEMPTS = 5;
// A 'running' job whose updated_at is older than this is considered orphaned by
// a worker crash (claim_ai_jobs stamps updated_at at claim time and only ever
// picks 'queued'). Concurrency is 1, so no legitimate job runs this long.
const STALE_RUNNING_MS = 10 * 60_000;
// How often to sweep for orphaned 'running' jobs (also runs once at startup).
const RECLAIM_MS = 2 * 60_000;

type Handler = (job: AiJob) => Promise<unknown>;

const HANDLERS: Record<Enums<'job_kind'>, Handler> = {
  caption: handleCaption,
  translate: handleTranslate,
  reply: handleReply,
  plan: handlePlan,
  report: handleReport,
  image_variants: handleImageVariants,
  bg_remove: handleBgRemove,
  render_reel: handleRenderReel,
  publish: handlePublish,
  idea_refine: handleIdeaRefine,
  scenario: handleScenario,
  poster: handlePoster,
  compliance: handleCompliance,
  edit_video: handleEditVideo,
  edit_photo: handleEditPhoto,
};

async function claimBatch(batch: number): Promise<AiJob[]> {
  const { data, error } = await db().rpc('claim_ai_jobs', { batch });
  if (error) {
    log.error({ err: error.message }, 'claim_ai_jobs failed');
    return [];
  }
  return (data ?? []) as AiJob[];
}

async function runJob(job: AiJob): Promise<void> {
  const handler = HANDLERS[job.kind];
  if (!handler) {
    await failJob(job, `no handler for kind ${job.kind}`);
    return;
  }
  try {
    const result = await handler(job);
    await db()
      .from('ai_jobs')
      .update({ status: 'done', result: (result ?? {}) as never, error: null })
      .eq('id', job.id);
    log.info({ jobId: job.id, kind: job.kind }, 'job done');
  } catch (err) {
    await failJob(job, err instanceof Error ? err.message : String(err));
  }
}

async function failJob(job: AiJob, message: string): Promise<void> {
  const attempts = job.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await db()
      .from('ai_jobs')
      .update({ status: 'error', error: message, attempts })
      .eq('id', job.id);
    log.error(
      { jobId: job.id, kind: job.kind, message },
      'job failed terminally',
    );
    // Surface the failure in the live feed (CLAUDE.md rule 2). Publish jobs
    // carry a card_id, so they render as publish.failed on that card.
    const cardId = (job.payload as { card_id?: string })?.card_id ?? null;
    await logActivity(
      job.kind === 'publish' ? 'publish.failed' : 'ai.job_failed',
      { cardId, detail: { kind: job.kind, error: message.slice(0, 300) } },
    ).catch(() => {});
    await notifyAdmins(
      `⚠️ AI işi başarısız (${job.kind}): ${message.slice(0, 200)}`,
    ).catch(() => {});
    return;
  }
  // Backoff: run_after = now + 2^attempts minutes (SPEC §6.1).
  const delayMs = 2 ** attempts * 60_000;
  const runAfter = new Date(Date.now() + delayMs).toISOString();
  await db()
    .from('ai_jobs')
    .update({ status: 'queued', error: message, attempts, run_after: runAfter })
    .eq('id', job.id);
  log.warn(
    { jobId: job.id, kind: job.kind, attempts, delayMs, message },
    'job retry scheduled',
  );
}

/**
 * Requeue orphaned 'running' jobs (worker crash recovery). claim_ai_jobs only
 * ever picks 'queued', so a job left 'running' by a crash would never retry —
 * and for publish the dispatcher dedupe (queued/running/error) would block the
 * card forever. Treat a stale run as a failed attempt via failJob so it honors
 * MAX_ATTEMPTS (→ error + alert) and exponential backoff instead of hot-looping.
 */
async function reclaimStale(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  const { data: stale, error } = await db()
    .from('ai_jobs')
    .select('*')
    .eq('status', 'running')
    .lt('updated_at', cutoff);
  if (error) {
    log.error({ err: error.message }, 'reclaimStale query failed');
    return;
  }
  if (!stale?.length) return;
  log.warn({ count: stale.length }, 'reclaiming orphaned running jobs');
  for (const job of stale as AiJob[]) {
    await failJob(job, 'reclaimed: stale running job (worker crash)');
  }
}

let running = false;
let stopped = false;

async function tick(): Promise<void> {
  if (running) return; // never overlap ticks
  running = true;
  try {
    const jobs = await claimBatch(3);
    for (const job of jobs) {
      if (stopped) break;
      await runJob(job); // sequential = global concurrency 1
    }
  } catch (err) {
    log.error({ err: String(err) }, 'poll tick error');
  } finally {
    running = false;
  }
}

export function startQueueLoop(): () => void {
  log.info('ai_jobs poll loop started');
  // Startup crash-recovery, then periodic sweeps for jobs orphaned mid-run.
  reclaimStale().catch((e) =>
    log.error({ err: String(e) }, 'reclaimStale (startup) error'),
  );
  const timer = setInterval(tick, POLL_MS);
  const reclaimTimer = setInterval(() => {
    reclaimStale().catch((e) =>
      log.error({ err: String(e) }, 'reclaimStale error'),
    );
  }, RECLAIM_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    clearInterval(reclaimTimer);
  };
}
