'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/cards';

const addCommentSchema = z.object({
  cardId: z.uuid(),
  body: z.string().min(1).max(2000),
  assetId: z.uuid().nullish(),
});

export async function addComment(
  input: z.input<typeof addCommentSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = addCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('comments').insert({
    card_id: parsed.data.cardId,
    body: parsed.data.body,
    asset_id: parsed.data.assetId ?? null,
    author: session.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/cards/${parsed.data.cardId}`);
  return { ok: true };
}
