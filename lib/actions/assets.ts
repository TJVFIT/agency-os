'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole, requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/cards';

export async function enqueueBgRemove(assetId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!z.uuid().safeParse(assetId).success)
    return { ok: false, error: 'validation' };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('ai_jobs').insert({
    kind: 'bg_remove',
    payload: { asset_id: assetId },
    created_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/assets');
  return { ok: true };
}

const reelSchema = z.object({
  cardId: z.uuid(),
  assetId: z.uuid(),
  langs: z.array(z.enum(['tr', 'en'])).min(1),
});

export async function enqueueReel(
  input: z.input<typeof reelSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = reelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('ai_jobs').insert({
    kind: 'render_reel',
    // snake_case to match handleRenderReel's payload read (every worker
    // handler reads snake_case card_id/asset_id) — not the zod camelCase.
    payload: {
      card_id: parsed.data.cardId,
      asset_id: parsed.data.assetId,
      langs: parsed.data.langs,
    },
    created_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/assets');
  return { ok: true };
}

export async function deleteAsset(assetId: string): Promise<ActionResult> {
  await requireRole('admin');
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('assets').delete().eq('id', assetId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/assets');
  return { ok: true };
}
