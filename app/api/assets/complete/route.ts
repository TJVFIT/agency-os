import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSessionProfile } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';

/** Called after a successful direct-to-R2 upload: create the asset row and
 * enqueue image_variants for images (SPEC §7.1 step 2). */
const bodySchema = z.object({
  clientId: z.uuid(),
  key: z.string().min(1),
  kind: z.enum(['image', 'video', 'other']),
  originalName: z.string().max(255).default(''),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  durationS: z.number().positive().nullish(),
});

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'validation' }, { status: 400 });
  const b = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: asset, error } = await supabase
    .from('assets')
    .insert({
      client_id: b.clientId,
      kind: b.kind,
      r2_key: b.key,
      original_name: b.originalName,
      width: b.width ?? null,
      height: b.height ?? null,
      duration_s: b.durationS ?? null,
      source: 'upload',
      uploaded_by: session.userId,
    })
    .select('id')
    .single();
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });

  if (b.kind === 'image') {
    await supabase.from('ai_jobs').insert({
      kind: 'image_variants',
      payload: { asset_id: asset.id },
      created_by: session.userId,
    });
  }

  return NextResponse.json({ assetId: asset.id });
}
