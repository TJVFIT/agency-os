import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { clientEnv } from '@/lib/env';
import type { Database } from '@/lib/db/types';

/**
 * Per-request Supabase client for Server Components, Server Actions and
 * Route Handlers. Runs with the signed-in user's JWT — RLS applies.
 */
export async function createSupabaseServer() {
  const cookieStore = await cookies();
  const env = clientEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — session refresh is handled
            // by the middleware, safe to ignore here.
          }
        },
      },
    },
  );
}
