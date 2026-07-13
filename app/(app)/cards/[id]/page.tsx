import Link from 'next/link';

import { getCardDetail, listProfiles } from '@/lib/db/queries';
import { createSupabaseServer } from '@/lib/supabase/server';
import { parseAssetVariants } from '@/lib/db/domain';
import { tr } from '@/lib/i18n/tr';
import { getSessionProfile } from '@/lib/auth';
import type { Enums } from '@/lib/db/types';

import { CardHeader } from './_components/card-header';
import { ContentTabs } from './_components/content-tabs';
import { AiActions } from './_components/ai-actions';
import { Comments } from './_components/comments';
import { StatusControls } from './_components/status-controls';
import type { PickableAsset } from './_components/media-picker';

/** The workroom — the most complex page (SPEC §12). Server-loads everything
 * and hands typed data to focused client sub-components. */
export default async function CardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [card, profiles, session] = await Promise.all([
    getCardDetail(id),
    listProfiles(),
    getSessionProfile(),
  ]);

  if (!card) {
    return (
      <div className="p-4 md:p-6">
        <p className="animate-enter rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-neutral-400">
          {tr.errors.cardNotFound}
        </p>
      </div>
    );
  }

  const role = session?.role ?? 'member';
  const langs = card.clients?.langs?.length ? card.clients.langs : ['tr'];
  const socialAccounts = card.clients
    ? await loadSocialAccounts(card.clients.id)
    : [];
  const clientAssets = card.clients
    ? await loadClientAssets(card.clients.id)
    : [];

  const profileNames = Object.fromEntries(
    profiles.map((p) => [p.id, p.full_name || p.id.slice(0, 8)]),
  );

  return (
    <div className="p-4 md:p-6">
      <div className="animate-enter mb-3 flex items-center gap-1.5 text-xs">
        <Link
          href="/board"
          className="text-neutral-500 transition-colors duration-300 hover:text-neutral-200"
        >
          ← {tr.nav.board}
        </Link>
        <span className="text-neutral-700">/</span>
        <span className="text-neutral-500">{tr.card.workroom}</span>
      </div>

      <CardHeader
        card={card}
        profiles={profiles.map((p) => ({ id: p.id, full_name: p.full_name }))}
      />

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left / main — content + AI */}
        <div className="stagger-children space-y-5 lg:col-span-2">
          <ContentTabs
            cardId={card.id}
            langs={langs}
            contents={card.card_contents}
            assets={clientAssets}
          />
          <AiActions
            cardId={card.id}
            langs={langs}
            userId={session?.userId ?? null}
            platforms={card.platforms}
          />
        </div>

        {/* Right / side — status controls + comments */}
        <div className="stagger-children space-y-5">
          <StatusControls
            cardId={card.id}
            status={card.status}
            role={role}
            langs={langs}
            platforms={card.platforms}
            accounts={socialAccounts}
          />
          <Comments
            cardId={card.id}
            comments={card.comments}
            profileNames={profileNames}
          />
        </div>
      </div>
    </div>
  );
}

async function loadSocialAccounts(clientId: string) {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('client_social_accounts')
    .select('id, platform, handle')
    .eq('client_id', clientId)
    .order('platform');
  return (data ?? []).map((a) => ({
    id: a.id,
    platform: a.platform,
    handle: a.handle,
  }));
}

async function loadClientAssets(clientId: string): Promise<PickableAsset[]> {
  const supabase = await createSupabaseServer();
  const { data } = await supabase
    .from('assets')
    .select('id, kind, original_name, r2_key, variants, source')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(120);
  return (data ?? []).map((a) => {
    const v = parseAssetVariants(a.variants);
    return {
      id: a.id,
      kind: a.kind as Enums<'asset_kind'>,
      source: a.source as Enums<'asset_source'>,
      name: a.original_name || a.id.slice(0, 8),
      thumbKey: v.thumb ?? v.square ?? v.portrait ?? a.r2_key,
    };
  });
}
