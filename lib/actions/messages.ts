'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Team side of the client<->team thread (migration 0009). Inserts go through
 * RLS (sender='team' AND author=auth.uid()); the 0009 trigger logs
 * message.sent to the feed. Client-side sends live in lib/portal/service.ts.
 */

const sendSchema = z.object({
  clientId: z.uuid(),
  body: z.string().min(1).max(2000),
});

export async function sendClientMessage(
  input: z.input<typeof sendSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('client_messages').insert({
    client_id: parsed.data.clientId,
    sender: 'team',
    author: session.userId,
    body: parsed.data.body,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Opening a client's thread clears its unread badge for the whole team. */
export async function markClientMessagesRead(
  clientId: string,
): Promise<ActionResult> {
  await requireSession();
  if (!z.uuid().safeParse(clientId).success)
    return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from('client_messages')
    .update({ read_by_team: true })
    .eq('client_id', clientId)
    .eq('sender', 'client')
    .eq('read_by_team', false);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
