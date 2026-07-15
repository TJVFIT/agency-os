/**
 * Shared pre-publish gates used by BOTH the dispatcher (cron.ts) and the
 * publish handler (publish.ts). Keeping them in one module closes the audit's
 * "gate exists only in the dispatcher" hole (UPGRADE_SPEC §5 / CLAUDE.md rule 1
 * — re-verify server-side before send).
 */

import { checkCompliance, type ComplianceIssue } from '../../lib/compliance';
import { parseBrandProfile } from '../../lib/db/domain';
import { db } from './supabase';

/**
 * Run the pure compliance engine over a card's TR content for each platform.
 * `scheduledAt` is null on purpose: due cards are past their scheduled_at by
 * definition. Issues identical across platforms are de-duplicated.
 */
export async function checkCardCompliance(
  cardId: string,
  clientId: string,
  platforms: string[],
): Promise<{ ok: boolean; issues: ComplianceIssue[] }> {
  const [{ data: client }, { data: content }] = await Promise.all([
    db().from('clients').select('brand_profile').eq('id', clientId).single(),
    db()
      .from('card_contents')
      .select('caption, hashtags, media_asset_ids')
      .eq('card_id', cardId)
      .eq('lang', 'tr')
      .maybeSingle(),
  ]);
  const bannedWords = parseBrandProfile(client?.brand_profile).banned_words;

  const seen = new Set<string>();
  const issues: ComplianceIssue[] = [];
  for (const platform of platforms.length ? platforms : ['instagram']) {
    const result = checkCompliance({
      caption: content?.caption ?? '',
      hashtags: content?.hashtags ?? [],
      mediaCount: content?.media_asset_ids?.length ?? 0,
      platform,
      bannedWords,
      scheduledAt: null,
      now: new Date(),
    });
    for (const issue of result.issues) {
      const key = `${issue.code}:${issue.detail}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push(issue);
    }
  }
  return { ok: issues.length === 0, issues };
}

/**
 * Rule 1 (content integrity): a card may publish only if its CURRENT content is
 * the content that was approved. Approvals and content edits are both recorded
 * in activity_log (`card.status_changed`→approved and `content.updated`), so if
 * the latest content edit is newer than the latest approval, the approval is
 * stale and the card must be re-approved before it can go live. This closes the
 * "edit an approved+scheduled card's caption and the unapproved text publishes"
 * hole found by the v2 audit — without a schema change.
 *
 * `approvedAt === null` means the card was never approved (the caller's
 * approval gate reports `no_approval`); `stale === true` with a non-null
 * approvedAt means it was approved but edited afterwards.
 */
export async function approvalIsStale(cardId: string): Promise<{
  stale: boolean;
  approvedAt: string | null;
  lastEditAt: string | null;
}> {
  const [approvalRes, editRes] = await Promise.all([
    db()
      .from('activity_log')
      .select('created_at')
      .eq('card_id', cardId)
      .eq('action', 'card.status_changed')
      .contains('detail', { to: 'approved' })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db()
      .from('activity_log')
      .select('created_at')
      .eq('card_id', cardId)
      .eq('action', 'content.updated')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const approvedAt = approvalRes.data?.created_at ?? null;
  const lastEditAt = editRes.data?.created_at ?? null;
  if (!approvedAt) return { stale: true, approvedAt, lastEditAt };
  const stale =
    lastEditAt !== null &&
    new Date(lastEditAt).getTime() > new Date(approvedAt).getTime();
  return { stale, approvedAt, lastEditAt };
}
