/**
 * Seed the first admin user (SPEC §4: no public signup).
 *
 * Usage:
 *   pnpm seed:admin -- --email you@agency.com --password "..." --name "Ad Soyad"
 * or set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME in .env.local.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */

import { createClient } from '@supabase/supabase-js';
import { config as loadDotenv } from 'dotenv';
import { parseArgs } from 'node:util';

import type { Database } from '../lib/db/types';

loadDotenv({ path: '.env.local', quiet: true });

const { values: args } = parseArgs({
  options: {
    email: { type: 'string' },
    password: { type: 'string' },
    name: { type: 'string' },
  },
});

const email = args.email ?? process.env.SEED_ADMIN_EMAIL;
const password = args.password ?? process.env.SEED_ADMIN_PASSWORD;
const fullName = args.name ?? process.env.SEED_ADMIN_NAME ?? 'Admin';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!url || !serviceKey) {
    console.error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — fill .env.local first (SETUP.md Part A).',
    );
    process.exit(1);
  }
  if (!email || !password) {
    console.error(
      'Missing credentials. Pass --email and --password, or set SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD.',
    );
    process.exit(1);
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) {
    console.error('createUser failed:', error.message);
    process.exit(1);
  }

  // handle_new_user trigger created the profile as 'member' — promote it.
  const { error: roleErr } = await admin
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', created.user.id);
  if (roleErr) {
    console.error('role promotion failed:', roleErr.message);
    process.exit(1);
  }

  console.log(`Admin ready: ${email} (${created.user.id})`);
}

main();
