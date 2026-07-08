import { redirect } from 'next/navigation';

import { CardTile } from '@/components/card-tile';
import { NewCardDialog } from '@/components/new-card-dialog';
import { PageHeader, Panel } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import {
  gapRadar,
  listActivity,
  listClients,
  listProfiles,
  myQueue,
} from '@/lib/db/queries';
import { interpolate, tr } from '@/lib/i18n/tr';

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

  const [queue, gaps, clients, profiles, activity] = await Promise.all([
    myQueue(userId, role),
    gapRadar(),
    listClients({ activeOnly: true }),
    listProfiles(),
    listActivity(50),
  ]);

  const lastHeartbeat =
    activity.find((row) => row.action === 'worker.heartbeat')?.created_at ??
    null;

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.dashboard.title}>
        <WorkerStatus initialHeartbeat={lastHeartbeat} />
        <NewCardDialog
          clients={clients.map((c) => ({ id: c.id, name: c.name }))}
          profiles={profiles.map((p) => ({ id: p.id, full_name: p.full_name }))}
        />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={tr.dashboard.myQueue} className="lg:col-span-2">
          {queue.mine.length === 0 ? (
            <p className="text-sm text-neutral-500">
              {tr.dashboard.myQueueEmpty}
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {queue.mine.map((card) => (
                <CardTile key={card.id} card={card} showStatus />
              ))}
            </div>
          )}

          {isManager && queue.waiting.length > 0 && (
            <div className="mt-5 border-t border-neutral-800 pt-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
                {tr.dashboard.waitingOnYou}
              </h3>
              <div className="grid gap-2 sm:grid-cols-2">
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
            <ul className="space-y-2">
              {gaps.map((client) => (
                <li
                  key={client.id}
                  className="flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm"
                >
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full bg-red-500"
                    aria-hidden
                  />
                  <span className="text-red-200">
                    {interpolate(tr.dashboard.gapRadarWarning, {
                      client: client.name,
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
