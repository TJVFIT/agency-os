'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Public approval decisions (SPEC §10). No login — the token IS the auth.
 * Validated server-side with the service role; a simple per-IP in-memory
 * rate limit blunts abuse (SPEC §14). Approve → status approved; reject →
 * copy_draft + a system comment carrying the reason.
 */

const decisionSchema = z.object({
  token: z.string().min(20).max(200),
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

// Per-IP sliding window: max 30 submissions / 10 min (module-scoped). Keyed on
// the client IP (SPEC §14 — a caller-supplied token is not a throttle key), with
// expired windows evicted every call and a hard key cap so a flood of distinct
// IPs (or forged X-Forwarded-For values) can't exhaust process memory.
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_HITS = 30;
const MAX_KEYS = 10_000;

async function clientIp(): Promise<string> {
  const xff = (await headers()).get('x-forwarded-for');
  return xff?.split(',')[0]?.trim() || 'unknown';
}

function rateLimited(ip: string): boolean {
  const now = Date.now();
  // Evict expired windows so the map stays bounded under normal traffic.
  for (const [key, times] of hits) {
    const kept = times.filter((t) => now - t < WINDOW_MS);
    if (kept.length === 0) hits.delete(key);
    else hits.set(key, kept);
  }
  // Hard cap: once saturated, shed previously-unseen IPs rather than grow.
  if (!hits.has(ip) && hits.size >= MAX_KEYS) return true;
  const arr = hits.get(ip) ?? [];
  arr.push(now);
  hits.set(ip, arr);
  return arr.length > MAX_HITS;
}

export async function submitApprovalDecisions(
  input: z.input<typeof decisionSchema>,
): Promise<ActionResult> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { token, decisions } = parsed.data;

  if (rateLimited(await clientIp()))
    return { ok: false, error: 'rate_limited' };

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

    // Transition under the optimistic lock FIRST and confirm it matched a row.
    // If 0 rows changed (already decided / raced), skip the audit + activity
    // writes entirely — otherwise we'd log a false 'approval.granted' and fire a
    // false notification for a decision that never actually landed.
    const nextStatus = d.decision === 'approved' ? 'approved' : 'copy_draft';
    const { data: updated } = await admin
      .from('cards')
      .update({ status: nextStatus })
      .eq('id', d.cardId)
      .eq('status', card.status) // optimistic lock against concurrent change
      .select('id');
    if (!updated || updated.length === 0) continue;

    await admin.from('approval_actions').insert({
      approval_link_id: link.id,
      card_id: d.cardId,
      decision: d.decision,
      comment: d.comment,
    });

    if (d.decision === 'approved') {
      await admin.from('activity_log').insert({
        actor: null,
        client_id: link.client_id,
        card_id: d.cardId,
        action: 'approval.granted',
        detail: { comment: d.comment },
      });
    } else {
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
