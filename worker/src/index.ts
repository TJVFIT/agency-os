/**
 * Agency OS worker — entry point.
 *
 * Will host (per SPEC.md): the ai_jobs poll loop (§6.1), media pipeline
 * (§7), Telegram bot (§9), publish dispatcher (§8) and cron jobs (§11).
 *
 * Phase 0: skeleton only — verifies the env module loads and exits.
 */

import { workerEnv } from './env';

function main() {
  try {
    const env = workerEnv();
    console.log(
      `[worker] env OK — supabase: ${new URL(env.NEXT_PUBLIC_SUPABASE_URL).host}, tz: ${env.TZ}`,
    );
  } catch (err) {
    console.warn(
      '[worker] env not configured yet (fine before SETUP.md Part A is done):',
    );
    console.warn(err instanceof Error ? err.message : err);
  }
  console.log('[worker] Phase 0 skeleton — no jobs to run yet.');
}

main();
