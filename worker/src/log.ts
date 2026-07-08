import pino from 'pino';

/** pino JSON to stdout — Coolify captures it (SPEC §14). */
export const log = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: { svc: 'worker' },
});
