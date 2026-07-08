/**
 * Image pipeline (SPEC §7.1). image_variants: sharp cover-crops to
 * square/portrait/story + a thumb, watermarks the client logo bottom-right,
 * uploads to R2 under public/, updates assets.variants. bg_remove shells to
 * the `rembg` CLI and creates a new source='ai' asset.
 */

import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';

import type { AiJob } from '../../../lib/db/types';
import { db, logActivity } from '../supabase';
import { getObject, putObject, r2Configured } from '../r2';
import { log } from '../log';

const VARIANT_SIZES = {
  square: { w: 1080, h: 1080 },
  portrait: { w: 1080, h: 1350 },
  story: { w: 1080, h: 1920 },
  thumb: { w: 400, h: 400 },
} as const;

type VariantName = keyof typeof VARIANT_SIZES;

async function loadLogoBuffer(clientId: string): Promise<Buffer | null> {
  const { data: client } = await db()
    .from('clients')
    .select('logo_asset_id')
    .eq('id', clientId)
    .single();
  if (!client?.logo_asset_id) return null;
  const { data: logo } = await db()
    .from('assets')
    .select('r2_key')
    .eq('id', client.logo_asset_id)
    .single();
  if (!logo) return null;
  try {
    return await getObject(logo.r2_key);
  } catch {
    return null;
  }
}

export async function handleImageVariants(job: AiJob) {
  if (!r2Configured()) throw new Error('R2 not configured');
  const { asset_id } = job.payload as { asset_id: string };

  const { data: asset, error } = await db()
    .from('assets')
    .select('*')
    .eq('id', asset_id)
    .single();
  if (error || !asset) throw new Error(`asset ${asset_id} not found`);

  const original = await getObject(asset.r2_key);
  const meta = await sharp(original).metadata();

  const logo = await loadLogoBuffer(asset.client_id);
  const variants: Record<string, string> = {};
  const baseKey = `public/${asset.client_id}/${asset.id}`;

  for (const [name, size] of Object.entries(VARIANT_SIZES) as [
    VariantName,
    { w: number; h: number },
  ][]) {
    let pipeline = sharp(original).resize(size.w, size.h, {
      fit: 'cover',
      position: sharp.strategy.attention,
    });

    // Watermark logo bottom-right at 6% width, 24px inset (skip thumb + no logo).
    if (logo && name !== 'thumb') {
      const logoW = Math.round(size.w * 0.06);
      const resizedLogo = await sharp(logo)
        .resize(logoW, null, { fit: 'inside' })
        .png()
        .toBuffer();
      pipeline = pipeline.composite([
        { input: resizedLogo, gravity: 'southeast', top: 24, left: 24 },
      ]);
    }

    const out = await pipeline.jpeg({ quality: 86 }).toBuffer();
    const key = `${baseKey}/${name}.jpg`;
    await putObject(key, out, 'image/jpeg');
    variants[name] = key;
  }

  await db()
    .from('assets')
    .update({
      variants,
      width: meta.width ?? null,
      height: meta.height ?? null,
    })
    .eq('id', asset_id);

  await logActivity('asset.variants_done', {
    clientId: asset.client_id,
    detail: { asset_id, variants: Object.keys(variants) },
  });
  return { variants };
}

function runCli(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: 'inherit' });
    proc.on('error', reject);
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`)),
    );
  });
}

export async function handleBgRemove(job: AiJob) {
  if (!r2Configured()) throw new Error('R2 not configured');
  const { asset_id } = job.payload as { asset_id: string };

  const { data: asset, error } = await db()
    .from('assets')
    .select('*')
    .eq('id', asset_id)
    .single();
  if (error || !asset) throw new Error(`asset ${asset_id} not found`);

  const dir = await mkdtemp(join(tmpdir(), 'bgremove-'));
  const inPath = join(dir, 'in.png');
  const outPath = join(dir, 'out.png');
  try {
    const original = await getObject(asset.r2_key);
    await writeFile(inPath, original);
    await runCli('rembg', ['i', inPath, outPath]); // SPEC §7.1
    const result = await readFile(outPath);

    const key = `public/${asset.client_id}/${asset.id}-nobg.png`;
    await putObject(key, result, 'image/png');

    const { data: newAsset } = await db()
      .from('assets')
      .insert({
        client_id: asset.client_id,
        kind: 'image',
        r2_key: key,
        original_name: `${asset.original_name}-nobg`,
        source: 'ai',
      })
      .select('id')
      .single();

    await logActivity('asset.bg_removed', {
      clientId: asset.client_id,
      detail: { from: asset_id, to: newAsset?.id },
    });
    return { asset_id: newAsset?.id };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch((e) =>
      log.warn({ err: String(e) }, 'temp cleanup failed'),
    );
  }
}
