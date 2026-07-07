import 'server-only';

import { createSupabaseServer } from '@/lib/supabase/server';
import type { Card, CardContent, Client, Profile } from '@/lib/db/types';
import type { Role } from '@/lib/status';

/** Read helpers for server components. All run under the user's RLS. */

export async function listClients(opts?: { activeOnly?: boolean }) {
  const supabase = await createSupabaseServer();
  let q = supabase.from('clients').select('*').order('name');
  if (opts?.activeOnly) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function getClient(id: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('clients')
    .select('*, client_social_accounts(*)')
    .eq('id', id)
    .single();
  if (error) return null;
  return data as Client & {
    client_social_accounts: import('@/lib/db/types').ClientSocialAccount[];
  };
}

export async function listProfiles(): Promise<Profile[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name');
  if (error) throw error;
  return data;
}

export interface CardFilters {
  clientId?: string;
  assignee?: string;
  type?: Card['type'];
  statuses?: Card['status'][];
  includeArchived?: boolean;
}

export type CardWithClient = Card & {
  clients: Pick<Client, 'id' | 'name' | 'slug' | 'langs' | 'colors'> | null;
};

export async function listCards(
  filters: CardFilters = {},
): Promise<CardWithClient[]> {
  const supabase = await createSupabaseServer();
  let q = supabase
    .from('cards')
    .select('*, clients(id, name, slug, langs, colors)')
    .order('priority')
    .order('updated_at', { ascending: false });
  if (filters.clientId) q = q.eq('client_id', filters.clientId);
  if (filters.assignee) q = q.eq('assignee', filters.assignee);
  if (filters.type) q = q.eq('type', filters.type);
  if (filters.statuses?.length) q = q.in('status', filters.statuses);
  else if (!filters.includeArchived) q = q.neq('status', 'archived');
  const { data, error } = await q;
  if (error) throw error;
  return data as CardWithClient[];
}

export type CardDetail = CardWithClient & {
  card_contents: CardContent[];
  comments: Array<
    import('@/lib/db/types').Comment & {
      profiles: Pick<Profile, 'id' | 'full_name'> | null;
    }
  >;
};

export async function getCardDetail(id: string): Promise<CardDetail | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('cards')
    .select(
      '*, clients(id, name, slug, langs, colors), card_contents(*), comments(*, profiles(id, full_name))',
    )
    .eq('id', id)
    .order('created_at', { referencedTable: 'comments', ascending: true })
    .single();
  if (error) return null;
  return data as unknown as CardDetail;
}

export async function listActivity(limit = 50) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('activity_log')
    .select('*, profiles:actor(id, full_name), cards:card_id(id, title)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}

/**
 * Dashboard "my queue": cards assigned to me, plus cards sitting in a status
 * my role acts on next (SPEC §12) — managers see cards awaiting approval.
 */
export async function myQueue(userId: string, role: Role) {
  const supabase = await createSupabaseServer();
  const { data: mine, error } = await supabase
    .from('cards')
    .select('*, clients(id, name, slug, langs, colors)')
    .eq('assignee', userId)
    .not('status', 'in', '(published,archived)')
    .order('due_at', { ascending: true, nullsFirst: false });
  if (error) throw error;

  let waiting: CardWithClient[] = [];
  if (role === 'manager' || role === 'admin') {
    const { data, error: e2 } = await supabase
      .from('cards')
      .select('*, clients(id, name, slug, langs, colors)')
      .in('status', ['translated', 'visual_ready'])
      .is('assignee', null)
      .order('updated_at', { ascending: false });
    if (e2) throw e2;
    waiting = (data as CardWithClient[]).filter((c) => {
      // awaiting approval = translated (multi-lang) or visual_ready (single-lang)
      const langs = c.clients?.langs ?? ['tr'];
      return c.status === 'translated' || langs.length === 1;
    });
  }

  return {
    mine: mine as CardWithClient[],
    waiting,
  };
}

/** Clients with no scheduled/approved cards in the next 5 days (gap radar). */
export async function gapRadar() {
  const supabase = await createSupabaseServer();
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name')
    .eq('active', true);
  if (error) throw error;

  const in5days = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString();
  const { data: covered, error: e2 } = await supabase
    .from('cards')
    .select('client_id')
    .in('status', ['scheduled', 'approved'])
    .or(`scheduled_at.lte.${in5days},scheduled_at.is.null`);
  if (e2) throw e2;

  const coveredSet = new Set(covered.map((c) => c.client_id));
  return clients.filter((c) => !coveredSet.has(c.id));
}
