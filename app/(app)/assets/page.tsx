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

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.nav.assets}>
        <Uploader clients={clientOptions} />
      </PageHeader>

      <AssetsGrid
        assets={(assets ?? []) as Asset[]}
        clients={clientOptions}
        isAdmin={isAdmin}
      />
    </div>
  );
}
