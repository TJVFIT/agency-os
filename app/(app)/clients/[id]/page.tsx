import Link from 'next/link';

import { PageHeader, Panel } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { getClient } from '@/lib/db/queries';
import { createSupabaseServer } from '@/lib/supabase/server';
import {
  parseBrandProfile,
  parseGlossary,
  type ClientColors,
} from '@/lib/db/domain';
import {
  compareQuota,
  emptyUsage,
  monthlyUsage,
  QUOTA_TYPES,
} from '@/lib/finance';
import type { Report } from '@/lib/db/types';
import { tr } from '@/lib/i18n/tr';

import { QuotaBars } from '../../finance/_components/quota-bars';

const QUOTA_LABELS: Record<(typeof QUOTA_TYPES)[number], string> = {
  post: tr.cardTypes.post,
  reel: tr.cardTypes.reel,
  story: tr.cardTypes.story,
  shoot: tr.production.shoots,
};

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
        <p className="text-sm text-neutral-400">{tr.errors.clientNotFound}</p>
        <Link
          href="/clients"
          className="mt-2 inline-block text-sm text-sky-400 hover:underline"
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
  const [{ data: reportRows }, { data: pkgRow }, usage] = await Promise.all([
    supabase
      .from('reports')
      .select('*')
      .eq('client_id', id)
      .order('week_start', { ascending: false }),
    // Active package for this client → kota bars (UPGRADE_SPEC §7 wants them on
    // the client page too, not only /finance).
    supabase
      .from('client_packages')
      .select('*')
      .eq('client_id', id)
      .eq('active', true)
      .order('starts_on', { ascending: false })
      .limit(1)
      .maybeSingle(),
    monthlyUsage(),
  ]);
  const reports = (reportRows ?? []) as Report[];
  const quotaCmp = pkgRow
    ? compareQuota(pkgRow.monthly, usage[id] ?? emptyUsage())
    : null;

  const brandProfile = parseBrandProfile(client.brand_profile);
  const glossary = parseGlossary(client.glossary);
  const colors = (client.colors ?? {}) as ClientColors;

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={client.name}>
        <Link
          href="/clients"
          className="text-sm text-neutral-400 hover:text-neutral-200"
        >
          ← {tr.clients.title}
        </Link>
      </PageHeader>

      <p className="mb-4 font-mono text-xs text-neutral-500">{client.slug}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ClientSettingsEditor
          clientId={client.id}
          name={client.name}
          industry={client.industry}
          langs={client.langs}
          active={client.active}
          colors={colors}
          location={
            (client.location ?? null) as {
              lat?: number;
              lng?: number;
              district?: string;
            } | null
          }
        />

        {quotaCmp && pkgRow && (
          <Panel title={`${tr.finance.quotaUsage} · ${pkgRow.name}`}>
            <QuotaBars
              items={QUOTA_TYPES.map((t) => ({
                key: t,
                label: QUOTA_LABELS[t],
                ...quotaCmp[t],
              }))}
            />
          </Panel>
        )}

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
        <div className="mt-6 border-t border-neutral-800 pt-4">
          <DeleteClientButton clientId={client.id} />
        </div>
      )}
    </div>
  );
}
