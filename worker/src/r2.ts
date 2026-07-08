import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { workerEnv } from './env';

/** Cloudflare R2 via the S3-compatible API (SPEC §2, §7). */
let s3: S3Client | undefined;

export function r2Configured(): boolean {
  const env = workerEnv();
  return Boolean(
    env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY,
  );
}

function client(): S3Client {
  if (!s3) {
    const env = workerEnv();
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID!,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3;
}

export async function putObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  const env = workerEnv();
  await client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function getObject(key: string): Promise<Buffer> {
  const env = workerEnv();
  const res = await client().send(
    new GetObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
  );
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

/** Public URL for a variant key (SPEC §7.1: variants under public/). */
export function publicUrl(key: string): string {
  const env = workerEnv();
  const base = (env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  return `${base}/${key}`;
}
