/**
 * Publish a scheduled card via Postiz (SPEC §8). Enqueued as a `publish`
 * ai_job by the dispatcher cron. Re-verifies status server-side (CLAUDE.md
 * rule 1: nothing publishes without having reached approved→scheduled), builds
 * a per-platform payload (v1: TR caption + hashtags appended, media = public
 * R2 URLs), calls Postiz, and on success flips the card to `published` with
 * the Postiz post ids in activity_log.detail.
 *
 * If Postiz is not configured yet (Meta app review pending — SETUP.md Part C),
 * the job notifies managers to post manually and advances the card with
 * detail.manual=true, so the pipeline still saves the team time.
 */

import type { AiJob } from '../../../lib/db/types';
import { workerEnv } from '../env';
import { db, logActivity } from '../supabase';
import { publicUrl } from '../r2';
import { notifyManagers } from './../telegram';
import { log } from '../log';

function postizConfigured(): boolean {
  const env = workerEnv();
  return Boolean(env.POSTIZ_URL && env.POSTIZ_API_KEY);
}

interface PostizResult {
  id: string;
  platform: string;
}

async function postizCreatePost(
  integrationId: string,
  content: string,
  mediaUrls: string[],
): Promise<PostizResult> {
  const env = workerEnv();
  const res = await fetch(`${env.POSTIZ_URL}/public/v1/posts`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: env.POSTIZ_API_KEY!,
    },
    body: JSON.stringify({
      type: 'now',
      posts: [
        {
          integration: { id: integrationId },
          value: [{ content, image: mediaUrls.map((url) => ({ url })) }],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Postiz ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id?: string; postId?: string };
  return { id: json.id ?? json.postId ?? 'unknown', platform: integrationId };
}

export async function handlePublish(job: AiJob) {
  const { card_id } = job.payload as { card_id: string };

  const { data: card, error } = await db()
    .from('cards')
    .select('id, status, client_id, platforms')
    .eq('id', card_id)
    .single();
  if (error || !card) throw new Error(`card ${card_id} not found`);

  // Server-side gate — never publish anything not in `scheduled`.
  if (card.status !== 'scheduled') {
    log.warn(
      { card_id, status: card.status },
      'publish skipped: not scheduled',
    );
    return { skipped: true, reason: 'not_scheduled' };
  }

  // TR content is the v1 publish source.
  const { data: content } = await db()
    .from('card_contents')
    .select('caption, hashtags, media_asset_ids')
    .eq('card_id', card_id)
    .eq('lang', 'tr')
    .single();
  const caption = content?.caption ?? '';
  const hashtags = (content?.hashtags ?? []).map((h) =>
    h.startsWith('#') ? h : `#${h}`,
  );
  const body = [caption, hashtags.join(' ')].filter(Boolean).join('\n\n');

  // Public media URLs from the portrait variant (fallback to original key).
  const mediaUrls: string[] = [];
  if (content?.media_asset_ids?.length) {
    const { data: media } = await db()
      .from('assets')
      .select('r2_key, variants')
      .in('id', content.media_asset_ids);
    for (const m of media ?? []) {
      const v = (m.variants ?? {}) as { portrait?: string };
      mediaUrls.push(publicUrl(v.portrait ?? m.r2_key));
    }
  }

  if (!postizConfigured()) {
    await logActivity('publish.manual_needed', {
      clientId: card.client_id,
      cardId: card_id,
      detail: { platforms: card.platforms },
    });
    await notifyManagers(
      `📣 Yayına hazır (manuel): kart ${card_id} — Postiz bağlı değil, elle paylaşın.`,
    ).catch(() => {});
    await db().from('cards').update({ status: 'published' }).eq('id', card_id);
    await logActivity('publish.success', {
      clientId: card.client_id,
      cardId: card_id,
      detail: { manual: true },
    });
    return { manual: true };
  }

  // Map each platform to its Postiz integration id.
  const { data: accounts } = await db()
    .from('client_social_accounts')
    .select('platform, postiz_integration_id')
    .eq('client_id', card.client_id)
    .in('platform', card.platforms);

  const results: PostizResult[] = [];
  for (const acc of accounts ?? []) {
    if (!acc.postiz_integration_id) continue;
    results.push(
      await postizCreatePost(acc.postiz_integration_id, body, mediaUrls),
    );
  }

  await db().from('cards').update({ status: 'published' }).eq('id', card_id);
  await logActivity('publish.success', {
    clientId: card.client_id,
    cardId: card_id,
    detail: { posts: results },
  });
  return { posts: results };
}
