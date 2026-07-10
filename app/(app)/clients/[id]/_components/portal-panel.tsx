import { createSupabaseServer } from '@/lib/supabase/server';
import { serverEnv } from '@/lib/env';
import { parseRefinedIdea } from '@/lib/portal/service';
import { PortalPanelClient, type IdeaRow } from './portal-panel-client';

/**
 * "Müşteri portalı" panel on /clients/[id] (UPGRADE_SPEC §2): portal-link
 * management + Fikir kutusu. Server component — loads via the RLS'd client
 * (team read policies), interactivity lives in portal-panel-client.tsx.
 */
export async function PortalPanel({
  clientId,
  canManage,
}: {
  clientId: string;
  canManage: boolean;
}) {
  const supabase = await createSupabaseServer();
  const [{ data: links }, { data: ideas }] = await Promise.all([
    supabase
      .from('portal_links')
      .select('id, token, active, created_at')
      .eq('client_id', clientId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('client_ideas')
      .select('id, title, body, status, refined, created_at')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const active = links?.[0] ?? null;
  const link = active
    ? { id: active.id, url: `${serverEnv().APP_URL}/portal/${active.token}` }
    : null;

  const ideaRows: IdeaRow[] = (ideas ?? []).map((i) => {
    const refined = parseRefinedIdea(i.refined);
    return {
      id: i.id,
      title: i.title,
      body: i.body,
      status: i.status,
      refinedTitle: refined?.title ?? null,
      refinedSummary: refined?.summary ?? null,
      createdAt: i.created_at,
    };
  });

  return (
    <PortalPanelClient
      clientId={clientId}
      link={link}
      ideas={ideaRows}
      canManage={canManage}
    />
  );
}
