'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { parseRefinedIdea } from '@/lib/portal/service';
import type { ActionResult } from '@/lib/actions/cards';
import type { Database } from '@/lib/db/types';

/**
 * Agency-side portal management (UPGRADE_SPEC §2): durable per-client portal
 * links + the Fikir kutusu (client ideas inbox) on /clients/[id].
 */

const CARD_TYPES = ['post', 'reel', 'story', 'reply', 'other'] as const;
type CardType = Database['public']['Enums']['card_type'];

const createLinkSchema = z.object({ clientId: z.uuid() });

/** Manager/admin mints a durable portal token; one active link per client. */
export async function createPortalLink(
  input: z.input<typeof createLinkSchema>,
): Promise<ActionResult<{ url: string }>> {
  const session = await requireRole('admin', 'manager');
  const parsed = createLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const token = randomBytes(32).toString('base64url');
  const admin = createSupabaseAdmin();

  // Keep a single live token per client — revoke any previous active link.
  await admin
    .from('portal_links')
    .update({ active: false })
    .eq('client_id', parsed.data.clientId)
    .eq('active', true);

  const { error } = await admin.from('portal_links').insert({
    client_id: parsed.data.clientId,
    token,
    created_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };

  // No insert trigger on portal_links — log here (rule 2).
  await admin.from('activity_log').insert({
    actor: session.userId,
    client_id: parsed.data.clientId,
    action: 'portal.link_created',
    detail: {},
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true, data: { url: `${serverEnv().APP_URL}/portal/${token}` } };
}

const revokeLinkSchema = z.object({ linkId: z.uuid(), clientId: z.uuid() });

export async function revokePortalLink(
  input: z.input<typeof revokeLinkSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = revokeLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from('portal_links')
    .update({ active: false })
    .eq('id', parsed.data.linkId)
    .eq('client_id', parsed.data.clientId);
  if (error) return { ok: false, error: error.message };

  await admin.from('activity_log').insert({
    actor: session.userId,
    client_id: parsed.data.clientId,
    action: 'portal.link_revoked',
    detail: { link_id: parsed.data.linkId },
  });

  revalidatePath(`/clients/${parsed.data.clientId}`);
  return { ok: true };
}

const ideaIdSchema = z.object({ ideaId: z.uuid() });

/**
 * Accept a client idea: open a card from it (AI-refined title when present),
 * carry the brief into a first comment, mark the idea accepted and queue a
 * `scenario` AI job for the new card.
 */
export async function acceptIdea(
  input: z.input<typeof ideaIdSchema>,
): Promise<ActionResult<{ cardId: string }>> {
  const session = await requireRole('admin', 'manager');
  const parsed = ideaIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data: idea } = await supabase
    .from('client_ideas')
    .select('id, client_id, title, body, status, refined')
    .eq('id', parsed.data.ideaId)
    .single();
  if (!idea) return { ok: false, error: 'notFound' };
  if (idea.status === 'accepted' || idea.status === 'rejected')
    return { ok: false, error: 'already_resolved' };

  const refined = parseRefinedIdea(idea.refined);
  const type: CardType = (CARD_TYPES as readonly string[]).includes(
    refined?.suggested_type ?? '',
  )
    ? (refined!.suggested_type as CardType)
    : 'post';

  // Card via the RLS'd client — the v1 trigger logs card.created with actor.
  const { data: card, error: cardErr } = await supabase
    .from('cards')
    .insert({
      client_id: idea.client_id,
      title: refined?.title ?? idea.title,
      type,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (cardErr || !card)
    return { ok: false, error: cardErr?.message ?? 'insert' };

  // First comment: the client's original brief + the AI summary when present.
  const commentBody = [
    `[Müşteri fikri] ${idea.title}`,
    idea.body,
    refined?.summary ? `AI özeti: ${refined.summary}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
  await supabase.from('comments').insert({
    card_id: card.id,
    author: session.userId,
    body: commentBody,
  });

  const { error: ideaErr } = await supabase
    .from('client_ideas')
    .update({ status: 'accepted', card_id: card.id })
    .eq('id', idea.id);
  if (ideaErr) return { ok: false, error: ideaErr.message };

  const admin = createSupabaseAdmin();
  // No status-change trigger on client_ideas — log here (rule 2).
  await admin.from('activity_log').insert({
    actor: session.userId,
    client_id: idea.client_id,
    card_id: card.id,
    action: 'idea.accepted',
    detail: { idea_id: idea.id, title: idea.title },
  });

  // Queue the scenario job for the new card (CLAUDE.md rule 3).
  await admin.from('ai_jobs').insert({
    kind: 'scenario',
    payload: { card_id: card.id, brief: refined?.summary ?? idea.body },
    created_by: session.userId,
  });

  revalidatePath(`/clients/${idea.client_id}`);
  revalidatePath('/board');
  return { ok: true, data: { cardId: card.id } };
}

export async function rejectIdea(
  input: z.input<typeof ideaIdSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = ideaIdSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data: idea } = await supabase
    .from('client_ideas')
    .select('id, client_id, title, status')
    .eq('id', parsed.data.ideaId)
    .single();
  if (!idea) return { ok: false, error: 'notFound' };
  if (idea.status === 'accepted' || idea.status === 'rejected')
    return { ok: false, error: 'already_resolved' };

  const { error } = await supabase
    .from('client_ideas')
    .update({ status: 'rejected' })
    .eq('id', idea.id);
  if (error) return { ok: false, error: error.message };

  const admin = createSupabaseAdmin();
  await admin.from('activity_log').insert({
    actor: session.userId,
    client_id: idea.client_id,
    action: 'idea.rejected',
    detail: { idea_id: idea.id, title: idea.title },
  });

  revalidatePath(`/clients/${idea.client_id}`);
  return { ok: true };
}
