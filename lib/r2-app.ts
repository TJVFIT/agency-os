import 'server-only';

import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

/**
 * Presigned PUT for a direct browser upload; 10-minute expiry.
 *
 * When `contentLength` is provided it is folded into the signature, so the
 * browser must send exactly that Content-Length or R2 rejects the PUT. This
 * enforces the SPEC §14 size caps server-side (the caller passes the declared
 * size after checking it against the per-kind cap) — an oversized or size-lying
 * upload can no longer succeed against a presigned URL.
 */
export async function presignPut(
  key: string,
  contentType: string,
  contentLength?: number,
): Promise<string | null> {
  const cfg = config();
  if (!cfg) return null;
  return getSignedUrl(
    s3(cfg),
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      ContentType: contentType,
      ...(contentLength !== undefined ? { ContentLength: contentLength } : {}),
    }),
    { expiresIn: 600 },
  );
}

export interface HeadResult {
  contentType: string | null;
  contentLength: number | null;
}

/**
 * HEAD an object to confirm it exists and read back its stored content-type /
 * size. Returns null when R2 is unconfigured or the object is missing/denied,
 * so callers can treat "cannot verify" and "does not exist" as a rejection.
 */
export async function headObject(key: string): Promise<HeadResult | null> {
  const cfg = config();
  if (!cfg) return null;
  try {
    const res = await s3(cfg).send(
      new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }),
    );
    return {
      contentType: res.ContentType ?? null,
      contentLength:
        typeof res.ContentLength === 'number' ? res.ContentLength : null,
    };
  } catch {
    return null;
  }
}
