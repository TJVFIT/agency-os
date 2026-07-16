'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { transitionShoot } from '@/lib/actions/production';
import { fmtIstanbul, fmtIstanbulTime } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import type { Shoot } from '@/lib/db/types';

import { EmptyState } from './empty-state';
import { RoutePanel } from './route-panel';
import { ShootDialog } from './shoot-dialog';
import type {
  ClientOption,
  EquipmentRow,
  ProfileOption,
  ShootRow,
  VehicleRow,
} from './types';

/** Tinted glass chips matching the pipeline StatusBadge convention. */
const STATUS_CHIP: Record<Shoot['status'], { chip: string; dot: string }> = {
  planned: {
    chip: 'border-white/10 bg-white/[0.05] text-neutral-300',
    dot: 'bg-neutral-400',
  },
  confirmed: {
    chip: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    dot: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]',
  },
  done: {
    chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  },
  cancelled: {
    chip: 'border-red-400/20 bg-red-400/10 text-red-200',
    dot: 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]',
  },
};

function ShootStatusChip({ status }: { status: Shoot['status'] }) {
  const c = STATUS_CHIP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${c.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
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
  equipment,
}: {
  shoots: ShootRow[];
  clients: ClientOption[];
  profiles: ProfileOption[];
  vehicles: Pick<VehicleRow, 'id' | 'name' | 'active'>[];
  equipment: Pick<
    EquipmentRow,
    'id' | 'name' | 'kind' | 'active' | 'vehicle_id'
  >[];
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
        <div className="animate-enter flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[11px] text-neutral-500">
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full bg-indigo-300/70 shadow-[0_0_6px_rgba(165,180,252,0.5)]"
            />
            {tr.production.defaultBlock}
          </p>
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            {tr.production.newShoot}
          </Button>
        </div>

        {error && (
          <p
            role="alert"
            className="animate-enter rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        {days.length === 0 && (
          <EmptyState
            icon="🎬"
            text={tr.production.noShoots}
            cta={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                {tr.production.newShoot}
              </Button>
            }
          />
        )}

        {days.map(([day, dayShoots]) => (
          <section key={day} className="animate-enter">
            <h3 className="mb-1.5 flex items-baseline gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {fmtIstanbul(dayShoots[0].starts_at, 'd MMM yyyy')}
              <span className="rounded-full border border-white/[0.06] bg-white/[0.03] px-1.5 text-[10px] font-semibold tabular-nums leading-4 text-neutral-500">
                {dayShoots.length}
              </span>
              <span
                aria-hidden
                className="h-px flex-1 self-center bg-gradient-to-r from-white/[0.08] to-transparent"
              />
            </h3>
            <ul className="stagger-children space-y-1.5">
              {dayShoots.map((shoot) => (
                <li
                  key={shoot.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.10] hover:bg-white/[0.05] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_8px_24px_-12px_rgba(0,0,0,0.6)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-white/[0.06] bg-white/[0.04] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-neutral-400">
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
                        className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                        title={tr.production.tasksOpened}
                      >
                        ✓ {tr.production.tasksOpened}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                    <span>
                      {tr.production.crew}:{' '}
                      <span className="text-neutral-400">
                        {shoot.crew.length
                          ? shoot.crew
                              .map((id) => profileNames.get(id) ?? '—')
                              .join(', ')
                          : tr.common.none}
                      </span>
                    </span>
                    <span>
                      {tr.production.vehicle}:{' '}
                      <span className="text-neutral-400">
                        {shoot.vehicles?.name ?? tr.common.none}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {shoot.status === 'planned' && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => onTransition(shoot.id, 'confirmed')}
                        className="px-2.5 py-1 text-xs"
                      >
                        {tr.production.confirm}
                      </Button>
                    )}
                    {shoot.status === 'confirmed' && (
                      <Button
                        variant="secondary"
                        disabled={pending}
                        onClick={() => onTransition(shoot.id, 'done')}
                        className="px-2.5 py-1 text-xs"
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
                          className="px-2.5 py-1 text-xs"
                        >
                          {tr.common.edit}
                        </Button>
                        <Button
                          variant="danger"
                          disabled={pending}
                          onClick={() => onTransition(shoot.id, 'cancelled')}
                          className="px-2.5 py-1 text-xs"
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
          equipment={equipment}
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
          equipment={equipment}
          shoot={editing}
          open
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
