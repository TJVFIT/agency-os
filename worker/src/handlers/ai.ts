/**
 * AI job handlers (SPEC §6). Each reads context via the service role, runs the
 * provider chain, applies side effects, and returns the result JSON stored in
 * ai_jobs.result. The queue loop wraps these with retry/backoff + activity log.
 */

import {
  buildCaptionPrompt,
  buildPlannerPrompt,
  buildReplyPrompt,
  buildReportPrompt,
  buildTranslatePrompt,
  PLATFORM_MAX_CHARS,
} from '../../../lib/ai/jobs';
import { buildChain } from '../../../lib/ai/providers';
import { runChain, type RouterOutput } from '../../../lib/ai/router';
import type { AiJob, Json } from '../../../lib/db/types';
import { providerConfig } from '../ai-config';
import { db, logActivity } from '../supabase';
import { log } from '../log';

async function loadCardClient(cardId: string) {
  const { data, error } = await db()
    .from('cards')
    .select('id, client_id, platforms, clients(*)')
    .eq('id', cardId)
    .single();
  if (error || !data) throw new Error(`card ${cardId} not found`);
  return data;
}

function brandJson(client: { brand_profile: unknown }): string {
  return JSON.stringify(client.brand_profile ?? {});
}

type Meta = RouterOutput<unknown>['_meta'];

function withMeta(result: object, meta: Meta) {
  return { ...result, _meta: meta };
}

export async function handleCaption(job: AiJob) {
  const payload = job.payload as {
    card_id: string;
    brief: string;
    platform: string;
  };
  const card = await loadCardClient(payload.card_id);
  const client = card.clients as {
    brand_profile: Record<string, unknown>;
    hashtag_bank: string[];
  };
  const brand = (client.brand_profile ?? {}) as Record<string, unknown>;

  const prompt = buildCaptionPrompt(
    {
      brandProfileJson: brandJson(client),
      hashtagBank: client.hashtag_bank ?? [],
      bannedWords: (brand.banned_words as string[]) ?? [],
    },
    {
      platform: payload.platform,
      brief: payload.brief,
      maxChars: PLATFORM_MAX_CHARS[payload.platform] ?? 2200,
    },
  );

  const out = await runChain(
    buildChain(prompt.chainKind, providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    { timeoutMs: 30_000, log: (l) => log.debug(l, 'ai') },
  );

  await logActivity('ai.caption_done', {
    clientId: card.client_id,
    cardId: card.id,
    detail: {
      provider: out._meta.provider,
      variants: out.data.variants.length,
    },
  });
  return withMeta(out.data, out._meta);
}

export async function handleTranslate(job: AiJob) {
  const payload = job.payload as {
    card_id: string;
    src: 'tr' | 'en';
    tgt: 'tr' | 'en';
  };
  const card = await loadCardClient(payload.card_id);
  const client = card.clients as { glossary: unknown };

  // Read the source-language content to translate.
  const { data: srcContent } = await db()
    .from('card_contents')
    .select('caption, hashtags')
    .eq('card_id', payload.card_id)
    .eq('lang', payload.src)
    .single();
  if (!srcContent?.caption) throw new Error('no source caption to translate');

  const prompt = buildTranslatePrompt(JSON.stringify(client.glossary ?? []), {
    src: payload.src,
    tgt: payload.tgt,
    text: srcContent.caption,
  });

  const out = await runChain(
    buildChain(prompt.chainKind, providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    { timeoutMs: 30_000, log: (l) => log.debug(l, 'ai') },
  );

  // Write the target-language content (hashtags copied from source; the
  // prompt keeps brand tags untouched — human refines in the workroom).
  await db()
    .from('card_contents')
    .upsert(
      {
        card_id: payload.card_id,
        lang: payload.tgt,
        caption: out.data.translation,
        hashtags: srcContent.hashtags ?? [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'card_id,lang' },
    );

  await logActivity('ai.translate_done', {
    clientId: card.client_id,
    cardId: card.id,
    detail: { provider: out._meta.provider, notes: out.data.notes },
  });
  return withMeta(out.data, out._meta);
}

export async function handleReply(job: AiJob) {
  const payload = job.payload as {
    card_id: string;
    message: string;
    context: string;
  };
  const card = await loadCardClient(payload.card_id);
  const client = card.clients as { brand_profile: Record<string, unknown> };

  const prompt = buildReplyPrompt(brandJson(client), {
    message: payload.message,
    context: payload.context ?? '',
  });

  const out = await runChain(
    buildChain(prompt.chainKind, providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    { timeoutMs: 30_000, log: (l) => log.debug(l, 'ai') },
  );

  await logActivity('ai.reply_done', {
    clientId: card.client_id,
    cardId: card.id,
    detail: { provider: out._meta.provider, escalate: out.data.escalate },
  });
  return withMeta(out.data, out._meta);
}

export async function handlePlan(job: AiJob) {
  const payload = job.payload as { client_id: string; week_start: string };
  const { data: client, error } = await db()
    .from('clients')
    .select('*')
    .eq('id', payload.client_id)
    .single();
  if (error || !client) throw new Error('client not found');

  const prompt = buildPlannerPrompt(
    JSON.stringify(client.brand_profile ?? {}),
    {
      langs: client.langs,
      platforms: [],
      topPostsJson: '[]',
      weekStart: payload.week_start,
    },
  );

  const out = await runChain(
    buildChain(prompt.chainKind, providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    { timeoutMs: 30_000, log: (l) => log.debug(l, 'ai') },
  );

  // Create 5 idea cards tagged ai-planned (cron dedupes; see cron.ts).
  const rows = out.data.ideas.map((idea) => ({
    client_id: payload.client_id,
    title: idea.title,
    type: idea.type,
    status: 'idea' as const,
    tags: ['ai-planned'],
  }));
  await db().from('cards').insert(rows);

  await logActivity('ai.plan_done', {
    clientId: payload.client_id,
    detail: { provider: out._meta.provider, count: rows.length },
  });
  return withMeta(out.data, out._meta);
}

export async function handleReport(job: AiJob) {
  const payload = job.payload as {
    client_id: string;
    week_start: string;
    metrics?: Record<string, unknown>;
  };
  const prompt = buildReportPrompt(JSON.stringify(payload.metrics ?? {}));

  const out = await runChain(
    buildChain(prompt.chainKind, providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    { timeoutMs: 30_000, log: (l) => log.debug(l, 'ai') },
  );

  await db()
    .from('reports')
    .upsert(
      {
        client_id: payload.client_id,
        week_start: payload.week_start,
        body_md: out.data.body_md,
        metrics: (payload.metrics ?? {}) as Json,
      },
      { onConflict: 'client_id,week_start' },
    );

  await logActivity('ai.report_done', {
    clientId: payload.client_id,
    detail: { provider: out._meta.provider },
  });
  return withMeta(out.data, out._meta);
}
