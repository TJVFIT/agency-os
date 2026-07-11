import 'server-only';

import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { parseAssetVariants } from '@/lib/db/domain';
import { publicAssetUrl } from '@/lib/r2-url';
import { istanbulToUtc } from '@/lib/dates';
import type { CardContent } from '@/lib/db/types';

/**
 * Service-role data access for the public approval page (SPEC §10). The anon
 * key never touches these tables — token validity is checked here and only
 * that client's pending cards are returned.
 */

export interface ApprovalCard {
  id: string;
  title: string;
  type: string;
  contents: Record<
    string,
    { caption: string; hashtags: string[]; media: string[] }
  >;
}

export interface ApprovalView {
  linkId: string;
  clientName: string;
  logoUrl: string | null;
  weekStart: string;
  langs: string[];
  cards: ApprovalCard[];
}

/** Cards awaiting approval = translated, or visual_ready for single-lang. */
function awaitingApproval(status: string, langs: string[]): boolean {
  return (
    status === 'translated' || (status === 'visual_ready' && langs.length === 1)
  );
}

/**
 * A weekly approval link only governs the cards belonging to its own week
 * (SPEC §10 — a week link is not a client-wide approval channel). A card counts
 * as "this week's" when its scheduled_at (else due_at) falls in
 * [weekStart, weekStart+7d); with neither date set we fall back to created_at.
 * The durable portal link (lib/portal/service.ts) deliberately covers all weeks.
 */
function inWeek(
  card: {
    scheduled_at: string | null;
    due_at: string | null;
    created_at: string;
  },
  weekStartMs: number,
  weekEndMs: number,
): boolean {
  const ref = card.scheduled_at ?? card.due_at ?? card.created_at;
  if (!ref) return false;
  const t = new Date(ref).getTime();
  return t >= weekStartMs && t < weekEndMs;
}

export async function loadApprovalView(
  token: string,
): Promise<ApprovalView | null> {
  const admin = createSupabaseAdmin();
  const { data: link } = await admin
    .from('approval_links')
    .select('id, client_id, week_start, expires_at')
    .eq('token', token)
    .single();
  if (!link) return null;
  if (new Date(link.expires_at) < new Date()) return null;

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
    .select(
      'id, title, type, status, scheduled_at, due_at, created_at, card_contents(*)',
    )
    .eq('client_id', link.client_id)
    .order('created_at');

  // Scope to the link's week. Turkey is UTC+3 year-round (no DST), so a plain
  // 7×24h window off the Istanbul-midnight week start is exact.
  const weekStartMs = istanbulToUtc(`${link.week_start}T00:00:00`).getTime();
  const weekEndMs = weekStartMs + 7 * 24 * 60 * 60 * 1000;

  const pending = (cards ?? []).filter(
    (c) =>
      awaitingApproval(c.status, client.langs) &&
      inWeek(c, weekStartMs, weekEndMs),
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

  return {
    linkId: link.id,
    clientName: client.name,
    logoUrl,
    weekStart: link.week_start,
    langs: client.langs,
    cards: approvalCards,
  };
}
