/**
 * Card/shoot types that consume a monthly package quota. Shared by the
 * server-only finance module (lib/finance.ts) and the worker report cron
 * (worker/src/cron.ts) so both count usage identically — the v2 audit found
 * they had drifted (worker counted no shoots, applied no filter). Keep this the
 * single source of truth; do not redefine the list elsewhere.
 */
export const QUOTA_TYPES = ['post', 'reel', 'story', 'shoot'] as const;
export type QuotaType = (typeof QUOTA_TYPES)[number];
