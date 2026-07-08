import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '../../lib/db/types';
import { workerEnv } from './env';

/**
 * Service-role client for the worker. Bypasses RLS — the worker is trusted
 * infrastructure (SPEC §4). auth.uid() is null in this context, so the
 * status guard and activity triggers treat it as the service role.
 */
let client: SupabaseClient<Database> | undefined;

export function db(): SupabaseClient<Database> {
  if (!client) {
    const env = workerEnv();
    client = createClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
  return client;
}

/** Append an activity_log row from the worker (system actor = null). */
export async function logActivity(
  action: string,
  opts: {
    clientId?: string | null;
    cardId?: string | null;
    detail?: Record<string, unknown>;
  } = {},
): Promise<void> {
  await db()
    .from('activity_log')
    .insert({
      actor: null,
      client_id: opts.clientId ?? null,
      card_id: opts.cardId ?? null,
      action,
      detail: (opts.detail ?? {}) as Json,
    });
}
