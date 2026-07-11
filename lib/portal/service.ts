import 'server-only';

import { headers } from 'next/headers';
import { z } from 'zod';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { parseAssetVariants } from '@/lib/db/domain';
import { publicAssetUrl } from '@/lib/r2-url';
import { istanbulToUtc } from '@/lib/dates';
import type { ActionResult } from '@/lib/actions/cards';
import type { ApprovalCard } from '@/lib/approvals/service';
import type { CardContent, Database } from '@/lib/db/types';

/**
 * Service-role data access for the public client portal (UPGRADE_SPEC §2).
 * Same hardening as lib/approvals/service.ts: the anon key never touches
 * these tables — the durable portal token is validated here and only that
 * client's data is returned. Inserts into client_ideas/client_availability
 * are service-role only by design (RLS blocks anon AND authenticated).
 */

type IdeaStatus = Database['public']['Enums']['idea_status'];

export interface PortalIdea {
  id: string;
  title: string;
  status: IdeaStatus;
  createdAt: string;
}

export interface PortalAvailability {
  id: string;
  startsAt: string;
  endsAt: string;
  note: string;
}

export interface PortalView {
  linkId: string;
  clientId: string;
  clientName: string;
  logoUrl: string | null;
  langs: string[];
  cards: ApprovalCard[];
  ideas: PortalIdea[];
  availability: PortalAvailability[];
}

/** AI output stored in client_ideas.refined (see SPEC §4 idea_refine). */
const refinedIdeaSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  goal: z.string().optional(),
  suggested_type: z.string().optional(),
});
export type RefinedIdea = z.infer<typeof refinedIdeaSchema>;

export function parseRefinedIdea(json: unknown): RefinedIdea | null {
  if (!json) return null;
  const parsed = refinedIdeaSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// Per-IP sliding window: max 30 submissions / 10 min (module-scoped) — same
// limiter pattern as app/approve/[token]/actions.ts. Keyed on the client IP
// (SPEC §14 — a caller-supplied token is not a throttle key), with expired
// windows evicted every call and a hard key cap so a flood of distinct IPs
// (or forged X-Forwarded-For values) can't exhaust process memory.
const hits = new Map<string, number[]>();
const WINDOW_MS = 10 * 60_000;
const MAX_HITS = 30;
const MAX_KEYS = 10_000;

async function portalClientIp(): Promise<string> {
  const xff = (await headers()).get('x-forwarded-for');
  return xff?.split(',')[0]?.trim() || 'unknown';
}

export async function portalRateLimited(): Promise<boolean> {
  const ip = await portalClientIp();
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

type Admin = ReturnType<typeof createSupabaseAdmin>;

/** Token → active portal link, or null (unknown / revoked). */
async function loadActiveLink(admin: Admin, token: string) {
  if (typeof token !== 'string' || token.length < 20) return null;
  const { data: link } = await admin
    .from('portal_links')
    .select('id, client_id, active')
    .eq('token', token)
    .single();
  if (!link || !link.active) return null;
  return link;
}

/**
 * Cards awaiting approval = translated, or visual_ready for single-lang.
 * Mirrors awaitingApproval() in lib/approvals/service.ts — keep in sync.
 */
export function awaitingApproval(status: string, langs: string[]): boolean {
  return (
    status === 'translated' || (status === 'visual_ready' && langs.length === 1)
  );
}

export async function loadPortalView(
  token: string,
): Promise<PortalView | null> {
  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return null;

  const { data: client } = await admin
    .from('clients')
    .select('name, langs, logo_asset_id')
    .eq('id', link.client_id)
    .single();
  if (!client) return null;

  let logoUrl: string | null = null;
  if (client.logo_asset_id) {
    const { data: logo } = await admin
      .from('assets')
      .select('r2_key, variants')
      .eq('id', client.logo_asset_id)
      .single();
    if (logo) {
      const v = parseAssetVariants(logo.variants);
      logoUrl = publicAssetUrl(v.thumb ?? logo.r2_key);
    }
  }

  const { data: cards } = await admin
    .from('cards')
    .select('id, title, type, status, card_contents(*)')
    .eq('client_id', link.client_id)
    .order('created_at');

  const pending = (cards ?? []).filter((c) =>
    awaitingApproval(c.status, client.langs),
  );

  const approvalCards: ApprovalCard[] = await Promise.all(
    pending.map(async (c) => {
      const contents: ApprovalCard['contents'] = {};
      for (const cc of (c.card_contents as CardContent[]) ?? []) {
        const media: string[] = [];
        if (cc.media_asset_ids?.length) {
          const { data: assets } = await admin
            .from('assets')
            .select('r2_key, variants')
            .in('id', cc.media_asset_ids);
          for (const a of assets ?? []) {
            const v = parseAssetVariants(a.variants);
            media.push(publicAssetUrl(v.portrait ?? a.r2_key));
          }
        }
        contents[cc.lang] = {
          caption: cc.caption,
          hashtags: cc.hashtags ?? [],
          media,
        };
      }
      return { id: c.id, title: c.title, type: c.type, contents };
    }),
  );

  const { data: ideas } = await admin
    .from('client_ideas')
    .select('id, title, status, created_at')
    .eq('client_id', link.client_id)
    .order('created_at', { ascending: false })
    .limit(10);

  const { data: windows } = await admin
    .from('client_availability')
    .select('id, starts_at, ends_at, note')
    .eq('client_id', link.client_id)
    .gte('ends_at', new Date().toISOString())
    .order('starts_at')
    .limit(10);

  return {
    linkId: link.id,
    clientId: link.client_id,
    clientName: client.name,
    logoUrl,
    langs: client.langs,
    cards: approvalCards,
    ideas: (ideas ?? []).map((i) => ({
      id: i.id,
      title: i.title,
      status: i.status,
      createdAt: i.created_at,
    })),
    availability: (windows ?? []).map((w) => ({
      id: w.id,
      startsAt: w.starts_at,
      endsAt: w.ends_at,
      note: w.note,
    })),
  };
}

const ideaInputSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
});

/**
 * Portal "Fikir gönder": insert the idea (service role) and enqueue an
 * idea_refine AI job. The 0006 trigger writes the `idea.received` activity.
 */
export async function submitIdea(
  token: string,
  input: z.input<typeof ideaInputSchema>,
): Promise<ActionResult> {
  const parsed = ideaInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (await portalRateLimited()) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };

  const { data: idea, error } = await admin
    .from('client_ideas')
    .insert({
      client_id: link.client_id,
      portal_link_id: link.id,
      title: parsed.data.title,
      body: parsed.data.body,
    })
    .select('id')
    .single();
  if (error || !idea) return { ok: false, error: error?.message ?? 'insert' };

  // Queue the AI refine pass (CLAUDE.md rule 3 — never call providers inline).
  await admin.from('ai_jobs').insert({
    kind: 'idea_refine',
    payload: { idea_id: idea.id },
    created_by: null,
  });

  return { ok: true };
}

const availabilityInputSchema = z
  .object({
    /** Wall-clock Istanbul values from <input type="datetime-local">. */
    startsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
    endsAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/),
    note: z.string().max(500).default(''),
  })
  .refine((v) => istanbulToUtc(v.endsAt) > istanbulToUtc(v.startsAt), {
    message: 'ends_before_start',
  });

/** Portal "Müsaitlik": insert the window (service role) + activity log. */
export async function submitAvailability(
  token: string,
  input: z.input<typeof availabilityInputSchema>,
): Promise<ActionResult> {
  const parsed = availabilityInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (await portalRateLimited()) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };

  const startsAt = istanbulToUtc(parsed.data.startsAt).toISOString();
  const endsAt = istanbulToUtc(parsed.data.endsAt).toISOString();

  const { error } = await admin.from('client_availability').insert({
    client_id: link.client_id,
    portal_link_id: link.id,
    starts_at: startsAt,
    ends_at: endsAt,
    note: parsed.data.note,
  });
  if (error) return { ok: false, error: error.message };

  // No insert trigger on client_availability — log here (rule 2).
  await admin.from('activity_log').insert({
    actor: null,
    client_id: link.client_id,
    action: 'availability.received',
    detail: { starts_at: startsAt, ends_at: endsAt, note: parsed.data.note },
  });

  return { ok: true };
}

const decisionInputSchema = z.object({
  cardId: z.uuid(),
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().max(1000).default(''),
});

/**
 * Portal approval decision — adapted from app/approve/[token]/actions.ts.
 * Same status gate: this runs with the service role (bypassing the DB
 * guard), so the "genuinely awaiting approval" check MUST live here.
 * approval_actions is not written (its FK targets approval_links, not
 * portal_links) — the activity_log entries carry the audit trail instead,
 * tagged with source: 'portal'.
 */
export async function submitDecision(
  token: string,
  input: z.input<typeof decisionInputSchema>,
): Promise<ActionResult> {
  const parsed = decisionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (await portalRateLimited()) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };

  const { data: client } = await admin
    .from('clients')
    .select('langs')
    .eq('id', link.client_id)
    .single();
  const langs = client?.langs ?? ['tr'];

  const { cardId, decision, comment } = parsed.data;

  // Card must belong to this link's client AND be awaiting approval.
  const { data: card } = await admin
    .from('cards')
    .select('id, client_id, status')
    .eq('id', cardId)
    .single();
  if (!card || card.client_id !== link.client_id)
    return { ok: false, error: 'cardNotFound' };
  if (!awaitingApproval(card.status, langs))
    return { ok: false, error: 'not_awaiting_approval' };

  // Transition under the optimistic lock FIRST and confirm it matched a row.
  // If 0 rows changed (already decided / raced), return cleanly WITHOUT writing
  // an activity entry — otherwise we'd log a false 'approval.granted' and fire a
  // false notification for a decision that never actually landed.
  const nextStatus = decision === 'approved' ? 'approved' : 'copy_draft';
  const { data: updated } = await admin
    .from('cards')
    .update({ status: nextStatus })
    .eq('id', cardId)
    .eq('status', card.status) // optimistic lock against concurrent change
    .select('id');
  if (!updated || updated.length === 0) return { ok: true };

  if (decision === 'approved') {
    await admin.from('activity_log').insert({
      actor: null,
      client_id: link.client_id,
      card_id: cardId,
      action: 'approval.granted',
      detail: { comment, source: 'portal' },
    });
  } else {
    if (comment) {
      await admin.from('comments').insert({
        card_id: cardId,
        author: null,
        body: `[Müşteri reddi] ${comment}`,
      });
    }
    await admin.from('activity_log').insert({
      actor: null,
      client_id: link.client_id,
      card_id: cardId,
      action: 'approval.rejected',
      detail: { comment, source: 'portal' },
    });
  }

  return { ok: true };
}
