/**
 * Reel pipeline (SPEC §7.2). ffprobe sanity → faster-whisper word timestamps
 * (Groq Whisper fallback) → ASS karaoke subtitles (worker/lib/ass.ts) →
 * single-pass FFmpeg 1080×1920 burn-in + logo → optional EN render → upload
 * to R2, attach to the card. Concurrency 1 (enforced by the sequential queue
 * loop); temp files cleaned in finally.
 *
 * Requires ffmpeg + python faster-whisper on the box (SETUP.md Part C). When
 * absent the job errors and retries — the pipeline is code-complete but only
 * runs where the binaries exist.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildAssSubtitles, type Word } from '../../lib/ass';
import { buildTranslatePrompt } from '../../../lib/ai/jobs';
import { buildChain } from '../../../lib/ai/providers';
import { runChain } from '../../../lib/ai/router';
import type { AiJob } from '../../../lib/db/types';
import { providerConfig } from '../ai-config';
import { run } from '../cli';
import { transcribe } from '../transcribe';
import { db, logActivity } from '../supabase';
import { getObject, putObject, r2Configured } from '../r2';
import { log } from '../log';

export interface Probe {
  durationS: number;
  hasAudio: boolean;
  width?: number;
  height?: number;
}

export async function ffprobe(path: string): Promise<Probe> {
  const out = await run('ffprobe', [
    '-v',
    'quiet',
    '-print_format',
    'json',
    '-show_format',
    '-show_streams',
    path,
  ]);
  const json = JSON.parse(out) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  };
  const video = (json.streams ?? []).find((s) => s.codec_type === 'video');
  return {
    durationS: Number(json.format?.duration ?? 0),
    hasAudio: (json.streams ?? []).some((s) => s.codec_type === 'audio'),
    width: video?.width,
    height: video?.height,
  };
}

async function translateWords(
  words: Word[],
  glossaryJson: string,
): Promise<Word[]> {
  // Batch the segment text through the translate chain, keep timings.
  const text = words.map((w) => w.text).join(' ');
  const prompt = buildTranslatePrompt(glossaryJson, {
    src: 'tr',
    tgt: 'en',
    text,
  });
  const out = await runChain(
    buildChain('translate', providerConfig()),
    prompt.system,
    prompt.user,
    prompt.schema,
    { timeoutMs: 30_000 },
  );
  // Redistribute translated words across original timings proportionally.
  const translated = out.data.translation.split(/\s+/).filter(Boolean);
  const ratio = words.length / Math.max(1, translated.length);
  return translated.map((t, i) => {
    const src = words[Math.min(words.length - 1, Math.floor(i * ratio))];
    return { text: t, start: src.start, end: src.end };
  });
}

async function renderOne(
  srcPath: string,
  words: Word[],
  logoPath: string | null,
  primaryColor: string,
  dir: string,
  label: string,
): Promise<Buffer> {
  const assPath = join(dir, `subs-${label}.ass`);
  await writeFile(assPath, buildAssSubtitles(words, { primaryColor }));
  const outPath = join(dir, `out-${label}.mp4`);

  // Scale+crop to 1080×1920 (center-weighted), burn subtitles, overlay logo.
  const vf = [
    'scale=1080:1920:force_original_aspect_ratio=increase',
    'crop=1080:1920',
    `subtitles=${assPath.replace(/\\/g, '/').replace(/:/g, '\\:')}`,
  ];
  const args = ['-y', '-i', srcPath];
  if (logoPath) {
    args.push('-i', logoPath);
    // Logo top-right 5% width, then subtitles.
    args.push(
      '-filter_complex',
      `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];` +
        `[1:v]scale=54:-1[logo];[bg][logo]overlay=W-w-24:24[ov];` +
        `[ov]subtitles=${assPath.replace(/\\/g, '/').replace(/:/g, '\\:')}[v]`,
      '-map',
      '[v]',
      '-map',
      '0:a?',
    );
  } else {
    args.push('-vf', vf.join(','));
  }
  args.push(
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    outPath,
  );
  await run('ffmpeg', args);
  return readFile(outPath);
}

export async function handleRenderReel(job: AiJob) {
  if (!r2Configured()) throw new Error('R2 not configured');
  const { card_id, asset_id, langs } = job.payload as {
    card_id: string;
    asset_id: string;
    langs: string[];
  };

  const { data: asset, error } = await db()
    .from('assets')
    .select('*, clients(colors, glossary, logo_asset_id)')
    .eq('id', asset_id)
    .single();
  if (error || !asset) throw new Error(`asset ${asset_id} not found`);

  const client = asset.clients as {
    colors: { primary?: string } | null;
    glossary: unknown;
    logo_asset_id: string | null;
  };
  const primaryColor = client.colors?.primary ?? '#FFCC00';

  const dir = await mkdtemp(join(tmpdir(), 'reel-'));
  try {
    const srcPath = join(dir, 'src.mp4');
    await writeFile(srcPath, await getObject(asset.r2_key));

    const probe = await ffprobe(srcPath);
    if (probe.durationS > 180) throw new Error('video longer than 3 minutes');
    if (!probe.hasAudio) throw new Error('video has no audio track');

    // Logo (optional).
    let logoPath: string | null = null;
    if (client.logo_asset_id) {
      const { data: logo } = await db()
        .from('assets')
        .select('r2_key')
        .eq('id', client.logo_asset_id)
        .single();
      if (logo) {
        logoPath = join(dir, 'logo.png');
        await writeFile(logoPath, await getObject(logo.r2_key));
      }
    }

    const trWords = await transcribe(srcPath);
    const outputs: Array<{ lang: string; assetId: string }> = [];

    const trBuf = await renderOne(
      srcPath,
      trWords,
      logoPath,
      primaryColor,
      dir,
      'tr',
    );
    outputs.push({
      lang: 'tr',
      assetId: await uploadRender(asset.client_id, card_id, 'tr', trBuf),
    });

    if (langs.includes('en')) {
      const enWords = await translateWords(
        trWords,
        JSON.stringify(client.glossary ?? []),
      );
      const enBuf = await renderOne(
        srcPath,
        enWords,
        logoPath,
        primaryColor,
        dir,
        'en',
      );
      outputs.push({
        lang: 'en',
        assetId: await uploadRender(asset.client_id, card_id, 'en', enBuf),
      });
    }

    // Attach each render to the card's content for that language.
    for (const o of outputs) {
      const { data: existing } = await db()
        .from('card_contents')
        .select('media_asset_ids')
        .eq('card_id', card_id)
        .eq('lang', o.lang)
        .single();
      const ids = new Set(existing?.media_asset_ids ?? []);
      ids.add(o.assetId);
      await db()
        .from('card_contents')
        .upsert(
          {
            card_id,
            lang: o.lang,
            media_asset_ids: [...ids],
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'card_id,lang' },
        );
    }

    await logActivity('reel.rendered', {
      clientId: asset.client_id,
      cardId: card_id,
      detail: { langs: outputs.map((o) => o.lang) },
    });
    return { outputs };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch((e) =>
      log.warn({ err: String(e) }, 'reel temp cleanup failed'),
    );
  }
}

async function uploadRender(
  clientId: string,
  cardId: string,
  lang: string,
  buf: Buffer,
): Promise<string> {
  const key = `public/${clientId}/reels/${cardId}-${lang}.mp4`;
  await putObject(key, buf, 'video/mp4');
  // The render key is deterministic per card+lang and putObject overwrites the
  // same R2 object on re-render, so reuse the existing asset row instead of
  // inserting a duplicate that points at the same (replaced) media.
  const { data: existing } = await db()
    .from('assets')
    .select('id')
    .eq('client_id', clientId)
    .eq('r2_key', key)
    .maybeSingle();
  if (existing) {
    await db()
      .from('assets')
      .update({
        kind: 'video',
        original_name: `reel-${lang}.mp4`,
        source: 'render',
      })
      .eq('id', existing.id);
    return existing.id;
  }
  const { data } = await db()
    .from('assets')
    .insert({
      client_id: clientId,
      kind: 'video',
      r2_key: key,
      original_name: `reel-${lang}.mp4`,
      source: 'render',
    })
    .select('id')
    .single();
  return data!.id;
}
