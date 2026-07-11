/**
 * Public R2 URL builder for the app side (read-only, no secrets). This module
 * is imported by 'use client' components, so it must read a NEXT_PUBLIC base —
 * a server-only var is `undefined` in the browser bundle and would yield broken
 * relative URLs. Prefer NEXT_PUBLIC_R2_PUBLIC_BASE_URL; fall back to the
 * server-only R2_PUBLIC_BASE_URL when rendering on the server (so existing
 * setups without the NEXT_PUBLIC var still work server-side). The worker has
 * its own publicUrl in worker/src/r2.ts.
 */
export function publicAssetUrl(key: string): string {
  const base = (
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL ??
    process.env.R2_PUBLIC_BASE_URL ??
    ''
  ).replace(/\/$/, '');
  return base ? `${base}/${key}` : `/${key}`;
}
