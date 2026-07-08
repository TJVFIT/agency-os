/**
 * Public R2 URL builder for the app side (read-only, no secrets). Uses
 * NEXT_PUBLIC-safe base URL; the worker has its own publicUrl in worker/src/r2.ts.
 */
export function publicAssetUrl(key: string): string {
  const base = (process.env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
  return base ? `${base}/${key}` : `/${key}`;
}
