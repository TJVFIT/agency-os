import { redirect } from 'next/navigation';

import { PageHeader, Panel } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { listProfiles } from '@/lib/db/queries';
import { createSupabaseServer } from '@/lib/supabase/server';
import { fmtIstanbul } from '@/lib/dates';
import type { Enums } from '@/lib/db/types';
import { tr } from '@/lib/i18n/tr';

import { ProfileForm } from './_components/profile-form';
import { TelegramLink } from './_components/telegram-link';
import { UsersAdmin } from './_components/users-admin';
import {
  PostizMapping,
  type PostizAccount,
} from './_components/postiz-mapping';

export const metadata = { title: `${tr.settings.title} — ${tr.appName}` };

type JobStatus = Enums<'job_status'>;
const JOB_STATUSES: JobStatus[] = ['queued', 'running', 'done', 'error'];

export default async function SettingsPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/login');

  const isAdmin = session.role === 'admin';
  const supabase = await createSupabaseServer();

  // Admin-only data loaded in parallel.
  const [profiles, accountsRes, lastDoneRes, ...counts] = await Promise.all([
    isAdmin ? listProfiles() : Promise.resolve([]),
    isAdmin
      ? supabase
          .from('client_social_accounts')
          .select('id, platform, handle, postiz_integration_id, clients(name)')
          .order('platform')
      : Promise.resolve({ data: null }),
    // Recent successes carry the winning provider in result._meta.provider
    // (worker/src/handlers/ai.ts) — group to show last success PER provider.
    supabase
      .from('ai_jobs')
      .select('updated_at, result')
      .eq('status', 'done')
      .order('updated_at', { ascending: false })
      .limit(50),
    ...JOB_STATUSES.map((status) =>
      supabase
        .from('ai_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', status),
    ),
  ]);

  // Last success per AI provider (SPEC §12). Rows are already newest-first,
  // so the first sighting of each provider is its latest success.
  const doneRows = (lastDoneRes.data ?? []) as {
    updated_at: string;
    result: { _meta?: { provider?: string } } | null;
  }[];
  const providerLastSuccess = new Map<string, string>();
  for (const row of doneRows) {
    const provider = row.result?._meta?.provider;
    if (provider && !providerLastSuccess.has(provider))
      providerLastSuccess.set(provider, row.updated_at);
  }
  const lastSuccessAt = doneRows[0]?.updated_at ?? null;

  const accounts: PostizAccount[] = (
    (accountsRes.data ?? []) as unknown as {
      id: string;
      platform: string;
      handle: string;
      postiz_integration_id: string | null;
      clients: { name: string } | null;
    }[]
  ).map((a) => ({
    id: a.id,
    clientName: a.clients?.name ?? tr.common.unknown,
    platform: a.platform,
    handle: a.handle,
    postiz_integration_id: a.postiz_integration_id,
  }));

  const queueCounts = JOB_STATUSES.map((status, i) => ({
    status,
    count: counts[i]?.count ?? 0,
  }));
  const queuedDepth =
    (queueCounts.find((q) => q.status === 'queued')?.count ?? 0) +
    (queueCounts.find((q) => q.status === 'running')?.count ?? 0);

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.settings.title} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={tr.settings.profile}>
          <ProfileForm fullName={session.profile.full_name ?? ''} />
        </Panel>

        <Panel title={tr.settings.telegram}>
          <TelegramLink linked={session.profile.telegram_chat_id != null} />
        </Panel>

        <Panel title={tr.settings.providerHealth} className="lg:col-span-2">
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-xs text-neutral-500">
                {tr.settings.queueDepth}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-neutral-100">
                  {queuedDepth}
                </span>
                <span className="text-xs text-neutral-500">
                  ({tr.common.processing})
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {queueCounts.map((q) => (
                <div
                  key={q.status}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2"
                >
                  <div className="text-lg font-semibold text-neutral-100">
                    {q.count}
                  </div>
                  <div className="text-xs capitalize text-neutral-500">
                    {jobStatusLabel(q.status)}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-xs text-neutral-500">
                {tr.settings.lastSuccess}
              </div>
              {providerLastSuccess.size === 0 ? (
                <p className="text-xs text-neutral-600">
                  {lastSuccessAt ? fmtIstanbul(lastSuccessAt) : tr.common.none}
                </p>
              ) : (
                <ul className="space-y-0.5 text-xs text-neutral-400">
                  {[...providerLastSuccess.entries()].map(([provider, at]) => (
                    <li key={provider} className="flex justify-between gap-3">
                      <span className="font-mono text-neutral-300">
                        {provider}
                      </span>
                      <span className="text-neutral-500">
                        {fmtIstanbul(at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Panel>

        {isAdmin && (
          <Panel title={tr.settings.users} className="lg:col-span-2">
            <UsersAdmin profiles={profiles} currentUserId={session.userId} />
          </Panel>
        )}

        {isAdmin && (
          <Panel
            title={tr.settings.postiz}
            className="lg:col-span-2"
            actions={
              <span className="text-xs text-neutral-500">
                {tr.settings.postizHelp}
              </span>
            }
          >
            <PostizMapping accounts={accounts} />
          </Panel>
        )}
      </div>
    </div>
  );
}

function jobStatusLabel(status: JobStatus): string {
  switch (status) {
    case 'queued':
      return 'Kuyrukta';
    case 'running':
      return 'Çalışıyor';
    case 'done':
      return 'Tamamlandı';
    case 'error':
      return 'Hata';
  }
}
