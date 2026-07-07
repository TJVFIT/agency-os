import 'server-only';

import { createClient } from '@supabase/supabase-js';

import { serverEnv } from '@/lib/env';
import type { Database } from '@/lib/db/types';

/**
 * Service-role client — bypasses RLS. CLAUDE.md rule 4/5: server actions and
 * route handlers only, never anywhere a client component can import.
 * Uses: activity logging where triggers can't capture context, approval
 * magic-link routes, admin user management.
 */
export function createSupabaseAdmin() {
  const env = serverEnv();
  return createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
