import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getSessionProfile } from '@/lib/auth';
import { presignPut, r2Ready } from '@/lib/r2-app';

// SPEC §14 caps: 10 MB image, 200 MB video; content-type restricted.
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;

const bodySchema = z.object({
  clientId: z.uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^(image|video)\//),
  size: z.number().int().positive(),
});

export async function POST(request: Request) {
  const session = await getSessionProfile();
  if (!session)
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!r2Ready())
    return NextResponse.json({ error: 'r2_not_configured' }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: 'validation' }, { status: 400 });

  const { clientId, filename, contentType, size } = parsed.data;
  const isVideo = contentType.startsWith('video/');
  if (size > (isVideo ? MAX_VIDEO : MAX_IMAGE))
    return NextResponse.json({ error: 'too_large' }, { status: 413 });

  const ext =
    filename
      .split('.')
      .pop()
      ?.toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'bin';
  // Raw uploads live under private/ (SPEC: variants under public/).
  const key = `private/${clientId}/uploads/${crypto.randomUUID()}.${ext}`;

  const url = await presignPut(key, contentType);
  if (!url)
    return NextResponse.json({ error: 'r2_not_configured' }, { status: 503 });

  return NextResponse.json({ key, url });
}
