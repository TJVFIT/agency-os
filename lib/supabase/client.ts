'use client';

import { createBrowserClient } from '@supabase/ssr';

import { clientEnv } from '@/lib/env';
import type { Database } from '@/lib/db/types';

let browserClient:
  | ReturnType<typeof createBrowserClient<Database>>
  | undefined;

/** Singleton browser client (anon key + user session, RLS applies). */
export function createSupabaseBrowser() {
  if (!browserClient) {
    const env = clientEnv();
    browserClient = createBrowserClient<Database>(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  }
  return browserClient;
}
