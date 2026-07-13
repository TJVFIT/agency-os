import Link from 'next/link';

import { PageHeader } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { getClient } from '@/lib/db/queries';
import { createSupabaseServer } from '@/lib/supabase/server';
import {
  parseBrandProfile,
  parseGlossary,
  type ClientColors,
} from '@/lib/db/domain';
import type { Report } from '@/lib/db/types';
import { tr } from '@/lib/i18n/tr';

import { BrandProfileEditor } from '../_components/brand-profile-editor';
import { GlossaryEditor } from '../_components/glossary-editor';
import { HashtagBankEditor } from '../_components/hashtag-bank-editor';
import { SocialAccountsEditor } from '../_components/social-accounts-editor';
import { MetricsEditor } from '../_components/metrics-editor';
import { ClientSettingsEditor } from '../_components/client-settings-editor';
import { DeleteClientButton } from '../_components/delete-client-button';
import { PortalPanel } from './_components/portal-panel';

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, client] = await Promise.all([
    getSessionProfile(),
    getClient(id),
  ]);

  if (!client) {
    return (
      <div className="p-4 md:p-6">
        <p className="animate-enter text-sm text-neutral-400">
          {tr.errors.clientNotFound}
        </p>
        <Link
          href="/clients"
          className="mt-2 inline-block text-sm text-indigo-300 transition-colors duration-300 hover:text-indigo-200 hover:underline"
        >
          {tr.clients.title}
        </Link>
      </div>
    );
  }

  const role = session?.role ?? 'member';
  const canManage = role === 'admin' || role === 'manager';
  const isAdmin = role === 'admin';

  // Reports history — server-side read (allowed here per module brief).
  const supabase = await createSupabaseServer();
  const { data: reportRows } = await supabase
    .from('reports')
    .select('*')
    .eq('client_id', id)
    .order('week_start', { ascending: false });
  const reports = (reportRows ?? []) as Report[];

  const brandProfile = parseBrandProfile(client.brand_profile);
  const glossary = parseGlossary(client.glossary);
  const colors = (client.colors ?? {}) as ClientColors;

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={client.name}>
        <Link
          href="/clients"
          className="text-sm text-neutral-400 transition-colors duration-300 hover:text-neutral-200"
        >
          ← {tr.clients.title}
        </Link>
      </PageHeader>

      <p className="animate-enter mb-4 font-mono text-xs text-neutral-500">
        {client.slug}
      </p>

      <div className="stagger-children grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ClientSettingsEditor
          clientId={client.id}
          name={client.name}
          industry={client.industry}
          langs={client.langs}
          active={client.active}
          colors={colors}
        />

        <BrandProfileEditor clientId={client.id} initial={brandProfile} />

        <GlossaryEditor clientId={client.id} initial={glossary} />

        <HashtagBankEditor clientId={client.id} initial={client.hashtag_bank} />

        <SocialAccountsEditor
          clientId={client.id}
          accounts={client.client_social_accounts}
          canManage={canManage}
        />

        <MetricsEditor
          clientId={client.id}
          reports={reports}
          canManage={canManage}
        />

        <PortalPanel clientId={client.id} canManage={canManage} />
      </div>

      {isAdmin && (
        <div className="mt-6 border-t border-white/[0.06] pt-4">
          <DeleteClientButton clientId={client.id} />
        </div>
      )}
    </div>
  );
}
