'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Staff assistant thread actions (v4, migration 0010). The flow is fully
 * queued (CLAUDE.md rule 3): insert the user turn → enqueue a 'chat' ai_job →
 * the worker replies via the open-model chain and Realtime streams the row
 * back. Nothing here waits on an AI call.
 */

const bodySchema = z.string().trim().min(1).max(2000);

export async function sendAssistantMessage(
  body: string,
): Promise<ActionResult<{ jobId: string }>> {
  const session = await requireSession();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();

  // Own user turn — RLS self_send_assistant only allows profile_id =
  // auth.uid() with role 'user'. The assistant_messages trigger writes the
  // 'assistant.used' activity row (rule 2).
  const { data: message, error: messageError } = await supabase
    .from('assistant_messages')
    .insert({ profile_id: session.userId, role: 'user', body: parsed.data })
    .select('id')
    .single();
  if (messageError) return { ok: false, error: messageError.message };

  const { data: job, error: jobError } = await supabase
    .from('ai_jobs')
    .insert({
      kind: 'chat',
      payload: { profile_id: session.userId, message_id: message.id },
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (jobError) return { ok: false, error: jobError.message };

  return { ok: true, data: { jobId: job.id } };
}

export async function clearAssistantThread(): Promise<ActionResult> {
  const session = await requireSession();

  // RLS deliberately has no self-delete policy on assistant_messages (0010),
  // so the delete runs as the service role — scoped strictly to the caller's
  // own profile_id, which keeps it safe: a user can only clear their own
  // thread, never anyone else's.
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from('assistant_messages')
    .delete()
    .eq('profile_id', session.userId);
  if (error) return { ok: false, error: error.message };

  // No delete trigger on assistant_messages — log explicitly (rule 2).
  await admin.from('activity_log').insert({
    actor: session.userId,
    action: 'assistant.cleared',
    detail: {},
  });

  return { ok: true };
}
