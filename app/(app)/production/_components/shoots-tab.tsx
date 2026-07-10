'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button, Panel } from '@/components/ui';
import { transitionShoot } from '@/lib/actions/production';
import { fmtIstanbul, fmtIstanbulTime } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { Shoot } from '@/lib/db/types';

import { RoutePanel } from './route-panel';
import { ShootDialog } from './shoot-dialog';
import type {
  ClientOption,
  ProfileOption,
  ShootRow,
  VehicleRow,
} from './types';

const STATUS_CHIP: Record<Shoot['status'], string> = {
  planned: 'bg-neutral-800 text-neutral-300',
  confirmed: 'bg-sky-950 text-sky-300',
  done: 'bg-emerald-950 text-emerald-300',
  cancelled: 'bg-red-950 text-red-300',
};

function ShootStatusChip({ status }: { status: Shoot['status'] }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_CHIP[status]}`}
    >
      {tr.production.statuses[status]}
    </span>
  );
}

/** Çekimler tab: day-grouped list + create/edit dialog + route panel. */
export function ShootsTab({
  shoots,
  clients,
  profiles,
  vehicles,
}: {
  shoots: ShootRow[];
  clients: ClientOption[];
  profiles: ProfileOption[];
  vehicles: Pick<VehicleRow, 'id' | 'name' | 'active'>[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ShootRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const profileNames = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name])),
    [profiles],
  );

  // Group by Istanbul calendar day, keeping the query's starts_at order.
  const days = useMemo(() => {
    const map = new Map<string, ShootRow[]>();
    for (const shoot of shoots) {
      const key = fmtIstanbul(shoot.starts_at, 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(shoot);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [shoots]);

  function onTransition(
    shootId: string,
    to: 'confirmed' | 'done' | 'cancelled',
  ) {
    setError(null);
    startTransition(async () => {
      const res = await transitionShoot({ shootId, to });
      if (!res.ok) {
        setError(
          res.error in tr.statusReasons
            ? tr.statusReasons[res.error as keyof typeof tr.statusReasons]
            : tr.errors.generic,
        );
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">
            {tr.production.defaultBlock}
          </p>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            {tr.production.newShoot}
          </Button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {days.length === 0 && (
          <Panel>
            <p className="text-sm text-neutral-500">{tr.production.noShoots}</p>
          </Panel>
        )}

        {days.map(([day, dayShoots]) => (
          <section key={day}>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {fmtIstanbul(dayShoots[0].starts_at, 'd MMM yyyy')}
            </h3>
            <ul className="space-y-1.5">
              {dayShoots.map((shoot) => (
                <li
                  key={shoot.id}
                  className="rounded-lg border border-neutral-800 bg-neutral-900/50 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-neutral-400">
                      {fmtIstanbulTime(shoot.starts_at)}–
                      {fmtIstanbulTime(shoot.ends_at)}
                    </span>
                    <span className="text-sm font-medium text-neutral-100">
                      {shoot.title}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {shoot.clients?.name}
                    </span>
                    <ShootStatusChip status={shoot.status} />
                    {shoot.tasks_opened && (
                      <span
                        className="text-xs text-emerald-500"
                        title={tr.production.tasksOpened}
                      >
                        ✓ {tr.production.tasksOpened}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                    <span>
                      {tr.production.crew}:{' '}
                      {shoot.crew.length
                        ? shoot.crew
                            .map((id) => profileNames.get(id) ?? '—')
                            .join(', ')
                        : tr.common.none}
                    </span>
                    <span>
                      {tr.production.vehicle}:{' '}
                      {shoot.vehicles?.name ?? tr.common.none}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {shoot.status === 'planned' && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => onTransition(shoot.id, 'confirmed')}
                        className="px-2 py-1 text-xs"
                      >
                        {tr.production.confirm}
                      </Button>
                    )}
                    {shoot.status === 'confirmed' && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => onTransition(shoot.id, 'done')}
                        className="px-2 py-1 text-xs"
                      >
                        {tr.production.markDone}
                      </Button>
                    )}
                    {(shoot.status === 'planned' ||
                      shoot.status === 'confirmed') && (
                      <>
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setEditing(shoot)}
                          className="px-2 py-1 text-xs"
                        >
                          {tr.common.edit}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={pending}
                          onClick={() => onTransition(shoot.id, 'cancelled')}
                          className="px-2 py-1 text-xs"
                        >
                          {tr.common.cancel}
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <RoutePanel vehicles={vehicles} />

      {createOpen && (
        <ShootDialog
          clients={clients}
          profiles={profiles}
          vehicles={vehicles}
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      )}
      {editing && (
        <ShootDialog
          key={editing.id}
          clients={clients}
          profiles={profiles}
          vehicles={vehicles}
          shoot={editing}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
