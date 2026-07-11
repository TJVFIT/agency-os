/**
 * App environment — zod-validated, parsed lazily so builds and tests run
 * without a populated .env.local. The worker has its own schema in
 * worker/src/env.ts (they share variable names via .env.example).
 *
 * CLAUDE.md rule 4: the client bundle may only ever see NEXT_PUBLIC_* values.
 * Everything in `serverEnv()` stays in server actions / route handlers.
 */

import { z } from 'zod';

const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  APP_URL: z.url().default('http://localhost:3000'),
});

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  /** Web push (UPGRADE_SPEC §8) — absent = push UI hides itself. */
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
  /** Public R2 base for browser-rendered media URLs (lib/r2-url.ts). */
  NEXT_PUBLIC_R2_PUBLIC_BASE_URL: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type ClientEnv = z.infer<typeof clientSchema>;

function parseOrExplain<T>(
  schema: z.ZodType<T>,
  values: unknown,
  label: string,
): T {
  const result = schema.safeParse(values);
  if (!result.success) {
    const problems = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid ${label} environment — check .env.local against .env.example:\n${problems}`,
    );
  }
  return result.data;
}

/** Treat KEY= (empty string) in .env files the same as an unset variable. */
function dropEmpty(values: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, v]) => v !== undefined && v !== ''),
  );
}

let cachedServer: ServerEnv | undefined;
let cachedClient: ClientEnv | undefined;

export function serverEnv(): ServerEnv {
  cachedServer ??= parseOrExplain(
    serverSchema,
    dropEmpty({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      APP_URL: process.env.APP_URL,
    }),
    'server',
  );
  return cachedServer;
}

export function clientEnv(): ClientEnv {
  // NEXT_PUBLIC_* must be referenced literally so Next.js inlines them
  // into the client bundle at build time.
  cachedClient ??= parseOrExplain(
    clientSchema,
    dropEmpty({
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    }),
    'client',
  );
  return cachedClient;
}
