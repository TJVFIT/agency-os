/**
 * Worker environment — zod-validated, parsed lazily. Loads worker/.env
 * (same variable names as .env.example; SETUP.md says to copy it there).
 *
 * Only the Supabase core is required to boot. Everything phase-gated
 * (AI keys, R2, Telegram, Postiz) is optional here — each subsystem checks
 * for its own keys at startup and disables itself with a log line instead
 * of crashing the whole worker.
 */

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

loadDotenv({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});

const workerSchema = z.object({
  // Core (SETUP.md Part A)
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_URL: z.url().default('http://localhost:3000'),

  // AI providers (Phase 2) — router skips providers without a key
  GEMINI_KEY_A: z.string().optional(),
  GEMINI_KEY_B: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-flash-latest'),
  GEMINI_MODEL_LITE: z.string().default('gemini-flash-lite-latest'),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().optional(),
  DEEPL_API_KEY: z.string().optional(),

  // Media + Telegram (Phase 3)
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('agency-media'),
  R2_PUBLIC_BASE_URL: z.url().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // Publishing + ops (Phase 4)
  POSTIZ_URL: z.url().optional(),
  POSTIZ_API_KEY: z.string().optional(),
  WHISPER_MODEL: z.enum(['small', 'base']).default('small'),
  TZ: z.string().default('Europe/Istanbul'),
});

export type WorkerEnv = z.infer<typeof workerSchema>;

let cached: WorkerEnv | undefined;

export function workerEnv(): WorkerEnv {
  if (!cached) {
    // Treat KEY= (empty string) in .env files the same as unset.
    const values = Object.fromEntries(
      Object.entries(process.env).filter(
        ([, v]) => v !== undefined && v !== '',
      ),
    );
    const result = workerSchema.safeParse(values);
    if (!result.success) {
      const problems = result.error.issues
        .map((i) => `  ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(
        `Invalid worker environment — check worker/.env against .env.example:\n${problems}`,
      );
    }
    cached = result.data;
  }
  return cached;
}
