import { redirect } from 'next/navigation';

import { CardTile } from '@/components/card-tile';
import { NewCardDialog } from '@/components/new-card-dialog';
import { PageHeader, Panel } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase/server';
import { istanbulDateString, istanbulToUtc } from '@/lib/dates';
import {
  gapRadar,
  listActivity,
  listClients,
  listProfiles,
  myQueue,
  type CardWithClient,
} from '@/lib/db/queries';
import { interpolate, tr } from '@/lib/i18n/tr';

import { MissingWork } from './_components/missing-work';
import {
  PublishFailures,
  type PublishFailureItem,
} from './_components/publish-failures';
import {
  SuggestionsPanel,
  type SuggestionItem,
} from './_components/suggestions-panel';
import { TodayPlan, type TodayShootItem } from './_components/today-plan';
import { WorkerStatus } from './_components/worker-status';

/**
 * Dashboard (SPEC §12): my queue • gap radar • worker liveness. The live
 * activity feed itself is the layout's right-side drawer, so we don't rebuild
 * it here. Realtime patches happen inside the client WorkerStatus indicator.
 */
export default async function DashboardPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/login');

  const { userId, role } = session;
  const isManager = role === 'manager' || role === 'admin';

  // Today's bounds in Istanbul wall-clock → UTC (store UTC, display TR).
  const todayStr = istanbulDateString();
  const dayStart = istanbulToUtc(`${todayStr}T00:00:00`).toISOString();
  const dayEnd = istanbulToUtc(`${todayStr}T23:59:59.999`).toISOString();

  const supabase = await createSupabaseServer();
  const [
    queue,
    gaps,
    clients,
    profiles,
    activity,
    suggRes,
    dueRes,
    shootRes,
    unreadRes,
    failRes,
  ] = await Promise.all([
      myQueue(userId, role),
      gapRadar(),
      listClients({ activeOnly: true }),
      listProfiles(),
      listActivity(50),
      // Öneriler inbox: pending worker suggestions (UPGRADE_SPEC §9).
      supabase
        .from('suggestions')
        .select('id, title, domain, card_id, clients(name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(30),
      // Bugünün planı: my cards due today or overdue (UPGRADE_SPEC §6).
      supabase
        .from('cards')
        .select('*, clients(id, name, slug, langs, colors)')
        .eq('assignee', userId)
        .not('status', 'in', '(published,archived)')
        .not('due_at', 'is', null)
        .lte('due_at', dayEnd)
        .order('due_at', { ascending: true }),
      // …plus today's shoots where I'm in the crew.
      supabase
        .from('shoots')
        .select('id, title, starts_at, ends_at, clients(name)')
        .contains('crew', [userId])
        .neq('status', 'cancelled')
        .gte('starts_at', dayStart)
        .lte('starts_at', dayEnd)
        .order('starts_at', { ascending: true }),
      // Unread client messages (v3) — grouped per client below.
      supabase
        .from('client_messages')
        .select('client_id, clients(name)')
        .eq('sender', 'client')
        .eq('read_by_team', false)
        .limit(200),
      // Başarısız yayınlar: publish jobs that exhausted their retries (req 27/28).
      supabase
        .from('ai_jobs')
        .select('id, payload, error, updated_at')
        .eq('kind', 'publish')
        .eq('status', 'error')
        .order('updated_at', { ascending: false })
        .limit(20),
    ]);

  const suggestions: SuggestionItem[] = (
    (suggRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      domain: string;
      card_id: string | null;
      clients: { name: string } | null;
    }>
  ).map((s) => ({
    id: s.id,
    title: s.title,
    domain: s.domain,
    cardId: s.card_id,
    clientName: s.clients?.name ?? null,
  }));
  const missingWork = suggestions.filter((s) => s.domain === 'missing_work');

  const dueCards = (dueRes.data ?? []) as CardWithClient[];
  const todayShoots: TodayShootItem[] = (
    (shootRes.data ?? []) as unknown as Array<{
      id: string;
      title: string;
      starts_at: string;
      ends_at: string;
      clients: { name: string } | null;
    }>
  ).map((s) => ({
    id: s.id,
    title: s.title,
    starts_at: s.starts_at,
    ends_at: s.ends_at,
    clientName: s.clients?.name ?? null,
  }));

  const lastHeartbeat =
    activity.find((row) => row.action === 'worker.heartbeat')?.created_at ??
    null;

  // Unread client messages → one row per client with a count.
  const unreadByClient = new Map<string, { name: string; count: number }>();
  for (const row of (unreadRes.data ?? []) as unknown as Array<{
    client_id: string;
    clients: { name: string } | null;
  }>) {
    const entry = unreadByClient.get(row.client_id) ?? {
      name: row.clients?.name ?? '?',
      count: 0,
    };
    entry.count += 1;
    unreadByClient.set(row.client_id, entry);
  }

  // Başarısız yayınlar: resolve each errored publish job's card title.
  const failJobs = (failRes.data ?? []) as Array<{
    id: string;
    payload: { card_id?: string } | null;
    error: string | null;
  }>;
  const failCardIds = [
    ...new Set(
      failJobs
        .map((j) => j.payload?.card_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  let failTitles: Record<string, string> = {};
  if (failCardIds.length) {
    const { data: failCards } = await supabase
      .from('cards')
      .select('id, title')
      .in('id', failCardIds);
    failTitles = Object.fromEntries(
      (failCards ?? []).map((c) => [c.id, c.title]),
    );
  }
  const publishFailures: PublishFailureItem[] = failJobs.map((j) => ({
    jobId: j.id,
    cardId: j.payload?.card_id ?? null,
    cardTitle: j.payload?.card_id
      ? (failTitles[j.payload.card_id] ?? null)
      : null,
    error: j.error,
  }));

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.dashboard.title}>
        <WorkerStatus initialHeartbeat={lastHeartbeat} />
        <NewCardDialog
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          profiles={profiles.map((p) => ({ id: p.id, full_name: p.full_name }))}
        />
      </PageHeader>

      <div className="stagger-children grid gap-4 lg:grid-cols-3">
        {isManager && publishFailures.length > 0 && (
          <Panel
            title={tr.dashboard.publishFailures}
            className="lg:col-span-3"
          >
            <PublishFailures failures={publishFailures} canRetry={isManager} />
          </Panel>
        )}

        <Panel title={tr.dashboard.myQueue} className="lg:col-span-2">
          {queue.mine.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {tr.dashboard.myQueueEmpty}
            </p>
          ) : (
            <div className="stagger-children grid gap-2 sm:grid-cols-2">
              {queue.mine.map((card) => (
                <CardTile key={card.id} card={card} showStatus />
              ))}
            </div>
          )}

          {isManager && queue.waiting.length > 0 && (
            <div className="mt-5 border-t border-white/[0.06] pt-4">
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                {tr.dashboard.waitingOnYou}
              </h3>
              <div className="stagger-children grid gap-2 sm:grid-cols-2">
                {queue.waiting.map((card) => (
                  <CardTile key={card.id} card={card} showStatus />
                ))}
              </div>
            </div>
          )}
        </Panel>

        <Panel title={tr.dashboard.gapRadar}>
          {gaps.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {tr.dashboard.gapRadarEmpty}
            </p>
          ) : (
            <ul className="stagger-children space-y-2">
              {gaps.map((client) => (
                <li
                  key={client.id}
                  className="flex items-start gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 text-sm"
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]"
                    aria-hidden
                  />
                  <span className="leading-snug text-red-200">
                    {interpolate(tr.dashboard.gapRadarWarning, {
                      client: client.name,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title={tr.automation.suggestionsInbox} className="lg:col-span-2">
          <SuggestionsPanel suggestions={suggestions} canResolve={isManager} />
        </Panel>

        <Panel title={tr.automation.todayPlan}>
          <TodayPlan
            cards={dueCards}
            shoots={todayShoots}
            overdueBefore={dayStart}
          />
        </Panel>

        {unreadByClient.size > 0 && (
          <Panel title={tr.dashboard.clientMessages}>
            <ul className="stagger-children space-y-2">
              {[...unreadByClient.entries()].map(([clientId, entry]) => (
                <li key={clientId}>
                  <a
                    href={`/clients/${clientId}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2.5 text-sm transition-colors duration-300 hover:bg-emerald-400/[0.12]"
                  >
                    <span className="truncate text-neutral-100">
                      {entry.name}
                    </span>
                    <span className="shrink-0 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] tabular-nums text-emerald-200">
                      {entry.count}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <Panel title={tr.automation.missingWork} className="lg:col-span-3">
          <MissingWork items={missingWork} />
        </Panel>
      </div>
    </div>
  );
}
