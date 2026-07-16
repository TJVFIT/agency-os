import { PageHeader } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { tr } from '@/lib/i18n/tr';

import { EquipmentTab } from './_components/equipment-tab';
import { LeavesTab } from './_components/leaves-tab';
import { ShootsTab } from './_components/shoots-tab';
import { TabNav } from './_components/tab-nav';
import { VehiclesTab } from './_components/vehicles-tab';
import type {
  EquipmentRow,
  LeaveRow,
  ShootRow,
  VehicleBlockRow,
} from './_components/types';

export const metadata = { title: `${tr.production.title} — ${tr.appName}` };

const TABS = [
  { key: 'shoots', label: tr.production.shoots },
  { key: 'vehicles', label: tr.production.vehicles },
  { key: 'equipment', label: tr.fleetOps.equipmentTitle },
  { key: 'leaves', label: tr.production.leaves },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Shoots list window: last 7 days onwards (upcoming + recently finished). */
function shootsSince(): string {
  return new Date(Date.now() - 7 * 864e5).toISOString();
}

/** Kullanımda badge (v4 §5): equipment reserved by a planned/confirmed
 * shoot whose time block overlaps now. */
function busyEquipment(shoots: ShootRow[]): string[] {
  const nowMs = Date.now();
  return [
    ...new Set(
      shoots
        .filter(
          (s) =>
            (s.status === 'planned' || s.status === 'confirmed') &&
            new Date(s.starts_at).getTime() <= nowMs &&
            new Date(s.ends_at).getTime() > nowMs,
        )
        .flatMap((s) => s.equipment_ids),
    ),
  ];
}

/**
 * /production — Çekimler / Araçlar / Ekipman / İzinler (UPGRADE_SPEC §3 + v4).
 * Server component: loads under the user's RLS, hands off to client tabs.
 */
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab: rawTab } = await searchParams;
  const tab: TabKey =
    rawTab === 'vehicles' || rawTab === 'leaves' || rawTab === 'equipment'
      ? rawTab
      : 'shoots';

  const session = await getSessionProfile();
  const canManage = session?.role === 'admin' || session?.role === 'manager';

  const supabase = await createSupabaseServer();
  const since = shootsSince();
  const [
    clientsRes,
    profilesRes,
    vehiclesRes,
    shootsRes,
    leavesRes,
    equipmentRes,
    vehicleBlocksRes,
  ] = await Promise.all([
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
    supabase.from('equipment').select('*').order('name'),
    supabase
      .from('vehicle_blocks')
      .select('*')
      .order('starts_on', { ascending: false })
      .limit(200),
  ]);

  const clients = clientsRes.data ?? [];
  const profiles = profilesRes.data ?? [];
  const vehicles = vehiclesRes.data ?? [];
  const shoots = (shootsRes.data ?? []) as ShootRow[];
  const leaves = (leavesRes.data ?? []) as LeaveRow[];
  const equipment = (equipmentRes.data ?? []) as EquipmentRow[];
  const vehicleBlocks = (vehicleBlocksRes.data ?? []) as VehicleBlockRow[];

  const busyEquipmentIds = busyEquipment(shoots);

  // Display-only counts for the segmented control pills.
  const counts: Record<TabKey, number> = {
    shoots: shoots.filter((s) => s.status !== 'cancelled').length,
    vehicles: vehicles.length,
    equipment: equipment.filter((e) => e.active).length,
    leaves: leaves.length,
  };

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.production.title}>
        <TabNav
          tabs={TABS.map((t) => ({ ...t, count: counts[t.key] }))}
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
            equipment={equipment}
          />
        )}
        {tab === 'vehicles' && (
          <VehiclesTab
            vehicles={vehicles}
            profiles={profiles}
            blocks={vehicleBlocks}
            canManage={canManage}
          />
        )}
        {tab === 'equipment' && (
          <EquipmentTab
            equipment={equipment}
            vehicles={vehicles}
            busyIds={busyEquipmentIds}
            canManage={canManage}
          />
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
