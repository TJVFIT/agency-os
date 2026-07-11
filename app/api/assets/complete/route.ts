import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSessionProfile } from '@/lib/auth';
import { headObject, r2Ready } from '@/lib/r2-app';
import { createSupabaseServer } from '@/lib/supabase/server';

// SPEC §14 caps: 10 MB image, 200 MB video.
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;

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

  // Presign is the source of truth for key shape: raw uploads live at
  // private/{clientId}/uploads/{uuid}.{ext}. Reject any key whose clientId
  // segment does not match the requested client, or that is not shaped like a
  // presigned upload key — the client cannot smuggle in another client's key
  // or an arbitrary path.
  const keyPattern = new RegExp(
    `^private/${b.clientId}/uploads/[0-9a-f-]+\\.[a-z0-9]+$`,
  );
  if (!keyPattern.test(b.key))
    return NextResponse.json({ error: 'invalid_key' }, { status: 400 });

  // When R2 is reachable, HEAD the object to prove the upload actually
  // happened, that the stored content-type matches the declared kind, and that
  // it is within the SPEC §14 size cap (defence in depth over the signed
  // Content-Length on the presigned PUT).
  if (r2Ready()) {
    const head = await headObject(b.key);
    if (!head)
      return NextResponse.json({ error: 'not_uploaded' }, { status: 400 });

    const ct = head.contentType ?? '';
    const actualKind = ct.startsWith('image/')
      ? 'image'
      : ct.startsWith('video/')
        ? 'video'
        : 'other';
    if (actualKind !== b.kind)
      return NextResponse.json({ error: 'kind_mismatch' }, { status: 400 });

    const cap = actualKind === 'video' ? MAX_VIDEO : MAX_IMAGE;
    if (head.contentLength !== null && head.contentLength > cap)
      return NextResponse.json({ error: 'too_large' }, { status: 413 });
  }

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
