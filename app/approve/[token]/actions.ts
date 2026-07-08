'use server';

import { z } from 'zod';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Public approval decisions (SPEC §10). No login — the token IS the auth.
 * Validated server-side with the service role; a simple per-token in-memory
 * rate limit blunts abuse (SPEC §14). Approve → status approved; reject →
 * copy_draft + a system comment carrying the reason.
 */

const decisionSchema = z.object({
  token: z.string().min(20),
  decisions: z
    .array(
      z.object({
        cardId: z.uuid(),
        decision: z.enum(['approved', 'rejected']),
        comment: z.string().max(1000).default(''),
      }),
    )
    .min(1),
});

// Per-token sliding window: max 30 submissions / 10 min (module-scoped).
const hits = new Map<string, number[]>();
function rateLimited(token: string): boolean {
  const now = Date.now();
  const windowMs = 10 * 60_000;
  const arr = (hits.get(token) ?? []).filter((t) => now - t < windowMs);
  arr.push(now);
  hits.set(token, arr);
  return arr.length > 30;
}

export async function submitApprovalDecisions(
  input: z.input<typeof decisionSchema>,
): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { token, decisions } = parsed.data;

  if (rateLimited(token)) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const { data: link } = await admin
    .from('approval_links')
    .select('id, client_id, expires_at')
    .eq('token', token)
    .single();
  if (!link || new Date(link.expires_at) < new Date())
    return { ok: false, error: 'expired' };

  // Client languages decide which state is "awaiting approval".
  const { data: client } = await admin
    .from('clients')
    .select('langs')
    .eq('id', link.client_id)
    .single();
  const langs = client?.langs ?? ['tr'];
  // A card may only be decided while it is genuinely awaiting approval —
  // translated (multi-lang) or visual_ready (single-lang). This runs with the
  // service role (bypassing the DB guard), so the gate MUST live here: without
  // it a token holder could force any card to approved or knock a published
  // card back into the pipeline. Mirrors awaitingApproval() in
  // lib/approvals/service.ts.
  const awaitingApproval = (status: string) =>
    status === 'translated' ||
    (status === 'visual_ready' && langs.length === 1);

  for (const d of decisions) {
    // Card must belong to this link's client AND be awaiting approval.
    const { data: card } = await admin
      .from('cards')
      .select('id, client_id, status')
      .eq('id', d.cardId)
      .single();
    if (!card || card.client_id !== link.client_id) continue;
    if (!awaitingApproval(card.status)) continue;

    await admin.from('approval_actions').insert({
      approval_link_id: link.id,
      card_id: d.cardId,
      decision: d.decision,
      comment: d.comment,
    });

    if (d.decision === 'approved') {
      await admin
        .from('cards')
        .update({ status: 'approved' })
        .eq('id', d.cardId)
        .eq('status', card.status); // optimistic lock against concurrent change
      await admin.from('activity_log').insert({
        actor: null,
        client_id: link.client_id,
        card_id: d.cardId,
        action: 'approval.granted',
        detail: { comment: d.comment },
      });
    } else {
      await admin
        .from('cards')
        .update({ status: 'copy_draft' })
        .eq('id', d.cardId)
        .eq('status', card.status);
      if (d.comment) {
        await admin.from('comments').insert({
          card_id: d.cardId,
          author: null,
          body: `[Müşteri reddi] ${d.comment}`,
        });
      }
      await admin.from('activity_log').insert({
        actor: null,
        client_id: link.client_id,
        card_id: d.cardId,
        action: 'approval.rejected',
        detail: { comment: d.comment },
      });
    }
  }

  return { ok: true };
}
