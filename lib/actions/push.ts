'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Web-push subscription persistence (UPGRADE_SPEC §8). The browser-side
 * PushSubscription JSON is stored per profile; the worker's notification
 * dispatcher fans out to every row. RLS: self insert/select/delete only
 * (migration 0006), so all queries here run as the signed-in user.
 */

const saveSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export async function savePushSubscription(
  input: z.input<typeof saveSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { endpoint, keys } = parsed.data;

  const supabase = await createSupabaseServer();

  // Upsert by endpoint. push_subscriptions has no UPDATE policy (0006), so
  // "upsert" is delete-own-row + insert under the self policies.
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({
    profile_id: session.userId,
    endpoint,
    keys,
  });

  if (error && error.code === '23505') {
    // Endpoint still registered to another profile (shared browser, user
    // switched accounts). RLS has no cross-user path — reassign server-side.
    const admin = createSupabaseAdmin();
    const { error: adminErr } = await admin
      .from('push_subscriptions')
      .update({ profile_id: session.userId, keys })
      .eq('endpoint', endpoint);
    if (adminErr) return { ok: false, error: adminErr.message };
  } else if (error) {
    return { ok: false, error: error.message };
  }

  // Rule 2: no trigger covers push_subscriptions — log from the action.
  await createSupabaseAdmin().from('activity_log').insert({
    actor: session.userId,
    action: 'push.subscribed',
    detail: {},
  });
  return { ok: true };
}

const removeSchema = z.object({ endpoint: z.url() });

export async function removePushSubscription(
  input: z.input<typeof removeSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  // RLS self_delete_push scopes this to the caller's own rows.
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint);
  if (error) return { ok: false, error: error.message };

  await createSupabaseAdmin().from('activity_log').insert({
    actor: session.userId,
    action: 'push.unsubscribed',
    detail: {},
  });
  return { ok: true };
}
