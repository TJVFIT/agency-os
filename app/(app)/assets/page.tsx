import { PageHeader } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { listClients } from '@/lib/db/queries';
import { createSupabaseServer } from '@/lib/supabase/server';
import { tr } from '@/lib/i18n/tr';
import type { Asset } from '@/lib/db/types';

import { AssetsGrid } from './_components/assets-grid';
import { Uploader } from './_components/uploader';

/** Media library (SPEC §12 /assets): list assets with client/kind/source
 * filters, upload, per-asset bg-remove and (admin) delete. */
export default async function AssetsPage() {
  const session = await getSessionProfile();
  const isAdmin = session?.role === 'admin';

  const [clients, supabase] = await Promise.all([
    listClients(),
    createSupabaseServer(),
  ]);

  const { data: assets } = await supabase
    .from('assets')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));

  const assetList = (assets ?? []) as Asset[];
  const imageCount = assetList.filter((a) => a.kind === 'image').length;
  const videoCount = assetList.filter((a) => a.kind === 'video').length;

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.assets.title}>
        <Uploader clients={clientOptions} />
      </PageHeader>

      {/* Library at-a-glance: glass stat chips (loaded page of the library). */}
      <div className="animate-enter mb-4 flex flex-wrap items-center gap-2">
        <StatChip label={tr.nav.assets} value={assetList.length} />
        <StatChip label={tr.assets.kinds.image} value={imageCount} />
        <StatChip label={tr.assets.kinds.video} value={videoCount} />
      </div>

      <AssetsGrid
        assets={assetList}
        clients={clientOptions}
        isAdmin={isAdmin}
      />
    </div>
  );
}

/** Rounded glass chip with a tabular-nums count — header summary row. */
function StatChip({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <span className="font-semibold tabular-nums text-neutral-100">
        {value}
      </span>
      {label}
    </span>
  );
}
