'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { ActionResult } from '@/lib/actions/cards';

const retrySchema = z.object({ jobId: z.string().uuid() });

/**
 * Manager/admin: reset a terminally-failed publish job so the queue re-runs it.
 * handlePublish re-verifies status/approval/compliance and skips
 * already-posted platforms (idempotent), so a retry can't double-post. Closes
 * the v2-audit gap where a terminally-errored publish left the card stuck at
 * 'scheduled' with no operator recovery path (req 28).
 */
export async function retryFailedPublish(
  input: z.input<typeof retrySchema>,
): Promise<ActionResult> {
  const session = await requireRole('manager', 'admin');
  const parsed = retrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from('ai_jobs')
    .update({
      status: 'queued',
      attempts: 0,
      error: null,
      run_after: new Date().toISOString(),
    })
    .eq('id', parsed.data.jobId)
    .eq('kind', 'publish')
    .eq('status', 'error')
    .select('id, payload');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'notFound' };

  const cardId =
    (data[0].payload as { card_id?: string } | null)?.card_id ?? null;
  await admin.from('activity_log').insert({
    actor: session.userId,
    card_id: cardId,
    action: 'publish.retry',
    detail: { job_id: parsed.data.jobId },
  });

  revalidatePath('/dashboard');
  return { ok: true };
}
