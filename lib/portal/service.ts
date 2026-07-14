import 'server-only';

import { randomUUID } from 'node:crypto';

import { headers } from 'next/headers';
import { z } from 'zod';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import {
  clientContactSchema,
  parseAssetVariants,
  parseClientContact,
  type ClientContact,
} from '@/lib/db/domain';
import { headObject, presignPut, r2Ready } from '@/lib/r2-app';
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

export interface PortalMessage {
  id: string;
  sender: Database['public']['Enums']['message_sender'];
  body: string;
  createdAt: string;
}

export interface PortalPipelineCard {
  id: string;
  title: string;
  type: string;
  status: string;
  scheduledAt: string | null;
}

export interface PortalAsset {
  id: string;
  kind: Database['public']['Enums']['asset_kind'];
  name: string;
  source: Database['public']['Enums']['asset_source'];
  createdAt: string;
  /** Public thumb rendition when variants exist (images). */
  thumbUrl: string | null;
  /** Public URL when the object itself lives under public/ (edit results). */
  url: string | null;
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
  contact: ClientContact;
  messages: PortalMessage[];
  unreadMessages: number;
  pipeline: PortalPipelineCard[];
  media: PortalAsset[];
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
    .select('name, langs, logo_asset_id, contact')
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
    .select('id, title, type, status, scheduled_at, card_contents(*)')
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

  const { data: messages } = await admin
    .from('client_messages')
    .select('id, sender, body, created_at, read_by_client')
    .eq('client_id', link.client_id)
    .order('created_at', { ascending: false })
    .limit(50);
  const unreadMessages = (messages ?? []).filter(
    (m) => m.sender === 'team' && !m.read_by_client,
  ).length;

  const { data: media } = await admin
    .from('assets')
    .select('id, kind, original_name, r2_key, variants, source, created_at')
    .eq('client_id', link.client_id)
    .in('source', ['client', 'render'])
    .order('created_at', { ascending: false })
    .limit(24);

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
    contact: parseClientContact(client.contact),
    messages: (messages ?? [])
      .slice()
      .reverse()
      .map((m) => ({
        id: m.id,
        sender: m.sender,
        body: m.body,
        createdAt: m.created_at,
      })),
    unreadMessages,
    pipeline: (cards ?? [])
      .filter((c) => c.status !== 'archived')
      .map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        status: c.status,
        scheduledAt: c.scheduled_at,
      })),
    media: (media ?? []).map((m) => toPortalAsset(m)),
  };
}

function toPortalAsset(row: {
  id: string;
  kind: Database['public']['Enums']['asset_kind'];
  original_name: string;
  r2_key: string;
  variants: unknown;
  source: Database['public']['Enums']['asset_source'];
  created_at: string;
}): PortalAsset {
  const variants = parseAssetVariants(row.variants);
  return {
    id: row.id,
    kind: row.kind,
    name: row.original_name,
    source: row.source,
    createdAt: row.created_at,
    thumbUrl: variants.thumb ? publicAssetUrl(variants.thumb) : null,
    url: row.r2_key.startsWith('public/') ? publicAssetUrl(row.r2_key) : null,
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

// ---------- v3: client <-> team messages (migration 0009) ----------

const messageInputSchema = z.object({
  body: z.string().min(1).max(2000),
});

/** Portal "Mesajlar": insert a client message. The 0009 trigger logs it. */
export async function submitMessage(
  token: string,
  input: z.input<typeof messageInputSchema>,
): Promise<ActionResult> {
  const parsed = messageInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (await portalRateLimited()) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };

  const { error } = await admin.from('client_messages').insert({
    client_id: link.client_id,
    portal_link_id: link.id,
    sender: 'client',
    body: parsed.data.body,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Refresh the thread (polled while the tab is open — reads are not counted
 * against the mutation rate limit, like loadPortalView). Marks team messages
 * as read by the client.
 */
export async function fetchMessages(
  token: string,
): Promise<ActionResult<{ messages: PortalMessage[] }>> {
  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };

  const { data: rows, error } = await admin
    .from('client_messages')
    .select('id, sender, body, created_at')
    .eq('client_id', link.client_id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { ok: false, error: error.message };

  await admin
    .from('client_messages')
    .update({ read_by_client: true })
    .eq('client_id', link.client_id)
    .eq('sender', 'team')
    .eq('read_by_client', false);

  return {
    ok: true,
    data: {
      messages: (rows ?? [])
        .slice()
        .reverse()
        .map((m) => ({
          id: m.id,
          sender: m.sender,
          body: m.body,
          createdAt: m.created_at,
        })),
    },
  };
}

// ---------- v3: company info self-service ----------

/** Portal "Bilgiler": the client maintains their own contact card. */
export async function submitContact(
  token: string,
  input: z.input<typeof clientContactSchema>,
): Promise<ActionResult> {
  const parsed = clientContactSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (await portalRateLimited()) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };

  const { error } = await admin
    .from('clients')
    .update({ contact: parsed.data })
    .eq('id', link.client_id);
  if (error) return { ok: false, error: error.message };

  // No trigger on clients — log here (rule 2).
  await admin.from('activity_log').insert({
    actor: null,
    client_id: link.client_id,
    action: 'client.contact_updated',
    detail: { source: 'portal' },
  });
  return { ok: true };
}

// ---------- v3: client media upload (presign → PUT → complete) ----------

// SPEC §14 caps, mirrored from app/api/assets/*: 10 MB image, 200 MB video.
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 200 * 1024 * 1024;

const presignInputSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().regex(/^(image|video)\//),
  size: z.number().int().positive(),
});

export async function presignUpload(
  token: string,
  input: z.input<typeof presignInputSchema>,
): Promise<ActionResult<{ key: string; url: string }>> {
  const parsed = presignInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (await portalRateLimited()) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };

  if (!r2Ready()) return { ok: false, error: 'r2_not_configured' };
  const cap = parsed.data.contentType.startsWith('video/')
    ? MAX_VIDEO
    : MAX_IMAGE;
  if (parsed.data.size > cap) return { ok: false, error: 'too_large' };

  // Same key shape as the team presign route — the clientId comes from the
  // TOKEN, never from the caller.
  const ext =
    parsed.data.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') ||
    'bin';
  const key = `private/${link.client_id}/uploads/${randomUUID()}.${ext}`;
  const url = await presignPut(key, parsed.data.contentType, parsed.data.size);
  if (!url) return { ok: false, error: 'r2_not_configured' };
  return { ok: true, data: { key, url } };
}

const completeInputSchema = z.object({
  key: z.string().min(1),
  kind: z.enum(['image', 'video']),
  originalName: z.string().max(255).default(''),
  width: z.number().int().positive().nullish(),
  height: z.number().int().positive().nullish(),
  durationS: z.number().positive().nullish(),
});

export async function completeUpload(
  token: string,
  input: z.input<typeof completeInputSchema>,
): Promise<ActionResult<{ assetId: string }>> {
  const parsed = completeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (await portalRateLimited()) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };
  const b = parsed.data;

  // Key must be a presigned upload key for THIS link's client (same check as
  // app/api/assets/complete).
  const keyPattern = new RegExp(
    `^private/${link.client_id}/uploads/[0-9a-f-]+\\.[a-z0-9]+$`,
  );
  if (!keyPattern.test(b.key)) return { ok: false, error: 'invalid_key' };

  if (r2Ready()) {
    const head = await headObject(b.key);
    if (!head) return { ok: false, error: 'not_uploaded' };
    const ct = head.contentType ?? '';
    const actualKind = ct.startsWith('image/')
      ? 'image'
      : ct.startsWith('video/')
        ? 'video'
        : 'other';
    if (actualKind !== b.kind) return { ok: false, error: 'kind_mismatch' };
    const cap = actualKind === 'video' ? MAX_VIDEO : MAX_IMAGE;
    if (head.contentLength !== null && head.contentLength > cap)
      return { ok: false, error: 'too_large' };
  }

  const { data: asset, error } = await admin
    .from('assets')
    .insert({
      client_id: link.client_id,
      kind: b.kind,
      r2_key: b.key,
      original_name: b.originalName,
      width: b.width ?? null,
      height: b.height ?? null,
      duration_s: b.durationS ?? null,
      source: 'client',
      uploaded_by: null,
    })
    .select('id')
    .single();
  if (error || !asset) return { ok: false, error: error?.message ?? 'insert' };

  if (b.kind === 'image') {
    await admin.from('ai_jobs').insert({
      kind: 'image_variants',
      payload: { asset_id: asset.id },
      created_by: null,
    });
  }
  return { ok: true, data: { assetId: asset.id } };
}

// ---------- v3: AI edit requests (UPGRADE_SPEC §11a) ----------

const editRequestSchema = z.object({
  kind: z.enum(['edit_video', 'edit_photo']),
  assetIds: z.array(z.uuid()).min(1).max(4),
  prompt: z.string().min(1).max(1000),
});

/** Portal "Editle": queue an edit_video / edit_photo job on own assets. */
export async function submitEditRequest(
  token: string,
  input: z.input<typeof editRequestSchema>,
): Promise<ActionResult<{ jobId: string }>> {
  const parsed = editRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (await portalRateLimited()) return { ok: false, error: 'rate_limited' };

  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };
  const { kind, assetIds, prompt } = parsed.data;

  const wantKind = kind === 'edit_video' ? 'video' : 'image';
  if (kind === 'edit_photo' && assetIds.length !== 1)
    return { ok: false, error: 'validation' };

  // Every referenced asset must belong to this link's client and match the
  // edit kind (the worker re-checks — this is the friendly-error layer).
  const { data: owned } = await admin
    .from('assets')
    .select('id, kind')
    .in('id', assetIds)
    .eq('client_id', link.client_id);
  const byId = new Map((owned ?? []).map((a) => [a.id, a.kind]));
  for (const id of assetIds) {
    if (byId.get(id) !== wantKind)
      return { ok: false, error: 'assetNotFound' };
  }

  const payload =
    kind === 'edit_video'
      ? { client_id: link.client_id, asset_ids: assetIds, prompt }
      : { client_id: link.client_id, asset_id: assetIds[0], prompt };
  const { data: job, error } = await admin
    .from('ai_jobs')
    .insert({ kind, payload, created_by: null })
    .select('id')
    .single();
  if (error || !job) return { ok: false, error: error?.message ?? 'insert' };

  // ai_jobs inserts don't log — record the client-originated request (rule 2).
  await admin.from('activity_log').insert({
    actor: null,
    client_id: link.client_id,
    action: 'edit.requested',
    detail: { kind, prompt: prompt.slice(0, 120), source: 'portal' },
  });
  return { ok: true, data: { jobId: job.id } };
}

export interface PortalEditJobState {
  status: 'pending' | 'done' | 'error';
  note: string;
  resultUrl: string | null;
  resultKind: 'image' | 'video' | null;
}

/** Poll an edit job's state (token-scoped — only this client's jobs). */
export async function fetchEditJob(
  token: string,
  jobId: string,
): Promise<ActionResult<PortalEditJobState>> {
  if (!z.uuid().safeParse(jobId).success)
    return { ok: false, error: 'validation' };
  const admin = createSupabaseAdmin();
  const link = await loadActiveLink(admin, token);
  if (!link) return { ok: false, error: 'expired' };

  const { data: job } = await admin
    .from('ai_jobs')
    .select('id, kind, status, payload, result')
    .eq('id', jobId)
    .in('kind', ['edit_video', 'edit_photo'])
    .single();
  const payload = (job?.payload ?? {}) as { client_id?: string };
  if (!job || payload.client_id !== link.client_id)
    return { ok: false, error: 'expired' };

  if (job.status === 'error')
    return {
      ok: true,
      data: { status: 'error', note: '', resultUrl: null, resultKind: null },
    };
  if (job.status !== 'done')
    return {
      ok: true,
      data: { status: 'pending', note: '', resultUrl: null, resultKind: null },
    };

  const result = (job.result ?? {}) as { asset_id?: string; note?: string };
  let resultUrl: string | null = null;
  let resultKind: 'image' | 'video' | null = null;
  if (result.asset_id) {
    const { data: asset } = await admin
      .from('assets')
      .select('r2_key, kind, client_id')
      .eq('id', result.asset_id)
      .single();
    if (asset && asset.client_id === link.client_id) {
      resultKind = asset.kind === 'video' ? 'video' : 'image';
      resultUrl = asset.r2_key.startsWith('public/')
        ? publicAssetUrl(asset.r2_key)
        : null;
    }
  }
  return {
    ok: true,
    data: { status: 'done', note: result.note ?? '', resultUrl, resultKind },
  };
}
