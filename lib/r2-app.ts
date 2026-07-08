import 'server-only';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * App-side R2 access for presigned uploads (SPEC §7.1). Reads keys from the
 * server environment directly (they are server-only secrets, never NEXT_PUBLIC).
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}

function config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: process.env.R2_BUCKET ?? 'agency-media',
  };
}

export function r2Ready(): boolean {
  return config() !== null;
}

let client: S3Client | undefined;
function s3(cfg: R2Config): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }
  return client;
}

/** Presigned PUT for a direct browser upload; 10-minute expiry. */
export async function presignPut(
  key: string,
  contentType: string,
): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;
  return getSignedUrl(
    s3(cfg),
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 600 },
  );
}
