import { redirect } from 'next/navigation';

import { PageHeader, Panel } from '@/components/ui';
import { PushSubscribe } from '@/components/push-subscribe';
import { getSessionProfile } from '@/lib/auth';
import { listProfiles } from '@/lib/db/queries';
import { createSupabaseServer } from '@/lib/supabase/server';
import { fmtIstanbul } from '@/lib/dates';
import type { Enums, TaskType } from '@/lib/db/types';
import type { AutomationMode } from '@/lib/automation';
import { tr } from '@/lib/i18n/tr';

import { AutomationSettings } from './_components/automation-settings';
import { OpsSettings } from './_components/ops-settings';
import { ProfileForm } from './_components/profile-form';
import { TaskTypesAdmin } from './_components/task-types-admin';
import { TelegramLink } from './_components/telegram-link';
import { UsersAdmin } from './_components/users-admin';
import {
  PostizMapping,
  type PostizAccount,
} from './_components/postiz-mapping';

export const metadata = { title: `${tr.settings.title} — ${tr.appName}` };

type JobStatus = Enums<'job_status'>;
const JOB_STATUSES: JobStatus[] = ['queued', 'running', 'done', 'error'];

/** Per-status glow dot for the queue tiles — mirrors the state-dot language
 *  used by StatusBadge / TelegramLink across the app. */
const JOB_STATUS_DOT: Record<JobStatus, string> = {
  queued: 'bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.55)]',
  running: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.55)]',
  done: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]',
  error: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.55)]',
};

export default async function SettingsPage() {
  const session = await getSessionProfile();
  if (!session) redirect('/login');

  const isAdmin = session.role === 'admin';
  // Görev türleri are manager-editable (RLS mgr_write_task_types, v4 §6).
  const canManageTypes = isAdmin || session.role === 'manager';
  const supabase = await createSupabaseServer();

  // Admin-only data loaded in parallel.
  const [
    profiles,
    accountsRes,
    automationRes,
    shootBlockRes,
    lastDoneRes,
    ...counts
  ] = await Promise.all([
    isAdmin ? listProfiles() : Promise.resolve([]),
    isAdmin
      ? supabase
          .from('client_social_accounts')
          .select('id, platform, handle, postiz_integration_id, clients(name)')
          .order('platform')
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase.from('automation_settings').select('key, mode')
      : Promise.resolve({ data: null }),
    // Global çekim bloğu (v4) — seeded by migration 0010.
    isAdmin
      ? supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'shoot_block_minutes')
          .maybeSingle()
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

  const [taskTypesRes, teamRes] = canManageTypes
    ? await Promise.all([
        supabase.from('task_types').select('*').order('name'),
        supabase.from('profiles').select('id, full_name').order('full_name'),
      ])
    : [{ data: null }, { data: null }];
  const taskTypes = (taskTypesRes.data ?? []) as TaskType[];
  const teamOptions = (teamRes.data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name || p.id.slice(0, 8),
  }));

  // app_settings.value is jsonb — coerce defensively, fall back to the
  // documented 210 min default (migration 0010 seed).
  const shootBlockValue = Number(
    (shootBlockRes.data as { value: unknown } | null)?.value,
  );
  const shootBlockMinutes =
    Number.isInteger(shootBlockValue) && shootBlockValue > 0
      ? shootBlockValue
      : 210;

  const queueCounts = JOB_STATUSES.map((status, i) => ({
    status,
    count: counts[i]?.count ?? 0,
  }));
  const queuedDepth =
    (queueCounts.find((q) => q.status === 'queued')?.count ?? 0) +
    (queueCounts.find((q) => q.status === 'running')?.count ?? 0);

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.settings.title}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.6)]"
          />
          {tr.roles[session.role]}
        </span>
      </PageHeader>

      <div className="stagger-children grid gap-4 lg:grid-cols-2">
        <Panel title={tr.settings.profile}>
          <ProfileForm fullName={session.profile.full_name ?? ''} />
          {/* Renders nothing when NEXT_PUBLIC_VAPID_PUBLIC_KEY is unset. */}
          <PushSubscribe className="mt-5" />
        </Panel>

        <Panel title={tr.settings.telegram}>
          <TelegramLink linked={session.profile.telegram_chat_id != null} />
        </Panel>

        <Panel title={tr.settings.providerHealth} className="lg:col-span-2">
          <div className="flex flex-col gap-4">
            <div>
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                {tr.settings.queueDepth}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums tracking-tight text-neutral-50">
                  {queuedDepth}
                </span>
                <span className="text-xs text-neutral-500">
                  ({tr.common.processing})
                </span>
              </div>
            </div>
            <div className="stagger-children grid grid-cols-2 gap-3 sm:grid-cols-4">
              {queueCounts.map((q) => (
                <div
                  key={q.status}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:border-white/[0.16] hover:bg-white/[0.05] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.7)]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${JOB_STATUS_DOT[q.status]}`}
                    />
                    <span className="text-lg font-semibold tabular-nums tracking-tight text-neutral-50">
                      {q.count}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                    {jobStatusLabel(q.status)}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                {tr.settings.lastSuccess}
              </div>
              {providerLastSuccess.size === 0 ? (
                <p className="rounded-lg border border-dashed border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs text-neutral-500">
                  {lastSuccessAt ? fmtIstanbul(lastSuccessAt) : tr.common.none}
                </p>
              ) : (
                <ul className="stagger-children space-y-1.5 text-xs">
                  {[...providerLastSuccess.entries()].map(([provider, at]) => (
                    <li
                      key={provider}
                      className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.04]"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span
                          aria-hidden
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.55)]"
                        />
                        <span className="truncate font-mono text-neutral-200">
                          {provider}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-neutral-500">
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

        {canManageTypes && (
          <Panel title={tr.taskTypes.title} className="lg:col-span-2">
            <TaskTypesAdmin taskTypes={taskTypes} profiles={teamOptions} />
          </Panel>
        )}

        {isAdmin && (
          <Panel title={tr.opsSettings.shootBlockTitle}>
            <OpsSettings shootBlockMinutes={shootBlockMinutes} />
          </Panel>
        )}

        {isAdmin && (
          <Panel title={tr.automation.title} className="lg:col-span-2">
            <AutomationSettings
              initial={
                (automationRes.data ?? []) as {
                  key: string;
                  mode: AutomationMode;
                }[]
              }
            />
          </Panel>
        )}

        {isAdmin && (
          <Panel
            title={tr.settings.postiz}
            className="lg:col-span-2"
            actions={
              <span className="hidden max-w-[18rem] truncate text-xs text-neutral-500 sm:block">
                {tr.settings.postizHelp}
              </span>
            }
          >
            <p className="mb-3 text-xs leading-relaxed text-neutral-500 sm:hidden">
              {tr.settings.postizHelp}
            </p>
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
