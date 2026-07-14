/**
 * AI edit handlers (UPGRADE_SPEC §11a): edit_video + edit_photo. The LLM
 * turns a free-text request (portal client or team) into a structured edit
 * spec (zod, lib/ai/schemas.ts); the pure compilers in worker/lib turn the
 * spec into an FFmpeg invocation / sharp pipeline. Output goes to R2 as a
 * NEW asset (source 'render') so the original is never touched. The queue
 * loop owns retry/backoff; temp files are cleaned in finally.
 */

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import { buildPhotoEditPrompt, buildVideoEditPrompt } from '../../../lib/ai/jobs';
import { buildChain } from '../../../lib/ai/providers';
import { runChain } from '../../../lib/ai/router';
import type { AiJob } from '../../../lib/db/types';
import { compilePhotoEdit } from '../../lib/edit-photo';
import {
  buildEditAss,
  compileVideoEdit,
  type EditSourceMeta,
} from '../../lib/edit-video';
import type { Word } from '../../lib/ass';
import { providerConfig } from '../ai-config';
import { db, logActivity } from '../supabase';
import { getObject, putObject, r2Configured } from '../r2';
import { ffprobe, run, transcribe } from './reel';
import { log } from '../log';

const ROUTER_DEPS = {
  timeoutMs: 30_000,
  log: (l: Record<string, unknown>) => log.debug(l, 'ai'),
};

const MAX_SOURCES = 4;
const MAX_TOTAL_INPUT_S = 600; // keep free-tier CPU renders bounded

type EditVideoPayload = {
  client_id: string;
  asset_ids: string[];
  prompt: string;
};

type EditPhotoPayload = {
  client_id: string;
  asset_id: string;
  prompt: string;
};

/** Load + ownership-check the payload's assets (order preserved). */
async function loadEditAssets(
  clientId: string,
  assetIds: string[],
  kind: 'image' | 'video',
) {
  const { data: rows, error } = await db()
    .from('assets')
    .select('id, client_id, kind, r2_key')
    .in('id', assetIds)
    .eq('client_id', clientId);
  if (error) throw new Error(error.message);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  return assetIds.map((id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`asset ${id} not found for client`);
    if (row.kind !== kind) throw new Error(`asset ${id} is not a ${kind}`);
    return row;
  });
}

async function insertRenderedAsset(opts: {
  clientId: string;
  key: string;
  kind: 'image' | 'video';
  name: string;
  createdBy: string | null;
  width?: number;
  height?: number;
  durationS?: number;
}): Promise<string> {
  const { data: created, error } = await db()
    .from('assets')
    .insert({
      client_id: opts.clientId,
      kind: opts.kind,
      r2_key: opts.key,
      original_name: opts.name,
      source: 'render',
      uploaded_by: opts.createdBy,
      width: opts.width ?? null,
      height: opts.height ?? null,
      duration_s: opts.durationS ?? null,
    })
    .select('id')
    .single();
  if (error || !created) throw new Error(error?.message ?? 'asset insert');
  return created.id;
}

/**
 * edit_video — payload {client_id, asset_ids[], prompt}. LLM → spec →
 * stage-1 FFmpeg (trim/order/aspect/speed/audio) → optional stage-2 burn
 * (karaoke subtitles from speech and/or text overlays) → R2 + asset row.
 */
export async function handleEditVideo(job: AiJob) {
  if (!r2Configured()) throw new Error('R2 not configured');
  const { client_id, asset_ids, prompt } = job.payload as EditVideoPayload;
  if (!asset_ids?.length) throw new Error('no source assets');
  if (asset_ids.length > MAX_SOURCES) {
    throw new Error(`too many sources (max ${MAX_SOURCES})`);
  }

  const assets = await loadEditAssets(client_id, asset_ids, 'video');
  const { data: client } = await db()
    .from('clients')
    .select('colors')
    .eq('id', client_id)
    .single();
  const primaryColor =
    (client?.colors as { primary?: string } | null)?.primary ?? '#FFCC00';

  const dir = await mkdtemp(join(tmpdir(), 'edit-'));
  try {
    const sources: EditSourceMeta[] = [];
    let totalS = 0;
    for (const [i, asset] of assets.entries()) {
      const path = join(dir, `src-${i}.mp4`);
      await writeFile(path, await getObject(asset.r2_key));
      const probe = await ffprobe(path);
      totalS += probe.durationS;
      sources.push({ path, durationS: probe.durationS, hasAudio: probe.hasAudio });
      if (totalS > MAX_TOTAL_INPUT_S) {
        throw new Error(`input footage longer than ${MAX_TOTAL_INPUT_S}s`);
      }
    }

    const built = buildVideoEditPrompt(
      sources.map((s, index) => ({
        index,
        duration_s: Math.round(s.durationS * 10) / 10,
        has_audio: s.hasAudio,
      })),
      prompt,
    );
    const out = await runChain(
      buildChain(built.chainKind, providerConfig()),
      built.system,
      built.user,
      built.schema,
      ROUTER_DEPS,
    );
    const spec = out.data;

    const stage1 = join(dir, 'stage1.mp4');
    const compiled = compileVideoEdit(spec, sources, stage1);
    await run('ffmpeg', compiled.args);

    let finalPath = stage1;
    if (spec.overlays.length > 0 || spec.subtitles) {
      let words: Word[] = [];
      if (spec.subtitles && compiled.hasAudio) {
        words = await transcribe(stage1, process.env.WHISPER_MODEL ?? 'small');
      }
      if (words.length > 0 || spec.overlays.length > 0) {
        const assPath = join(dir, 'burn.ass');
        await writeFile(
          assPath,
          buildEditAss({
            words,
            overlays: spec.overlays,
            width: compiled.width,
            height: compiled.height,
            primaryColor,
          }),
        );
        const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
        finalPath = join(dir, 'final.mp4');
        await run('ffmpeg', [
          '-y',
          '-i',
          stage1,
          '-vf',
          `subtitles=${escapedAss}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '23',
          ...(compiled.hasAudio ? ['-c:a', 'copy'] : ['-an']),
          '-movflags',
          '+faststart',
          finalPath,
        ]);
      }
    }

    const key = `public/${client_id}/edits/${job.id}.mp4`;
    await putObject(key, await readFile(finalPath), 'video/mp4');
    const outProbe = await ffprobe(finalPath);
    const assetId = await insertRenderedAsset({
      clientId: client_id,
      key,
      kind: 'video',
      name: `AI kurgu: ${prompt.slice(0, 80)}`,
      createdBy: job.created_by,
      width: outProbe.width,
      height: outProbe.height,
      durationS: outProbe.durationS,
    });

    await logActivity('ai.edit_video_done', {
      clientId: client_id,
      detail: {
        job_id: job.id,
        asset_id: assetId,
        note: spec.note,
        sources: asset_ids,
      },
    });
    return { asset_id: assetId, note: spec.note, spec, _meta: out._meta };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * edit_photo — payload {client_id, asset_id, prompt}. LLM → spec → sharp
 * pipeline → R2 + asset row + an image_variants job so the result gets the
 * standard renditions.
 */
export async function handleEditPhoto(job: AiJob) {
  if (!r2Configured()) throw new Error('R2 not configured');
  const { client_id, asset_id, prompt } = job.payload as EditPhotoPayload;

  const [asset] = await loadEditAssets(client_id, [asset_id], 'image');
  const original = await getObject(asset.r2_key);
  const meta = await sharp(original).metadata();
  const srcDims = { width: meta.width ?? 0, height: meta.height ?? 0 };
  if (!srcDims.width || !srcDims.height) throw new Error('unreadable image');

  const built = buildPhotoEditPrompt(srcDims, prompt);
  const out = await runChain(
    buildChain(built.chainKind, providerConfig()),
    built.system,
    built.user,
    built.schema,
    ROUTER_DEPS,
  );
  const spec = out.data;

  let pipeline = sharp(original);
  let format: 'jpeg' | 'png' = 'jpeg';
  for (const op of compilePhotoEdit(spec, srcDims)) {
    switch (op.op) {
      case 'rotate':
        pipeline = pipeline.rotate(op.deg);
        break;
      case 'cover':
        pipeline = pipeline.resize(op.width, op.height, {
          fit: 'cover',
          position: sharp.strategy.attention,
        });
        break;
      case 'modulate':
        pipeline = pipeline.modulate({
          brightness: op.brightness,
          saturation: op.saturation,
          hue: op.hue,
        });
        break;
      case 'grayscale':
        pipeline = pipeline.grayscale();
        break;
      case 'sharpen':
        pipeline = pipeline.sharpen();
        break;
      case 'overlay':
        // Flatten first so the SVG composite lands on the transformed canvas.
        pipeline = sharp(await pipeline.toBuffer()).composite([
          { input: Buffer.from(op.svg) },
        ]);
        break;
      case 'output':
        format = op.format;
        break;
    }
  }
  const rendered =
    format === 'png'
      ? await pipeline.png().toBuffer()
      : await pipeline.jpeg({ quality: 90 }).toBuffer();
  const outMeta = await sharp(rendered).metadata();

  const ext = format === 'png' ? 'png' : 'jpg';
  const key = `public/${client_id}/edits/${job.id}.${ext}`;
  await putObject(key, rendered, format === 'png' ? 'image/png' : 'image/jpeg');
  const assetId = await insertRenderedAsset({
    clientId: client_id,
    key,
    kind: 'image',
    name: `AI foto: ${prompt.slice(0, 80)}`,
    createdBy: job.created_by,
    width: outMeta.width,
    height: outMeta.height,
  });

  // Standard renditions for the new image (same as a fresh upload).
  await db()
    .from('ai_jobs')
    .insert({
      kind: 'image_variants',
      payload: { asset_id: assetId },
      created_by: job.created_by,
    });

  await logActivity('ai.edit_photo_done', {
    clientId: client_id,
    detail: {
      job_id: job.id,
      asset_id: assetId,
      note: spec.note,
      source: asset_id,
    },
  });
  return { asset_id: assetId, note: spec.note, spec, _meta: out._meta };
}
