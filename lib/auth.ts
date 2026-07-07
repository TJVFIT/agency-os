import 'server-only';

import { createSupabaseServer } from '@/lib/supabase/server';
import type { Profile } from '@/lib/db/types';
import type { Role } from '@/lib/status';

export interface SessionProfile {
  userId: string;
  email: string;
  profile: Profile;
  role: Role;
}

/**
 * Load the signed-in user and their profile row. Returns null when there is
 * no session OR no profile (a user without a profile must not act — see the
 * fail-closed rule in migration 0002).
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? '',
    profile,
    role: profile.role,
  };
}

/** For server actions: throw (Turkish-agnostic error code) when unauthenticated. */
export async function requireSession(): Promise<SessionProfile> {
  const session = await getSessionProfile();
  if (!session) throw new Error('unauthenticated');
  return session;
}

export async function requireRole(...roles: Role[]): Promise<SessionProfile> {
  const session = await requireSession();
  if (!roles.includes(session.role)) throw new Error('forbidden');
  return session;
}
