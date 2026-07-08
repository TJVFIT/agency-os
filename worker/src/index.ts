/**
 * Agency OS worker (SPEC §6–§11): ai_jobs poll loop, media/reel pipeline,
 * Telegram bot, publish dispatcher and cron jobs. Each subsystem checks for
 * its own configuration and disables itself with a log line rather than
 * crashing the process, so the worker boots with only the Supabase core set.
 */

import { workerEnv } from './env';
import { log } from './log';
import { startQueueLoop } from './queue';
import { startCron } from './cron';
import { startBot, telegramConfigured } from './telegram';
import { hasAnyAiProvider } from './ai-config';
import { r2Configured } from './r2';

function main() {
  let env;
  try {
    env = workerEnv();
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      'worker env invalid — fill worker/.env (SETUP.md Part A). Exiting.',
    );
    process.exit(1);
  }

  log.info(
    {
      supabase: new URL(env.NEXT_PUBLIC_SUPABASE_URL).host,
      ai: hasAnyAiProvider(),
      r2: r2Configured(),
      telegram: telegramConfigured(),
      postiz: Boolean(env.POSTIZ_URL),
      tz: env.TZ,
    },
    'worker starting',
  );

  const stopQueue = startQueueLoop();
  const stopCron = startCron();
  const stopBot = startBot();

  const shutdown = (signal: string) => {
    log.info({ signal }, 'shutting down');
    stopQueue();
    stopCron();
    stopBot?.();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
