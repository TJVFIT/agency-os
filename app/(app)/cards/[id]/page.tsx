import Link from 'next/link';

import { getCardDetail, listProfiles, listTaskTypes } from '@/lib/db/queries';
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

  // All types (not just active): a card may still carry a deactivated görev
  // türü — the header select must keep rendering its name.
  const [card, profiles, session, taskTypes] = await Promise.all([
    getCardDetail(id),
    listProfiles(),
    getSessionProfile(),
    listTaskTypes(),
  ]);

  if (!card) {
    return (
      <div className="p-4 md:p-6">
        <div className="animate-enter flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            🗂️
          </span>
          <p className="text-sm text-neutral-500">{tr.errors.cardNotFound}</p>
          <Link
            href="/board"
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-sm font-medium text-neutral-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/20 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40"
          >
            ← {tr.nav.board}
          </Link>
        </div>
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
      <nav className="animate-enter mb-4 flex items-center gap-1.5 text-xs">
        <Link
          href="/board"
          className="rounded-md px-1 py-0.5 -mx-1 text-neutral-500 transition-colors duration-300 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/40"
        >
          ← {tr.nav.board}
        </Link>
        <span aria-hidden className="text-neutral-700">
          /
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
          {tr.card.workroom}
        </span>
      </nav>

      <CardHeader
        card={card}
        profiles={profiles.map((p) => ({ id: p.id, full_name: p.full_name }))}
        taskTypes={taskTypes.map((t) => ({
          id: t.id,
          name: t.name,
          active: t.active,
        }))}
      />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Left / main — content + AI */}
        <div className="stagger-children space-y-4 lg:col-span-2">
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
        <div className="stagger-children space-y-4">
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
