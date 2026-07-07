'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSession } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/cards';

const upsertContentSchema = z.object({
  cardId: z.uuid(),
  lang: z.enum(['tr', 'en']),
  caption: z.string().max(4000),
  hashtags: z.array(z.string()).default([]),
  mediaAssetIds: z.array(z.uuid()).optional(),
});

/** Writes one (card, lang) content row. History lives in activity_log. */
export async function upsertCardContent(
  input: z.input<typeof upsertContentSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = upsertContentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { cardId, lang, caption, hashtags, mediaAssetIds } = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase.from('card_contents').upsert(
    {
      card_id: cardId,
      lang,
      caption,
      hashtags,
      ...(mediaAssetIds !== undefined && { media_asset_ids: mediaAssetIds }),
      updated_by: session.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'card_id,lang' },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/cards/${cardId}`);
  return { ok: true };
}
