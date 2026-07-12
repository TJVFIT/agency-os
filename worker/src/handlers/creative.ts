/**
 * Creative AI job handlers (UPGRADE_SPEC §4): idea_refine, scenario, poster,
 * compliance. Same regime as handlers/ai.ts — load context via the service
 * role, run the provider chain (JSON + zod), apply side effects, return the
 * value stored in ai_jobs.result. The queue loop owns retry/backoff.
 */

import { randomUUID } from 'node:crypto';

import {
  buildIdeaRefinePrompt,
  buildPosterImagePrompt,
  buildScenarioPrompt,
} from '../../../lib/ai/jobs';
import { buildChain } from '../../../lib/ai/providers';
import { runChain, type RouterOutput } from '../../../lib/ai/router';
import type { ScenarioResult } from '../../../lib/ai/schemas';
import { checkCompliance, type ComplianceIssue } from '../../../lib/compliance';
import type { AiJob, Json } from '../../../lib/db/types';
import { providerConfig } from '../ai-config';
import { workerEnv } from '../env';
import { putObject, r2Configured } from '../r2';
import { db, logActivity } from '../supabase';
import { log } from '../log';

type Meta = RouterOutput<unknown>['_meta'];

function withMeta(result: object, meta: Meta) {
  return { ...result, _meta: meta };
}

function brandJson(client: { brand_profile: unknown }): string {
  return JSON.stringify(client.brand_profile ?? {});
}

async function loadCardClient(cardId: string) {
  const { data, error } = await db()
    .from('cards')
    .select('id, client_id, type, title, platforms, scheduled_at, clients(*)')
    .eq('id', cardId)
    .single();
  if (error || !data) throw new Error(`card ${cardId} not found`);
  return data;
}

const ROUTER_DEPS = {
  timeoutMs: 30_000,
  log: (l: Record<string, unknown>) => log.debug(l, 'ai'),
};

/** idea_refine — payload {idea_id}: summarize a raw portal idea into an
 * internal brief, stored on client_ideas.refined (status → 'refined'). */
export async function handleIdeaRefine(job: AiJob) {
  const payload = job.payload as { idea_id: string };
  const { data: idea, error } = await db()
    .from('client_ideas')
    .select('id, client_id, title, body, clients(brand_profile)')
    .eq('id', payload.idea_id)
    .single();
  if (error || !idea) throw new Error(`idea ${payload.idea_id} not found`);
  const client = idea.clients as { brand_profile: unknown };

  const prompt = buildIdeaRefinePrompt(brandJson(client), {
    title: idea.title,
    body: idea.body,
  });

  const out = await runChain(
    buildChain(prompt.chainKind, providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    ROUTER_DEPS,
  );

  // Only refine ideas still in 'new'. Guarding on status='new' stops a late
  // refine job from regressing an idea a manager has since accepted/rejected
  // back to 'refined'. Log only when a row actually flipped.
  const { data: refinedRows } = await db()
    .from('client_ideas')
    .update({ refined: out.data as unknown as Json, status: 'refined' })
    .eq('id', idea.id)
    .eq('status', 'new')
    .select('id');

  if (refinedRows?.length) {
    await logActivity('ai.idea_refined', {
      clientId: idea.client_id,
      detail: {
        idea_id: idea.id,
        provider: out._meta.provider,
        suggested_type: out.data.suggested_type,
      },
    });
  }
  return withMeta(out.data, out._meta);
}

/** The scenario lands in the card discussion as a system comment (author
 * null) so the crew sees it where they already work. */
function formatScenarioComment(d: ScenarioResult): string {
  const shots = d.shot_list.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const sections = [
    `Senaryo:\n${d.scenario}`,
    shots ? `Çekim listesi:\n${shots}` : '',
    d.copy_brief ? `Metin brifi:\n${d.copy_brief}` : '',
    d.needs_shoot ? 'Yeni çekim gerekiyor.' : '',
  ];
  return sections.filter(Boolean).join('\n\n');
}

/** scenario — payload {card_id, brief}: scenario + shot list + copy brief.
 * Result goes to ai_jobs.result; the scenario is also posted as a card
 * comment, and needs_shoot opens a post_shoot suggestion (UPGRADE_SPEC §9). */
export async function handleScenario(job: AiJob) {
  const payload = job.payload as { card_id: string; brief?: string };
  const card = await loadCardClient(payload.card_id);
  const client = card.clients as { brand_profile: unknown };

  const prompt = buildScenarioPrompt(brandJson(client), {
    brief: payload.brief ?? '',
    type: card.type,
  });

  const out = await runChain(
    buildChain(prompt.chainKind, providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    ROUTER_DEPS,
  );

  await db()
    .from('comments')
    .insert({
      card_id: card.id,
      author: null,
      body: formatScenarioComment(out.data),
    });

  if (out.data.needs_shoot) {
    // Dedupe on card_id so a queue retry after a partial failure (or a second
    // scenario run) doesn't stack duplicate shoot_needed suggestions, and log
    // suggestion.created like every other suggestion path (hard rule 2 — the
    // 0006 trigger only logs suggestion *updates*).
    const { data: existing } = await db()
      .from('suggestions')
      .select('id')
      .eq('status', 'pending')
      .eq('domain', 'post_shoot')
      .eq('card_id', card.id)
      .limit(1);
    if (!existing?.length) {
      const { data: created } = await db()
        .from('suggestions')
        .insert({
          domain: 'post_shoot',
          title: card.title,
          body: {
            kind: 'shoot_needed',
            card_id: card.id,
            client_id: card.client_id,
          } as Json,
          client_id: card.client_id,
          card_id: card.id,
        })
        .select('id')
        .single();
      await logActivity('suggestion.created', {
        clientId: card.client_id,
        cardId: card.id,
        detail: {
          suggestion_id: created?.id,
          domain: 'post_shoot',
          title: card.title,
        },
      }).catch(() => {});
    }
  }

  await logActivity('ai.scenario_done', {
    clientId: card.client_id,
    cardId: card.id,
    detail: {
      provider: out._meta.provider,
      needs_shoot: out.data.needs_shoot,
      suggested_platforms: out.data.suggested_platforms,
    },
  });
  return withMeta(out.data, out._meta);
}

/** compliance — payload {card_id}: deterministic checkCompliance over the
 * card's TR content for each card platform. No LLM call; activity only on
 * failure (uses the existing publish.blocked feed template). */
export async function handleCompliance(job: AiJob) {
  const payload = job.payload as { card_id: string };
  const card = await loadCardClient(payload.card_id);
  const client = card.clients as { brand_profile: unknown };
  const brand = (client.brand_profile ?? {}) as Record<string, unknown>;
  const bannedWords = (brand.banned_words as string[]) ?? [];

  const { data: content } = await db()
    .from('card_contents')
    .select('caption, hashtags, media_asset_ids')
    .eq('card_id', card.id)
    .eq('lang', 'tr')
    .maybeSingle();

  const now = new Date();
  const issues: Array<ComplianceIssue & { platform: string }> = [];
  for (const platform of card.platforms) {
    const res = checkCompliance({
      caption: content?.caption ?? '',
      hashtags: content?.hashtags ?? [],
      mediaCount: content?.media_asset_ids?.length ?? 0,
      platform,
      bannedWords,
      scheduledAt: card.scheduled_at ? new Date(card.scheduled_at) : null,
      now,
    });
    for (const issue of res.issues) issues.push({ ...issue, platform });
  }

  const ok = issues.length === 0;
  if (!ok) {
    await logActivity('publish.blocked', {
      clientId: card.client_id,
      cardId: card.id,
      detail: {
        source: 'compliance_job',
        issues: issues
          .map(
            (i) =>
              `${i.code} (${i.platform}${i.detail ? `: ${i.detail}` : ''})`,
          )
          .join(', '),
        codes: issues.map((i) => i.code),
      },
    });
  }
  return { ok, issues };
}

// ---------------------------------------------------------------------------
// poster — image generation (UPGRADE_SPEC §4): Gemini image first, Higgsfield
// (ported from ai-workforce skills/higgsfield.py) as optional second provider.
// ---------------------------------------------------------------------------

const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

async function geminiPosterImage(
  apiKey: string,
  prompt: string,
): Promise<Buffer> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`gemini-image ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>;
      };
    }>;
  };
  const part = json.candidates?.[0]?.content?.parts?.find((p) =>
    p.inlineData?.mimeType?.startsWith('image/'),
  );
  if (!part?.inlineData?.data)
    throw new Error('gemini-image: no image in response');
  return Buffer.from(part.inlineData.data, 'base64');
}

// Higgsfield live-integration reality (see higgsfield.py): auth is
// `Authorization: Key {key}:{secret}`, submit is POST {base}/{model} which
// returns {request_id}; poll GET {base}/requests/{id}/status until terminal
// and read images[0].url.
const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';
const HIGGSFIELD_IMAGE_MODEL = 'higgsfield-ai/soul/standard';
const HIGGSFIELD_TERMINAL = new Set([
  'completed',
  'failed',
  'nsfw',
  'cancelled',
]);
const HIGGSFIELD_POLL_MS = 2000;
const HIGGSFIELD_TIMEOUT_MS = 180_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function higgsfieldPosterImage(
  apiKey: string,
  apiSecret: string,
  prompt: string,
): Promise<Buffer> {
  const auth = { authorization: `Key ${apiKey}:${apiSecret}` };

  const submitRes = await fetch(
    `${HIGGSFIELD_BASE}/${HIGGSFIELD_IMAGE_MODEL}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...auth },
      body: JSON.stringify({
        prompt,
        aspect_ratio: '1:1',
        resolution: '1080p',
      }),
    },
  );
  if (!submitRes.ok) {
    const body = await submitRes.text().catch(() => '');
    throw new Error(
      `higgsfield submit ${submitRes.status}: ${body.slice(0, 200)}`,
    );
  }
  const submitted = (await submitRes.json()) as { request_id?: string };
  if (!submitted.request_id)
    throw new Error('higgsfield: submit returned no request_id');

  const statusUrl = `${HIGGSFIELD_BASE}/requests/${submitted.request_id}/status`;
  const deadline = Date.now() + HIGGSFIELD_TIMEOUT_MS;
  let final: { status?: string; images?: Array<{ url?: string }> } = {};
  for (;;) {
    const pollRes = await fetch(statusUrl, { headers: auth });
    if (!pollRes.ok) throw new Error(`higgsfield poll ${pollRes.status}`);
    final = (await pollRes.json()) as typeof final;
    if (HIGGSFIELD_TERMINAL.has(final.status ?? '')) break;
    if (Date.now() >= deadline)
      throw new Error(
        `higgsfield: still ${final.status || 'pending'} after ${HIGGSFIELD_TIMEOUT_MS / 1000}s`,
      );
    await sleep(HIGGSFIELD_POLL_MS);
  }
  if (final.status !== 'completed')
    throw new Error(`higgsfield: generation ${final.status || 'unknown'}`);

  const imageUrl = final.images?.[0]?.url;
  if (!imageUrl) throw new Error('higgsfield: completed without image url');
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) throw new Error(`higgsfield image fetch ${imgRes.status}`);
  return Buffer.from(await imgRes.arrayBuffer());
}

/** poster — payload {card_id, brief}: generate a poster PNG, upload to R2
 * under public/{clientId}/posters/, register an assets row (source 'ai') and
 * attach it to the card's TR content. Throws when no provider is configured
 * so the queue's backoff/alerting applies. */
export async function handlePoster(job: AiJob) {
  const payload = job.payload as { card_id: string; brief?: string };
  if (!r2Configured()) throw new Error('R2 not configured');

  const card = await loadCardClient(payload.card_id);
  const client = card.clients as { brand_profile: unknown };
  const prompt = buildPosterImagePrompt(brandJson(client), payload.brief ?? '');

  const env = workerEnv();
  const providers: Array<{ id: string; generate: () => Promise<Buffer> }> = [];
  const geminiKey = env.GEMINI_KEY_A;
  if (geminiKey) {
    providers.push({
      id: 'gemini-image',
      generate: () => geminiPosterImage(geminiKey, prompt),
    });
  }
  const hfKey = env.HIGGSFIELD_API_KEY;
  const hfSecret = env.HIGGSFIELD_API_SECRET;
  if (hfKey && hfSecret) {
    providers.push({
      id: 'higgsfield',
      generate: () => higgsfieldPosterImage(hfKey, hfSecret, prompt),
    });
  }
  if (providers.length === 0)
    throw new Error(
      'no poster provider configured (set GEMINI_KEY_A or HIGGSFIELD_API_KEY + HIGGSFIELD_API_SECRET)',
    );

  let png: Buffer | undefined;
  let providerId = '';
  const errors: string[] = [];
  for (const provider of providers) {
    try {
      png = await provider.generate();
      providerId = provider.id;
      break;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.id}: ${message}`);
      log.warn(
        { jobId: job.id, provider: provider.id, err: message },
        'poster provider failed',
      );
    }
  }
  if (!png)
    throw new Error(`all poster providers failed — ${errors.join(' | ')}`);

  const key = `public/${card.client_id}/posters/${randomUUID()}.png`;
  await putObject(key, png, 'image/png');

  const { data: asset, error: assetError } = await db()
    .from('assets')
    .insert({
      client_id: card.client_id,
      kind: 'image',
      r2_key: key,
      original_name: `poster-${card.title}`.slice(0, 120),
      source: 'ai',
    })
    .select('id')
    .single();
  if (assetError || !asset)
    throw new Error(`asset insert failed: ${assetError?.message}`);

  // Attach to the TR content; creates the row when the card has none yet
  // (fresh insert gets the schema defaults for caption/hashtags).
  const { data: content } = await db()
    .from('card_contents')
    .select('media_asset_ids')
    .eq('card_id', card.id)
    .eq('lang', 'tr')
    .maybeSingle();
  await db()
    .from('card_contents')
    .upsert(
      {
        card_id: card.id,
        lang: 'tr',
        media_asset_ids: [...(content?.media_asset_ids ?? []), asset.id],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'card_id,lang' },
    );

  await logActivity('ai.poster_done', {
    clientId: card.client_id,
    cardId: card.id,
    detail: { provider: providerId, asset_id: asset.id, r2_key: key },
  });
  return { asset_id: asset.id, r2_key: key, provider: providerId };
}
