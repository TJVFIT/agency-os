'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { serverEnv } from '@/lib/env';
import { interpolate, tr } from '@/lib/i18n/tr';
import { fmtIstanbulDate } from '@/lib/dates';
import type { ActionResult } from '@/lib/actions/cards';

const createLinkSchema = z.object({
  clientId: z.uuid(),
  weekStart: z.iso.date(), // yyyy-mm-dd
});

export interface ApprovalLinkResult {
  token: string;
  url: string;
  whatsapp: string;
}

/**
 * "Onaya gönder" (SPEC §10). Manager/admin creates a 7-day signed link and
 * gets a WhatsApp-ready message. Written with the service role — the public
 * page reads it back through the service role after a token check.
 */
export async function createApprovalLink(
  input: z.input<typeof createLinkSchema>,
): Promise<ActionResult<ApprovalLinkResult>> {
  const session = await requireRole('admin', 'manager');
  const parsed = createLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 7 * 864e5).toISOString();

  const admin = createSupabaseAdmin();
  const { error } = await admin.from('approval_links').insert({
    client_id: parsed.data.clientId,
    token,
    week_start: parsed.data.weekStart,
    expires_at: expiresAt,
    created_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };

  const url = `${serverEnv().APP_URL}/approve/${token}`;
  const whatsapp = interpolate(tr.approval.whatsappMessage, {
    week: fmtIstanbulDate(parsed.data.weekStart),
    url,
  });

  await admin.from('activity_log').insert({
    actor: session.userId,
    client_id: parsed.data.clientId,
    action: 'approval.link_created',
    detail: { week: parsed.data.weekStart },
  });

  revalidatePath('/calendar');
  return { ok: true, data: { token, url, whatsapp } };
}
