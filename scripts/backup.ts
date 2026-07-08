/**
 * Nightly pg_dump → R2 backup (SPEC §14, Phase 4). Runs from the box via cron;
 * keeps 14 days. Requires `pg_dump` on PATH and SUPABASE_DB_URL +
 * R2_* env. This is invoked by the OS cron/pm2, not the worker loop.
 *
 * Usage: tsx scripts/backup.ts
 */

import { spawn } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: 'worker/.env', quiet: true });
loadDotenv({ path: '.env.local', quiet: true });

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (c) =>
      c === 0 ? resolve() : reject(new Error(`${cmd} ${c}`)),
    );
  });
}

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) throw new Error('SUPABASE_DB_URL not set');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const file = join(tmpdir(), `agencyos-${stamp}.sql.gz`);

  // pg_dump | gzip → file
  await run('bash', ['-c', `pg_dump "${dbUrl}" | gzip > "${file}"`]);

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET ?? 'agency-media',
      Key: `backups/${stamp}.sql.gz`,
      Body: await readFile(file),
      ContentType: 'application/gzip',
    }),
  );
  await unlink(file).catch(() => {});
  // R2 lifecycle rule prunes backups/ older than 14 days (configured on bucket).
  console.log(`backup uploaded: backups/${stamp}.sql.gz`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
