import { PageHeader } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { tr } from '@/lib/i18n/tr';

import { LeavesTab } from './_components/leaves-tab';
import { ShootsTab } from './_components/shoots-tab';
import { TabNav } from './_components/tab-nav';
import { VehiclesTab } from './_components/vehicles-tab';
import type { LeaveRow, ShootRow } from './_components/types';

export const metadata = { title: `${tr.production.title} — ${tr.appName}` };

const TABS = [
  { key: 'shoots', label: tr.production.shoots },
  { key: 'vehicles', label: tr.production.vehicles },
  { key: 'leaves', label: tr.production.leaves },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Shoots list window: last 7 days onwards (upcoming + recently finished). */
function shootsSince(): string {
  return new Date(Date.now() - 7 * 864e5).toISOString();
}

/**
 * /production — Çekimler / Araçlar / İzinler (UPGRADE_SPEC §3).
 * Server component: loads under the user's RLS, hands off to client tabs.
 */
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey =
    rawTab === 'vehicles' || rawTab === 'leaves' ? rawTab : 'shoots';

  const session = await getSessionProfile();
  const canManage = session?.role === 'admin' || session?.role === 'manager';

  const supabase = await createSupabaseServer();
  const since = shootsSince();
  const [clientsRes, profilesRes, vehiclesRes, shootsRes, leavesRes] =
    await Promise.all([
      supabase
        .from('clients')
        .select('id, name')
        .eq('active', true)
        .order('name'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase.from('vehicles').select('*').order('name'),
      supabase
        .from('shoots')
        .select('*, clients(name), vehicles(name)')
        .gte('ends_at', since)
        .order('starts_at')
        .limit(200),
      supabase
        .from('staff_leaves')
        .select('*, profiles(full_name)')
        .order('starts_on', { ascending: false })
        .limit(100),
    ]);

  const clients = clientsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const vehicles = vehiclesRes.data ?? [];
  const shoots = (shootsRes.data ?? []) as ShootRow[];
  const leaves = (leavesRes.data ?? []) as LeaveRow[];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.production.title}>
        <TabNav
          tabs={TABS}
          active={tab}
          hrefFor={(k) => `/production?tab=${k}`}
        />
      </PageHeader>

      <div key={tab} className="animate-enter">
        {tab === 'shoots' && (
          <ShootsTab
            shoots={shoots}
            clients={clients}
            profiles={profiles}
            vehicles={vehicles}
          />
        )}
        {tab === 'vehicles' && (
          <VehiclesTab vehicles={vehicles} canManage={canManage} />
        )}
        {tab === 'leaves' && (
          <LeavesTab
            leaves={leaves}
            profiles={profiles}
            userId={session?.userId ?? ''}
            canManage={canManage}
          />
        )}
      </div>
    </div>
  );
}
