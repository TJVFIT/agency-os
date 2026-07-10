'use client';

/**
 * /preview/production — static demo of the production module (no backend).
 * Tabs (Çekimler / Araçlar / İzinler) run on local state; the "Zaman öner"
 * strip, route mini-panel and add-forms are fully fake but interactive.
 */

import { useMemo, useState } from 'react';

import {
  Button,
  Field,
  Input,
  Panel,
  PageHeader,
  Select,
} from '@/components/ui';
import { fmtIstanbul, fmtIstanbulTime } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';

import {
  DEMO_CLIENTS,
  DEMO_LEAVES,
  DEMO_SHOOTS,
  DEMO_TEAM,
  DEMO_VEHICLES,
} from '../_demo/data';

type ShootStatus = 'planned' | 'confirmed' | 'done' | 'cancelled';

/** Glass chips matching status-badge colors per shoot stage. */
const SHOOT_CHIP: Record<ShootStatus, { chip: string; dot: string }> = {
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

function ShootChip({ status }: { status: ShootStatus }) {
  const c = SHOOT_CHIP[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${c.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} />
      {tr.production.statuses[status]}
    </span>
  );
}

// --- Local demo extensions (demo data, same spirit as _demo/data.ts) -------

const DEMO_SLOTS = [
  {
    id: 'slot1',
    range: '12 Tem 09:00 – 12:30',
    crew: 'Elif Kaya, Mert Demir',
    vehicle: 'Beyaz Doblo',
  },
  {
    id: 'slot2',
    range: '12 Tem 14:00 – 17:30',
    crew: 'Mert Demir',
    vehicle: 'Gri Clio',
  },
  {
    id: 'slot3',
    range: '13 Tem 10:00 – 13:30',
    crew: 'Elif Kaya',
    vehicle: 'Beyaz Doblo',
  },
];

/** Demo-only label for the picked slot (no tr key exists for this state). */
const SLOT_PICKED_LABEL = 'seçildi';

const DEMO_ROUTE = {
  day: '10 Tem',
  stops: [
    { order: 1, name: 'Ustanın Yeri — Çankaya', legKm: 6.4, etaMinutes: 14 },
    {
      order: 2,
      name: 'Kavis Kahve — Bahçelievler',
      legKm: 5.2,
      etaMinutes: 12,
    },
    { order: 3, name: 'Napoli Sokağı — Kızılay', legKm: 3.8, etaMinutes: 10 },
  ],
  totalKm: '15.4',
  totalMinutes: 36,
};

const clientName = (id: string) =>
  DEMO_CLIENTS.find((c) => c.id === id)?.name ?? '—';

// --- Tabs -------------------------------------------------------------------

const TABS = [
  { key: 'shoots', label: tr.production.shoots },
  { key: 'vehicles', label: tr.production.vehicles },
  { key: 'leaves', label: tr.production.leaves },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.key)}
            className={`rounded-full px-3.5 py-1 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              active
                ? 'bg-white/[0.10] text-neutral-50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4)]'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Çekimler ----------------------------------------------------------------

function ShootsTab() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [slotsOpen, setSlotsOpen] = useState(false);
  const [pickedSlot, setPickedSlot] = useState<string | null>(null);

  // Group by Istanbul calendar day, newest shoot day first kept in data order.
  const days = useMemo(() => {
    const map = new Map<string, typeof DEMO_SHOOTS>();
    for (const shoot of DEMO_SHOOTS) {
      const key = fmtIstanbul(shoot.startsAt, 'yyyy-MM-dd');
      const list = map.get(key) ?? [];
      list.push(shoot);
      map.set(key, list);
    }
    return [...map.entries()];
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            {tr.production.defaultBlock}
          </p>
          <Button
            variant="primary"
            onClick={() => {
              setSlotsOpen((v) => !v);
              setPickedSlot(null);
            }}
          >
            {tr.production.suggestSlots}
          </Button>
        </div>

        {slotsOpen && (
          <Panel title={tr.production.suggestions} className="animate-enter">
            <ol className="stagger-children grid gap-2 md:grid-cols-3">
              {DEMO_SLOTS.map((slot, i) => {
                const picked = pickedSlot === slot.id;
                return (
                  <li key={slot.id}>
                    <button
                      type="button"
                      onClick={() => setPickedSlot(slot.id)}
                      className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                        picked
                          ? 'border-indigo-300/40 bg-indigo-400/[0.12] shadow-[0_0_0_3px_rgba(129,140,248,0.12)]'
                          : 'border-white/[0.08] bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] text-neutral-500">
                          #{i + 1}
                        </span>
                        {picked && (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300/30 bg-indigo-400/15 px-2 py-0.5 text-[11px] font-medium text-indigo-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.8)]" />
                            {SLOT_PICKED_LABEL}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-neutral-100">
                        {slot.range}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {tr.production.crew}:{' '}
                        <span className="text-neutral-300">{slot.crew}</span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        {tr.production.vehicle}:{' '}
                        <span className="text-neutral-300">{slot.vehicle}</span>
                      </p>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Panel>
        )}

        {days.map(([day, dayShoots]) => (
          <section key={day} className="animate-enter">
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
              {fmtIstanbul(dayShoots[0].startsAt, 'd MMM yyyy')}
            </h3>
            <ul className="stagger-children space-y-1.5">
              {dayShoots.map((shoot) => {
                const open = expanded === shoot.id;
                return (
                  <li
                    key={shoot.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.10] hover:bg-white/[0.05]"
                  >
                    <button
                      type="button"
                      onClick={() => setExpanded(open ? null : shoot.id)}
                      className="block w-full text-left"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-neutral-400">
                          {fmtIstanbulTime(shoot.startsAt)}–
                          {fmtIstanbulTime(shoot.endsAt)}
                        </span>
                        <span className="text-sm font-medium text-neutral-100">
                          {shoot.title}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {clientName(shoot.clientId)}
                        </span>
                        <ShootChip status={shoot.status} />
                        <span
                          className={`ml-auto text-xs text-neutral-600 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                            open ? 'rotate-180' : ''
                          }`}
                        >
                          ▾
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                        <span>
                          {tr.production.crew}:{' '}
                          <span className="text-neutral-400">
                            {shoot.crew.join(', ')}
                          </span>
                        </span>
                        <span>
                          {tr.production.vehicle}:{' '}
                          <span className="text-neutral-400">
                            {shoot.vehicle ?? tr.common.none}
                          </span>
                        </span>
                      </div>
                    </button>
                    {open && (
                      <div className="animate-enter mt-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                        <p className="mb-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
                          {tr.production.brief}
                        </p>
                        <p className="text-sm leading-relaxed text-neutral-300">
                          {shoot.brief}
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <RouteMiniPanel />
    </div>
  );
}

function RouteMiniPanel() {
  return (
    <Panel title={tr.production.route} className="animate-enter self-start">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
        {DEMO_ROUTE.day}
      </p>
      <ol className="stagger-children space-y-1">
        {DEMO_ROUTE.stops.map((stop) => (
          <li
            key={stop.order}
            className="flex items-baseline justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs"
          >
            <span className="text-neutral-200">
              <span className="mr-1.5 font-semibold text-neutral-500">
                {stop.order}.
              </span>
              {stop.name}
            </span>
            <span className="whitespace-nowrap text-neutral-500">
              {stop.legKm} km · {stop.etaMinutes} dk
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 border-t border-white/[0.06] pt-2 text-xs font-medium text-neutral-300">
        {interpolate(tr.production.routeTotal, { km: DEMO_ROUTE.totalKm })}{' '}
        <span className="text-neutral-500">· {DEMO_ROUTE.totalMinutes} dk</span>
      </p>
    </Panel>
  );
}

// --- Araçlar ------------------------------------------------------------------

interface VehicleItem {
  id: string;
  name: string;
  plate: string;
  capacity: number;
}

function VehiclesTab() {
  const [vehicles, setVehicles] = useState<VehicleItem[]>(DEMO_VEHICLES);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [capacity, setCapacity] = useState('4');

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setVehicles((v) => [
      ...v,
      {
        id: `v-${Date.now()}`,
        name: name.trim(),
        plate: plate.trim(),
        capacity: Number(capacity) || 4,
      },
    ]);
    setName('');
    setPlate('');
    setCapacity('4');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title={tr.production.vehicles} className="animate-enter">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-neutral-500">
                <th className="py-1.5 pr-3 font-medium">{tr.clients.name}</th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.production.plate}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.production.capacity}
                </th>
                <th className="py-1.5 font-medium">{tr.card.status}</th>
              </tr>
            </thead>
            <tbody className="stagger-children">
              {vehicles.map((vehicle) => (
                <tr
                  key={vehicle.id}
                  className="border-b border-white/[0.04] transition-colors duration-300 last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="py-2 pr-3 text-neutral-100">{vehicle.name}</td>
                  <td className="py-2 pr-3 font-mono text-xs text-neutral-400">
                    {vehicle.plate || '—'}
                  </td>
                  <td className="py-2 pr-3 text-neutral-300">
                    {vehicle.capacity}
                  </td>
                  <td className="py-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                      {tr.clients.active}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title={tr.production.newVehicle}
        className="animate-enter self-start"
      >
        <form onSubmit={onAdd} className="space-y-3">
          <Field label={tr.clients.name}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr.production.plate}>
              <Input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                maxLength={20}
              />
            </Field>
            <Field label={tr.production.capacity}>
              <Input
                type="number"
                min={1}
                max={20}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                required
              />
            </Field>
          </div>
          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary">
              {tr.common.add}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

// --- İzinler -------------------------------------------------------------------

interface LeaveItem {
  id: string;
  person: string;
  startsOn: string;
  endsOn: string;
  note: string;
}

const INITIAL_LEAVES: LeaveItem[] = DEMO_LEAVES.map((l, i) => ({
  id: `l-${i}`,
  person: l.person,
  startsOn: l.startsOn,
  endsOn: l.endsOn,
  note: l.note,
}));

function LeavesTab() {
  const [leaves, setLeaves] = useState<LeaveItem[]>(INITIAL_LEAVES);
  const [person, setPerson] = useState(DEMO_TEAM[0].name);
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [note, setNote] = useState('');

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!startsOn || !endsOn) return;
    setLeaves((l) => [
      ...l,
      {
        id: `l-${Date.now()}`,
        person,
        startsOn: fmtIstanbul(`${startsOn}T00:00:00Z`, 'dd.MM.yyyy'),
        endsOn: fmtIstanbul(`${endsOn}T00:00:00Z`, 'dd.MM.yyyy'),
        note: note.trim(),
      },
    ]);
    setStartsOn('');
    setEndsOn('');
    setNote('');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <Panel title={tr.production.leaves} className="animate-enter">
        {leaves.length === 0 ? (
          <p className="text-sm text-neutral-500">{tr.common.none}</p>
        ) : (
          <ul className="stagger-children space-y-1.5">
            {leaves.map((leave) => (
              <li
                key={leave.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 transition-colors duration-300 hover:border-white/[0.10]"
              >
                <span className="text-sm font-medium text-neutral-100">
                  {leave.person}
                </span>
                <span className="font-mono text-xs text-neutral-400">
                  {leave.startsOn} – {leave.endsOn}
                </span>
                {leave.note && (
                  <span className="text-xs text-neutral-500">{leave.note}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title={tr.production.newLeave}
        className="animate-enter self-start"
      >
        <form onSubmit={onAdd} className="space-y-3">
          <Field label={tr.card.assignee}>
            <Select
              value={person}
              onChange={(e) => setPerson(e.target.value)}
              className="w-full"
            >
              {DEMO_TEAM.map((member) => (
                <option key={member.id} value={member.name}>
                  {member.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr.production.leaveStart}>
              <Input
                type="date"
                value={startsOn}
                onChange={(e) => setStartsOn(e.target.value)}
                required
              />
            </Field>
            <Field label={tr.production.leaveEnd}>
              <Input
                type="date"
                value={endsOn}
                onChange={(e) => setEndsOn(e.target.value)}
                required
              />
            </Field>
          </div>
          <Field label={tr.portal.availabilityNote}>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </Field>
          <div className="flex justify-end pt-1">
            <Button type="submit" variant="primary">
              {tr.common.add}
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
}

// --- Page ----------------------------------------------------------------------

export default function PreviewProductionPage() {
  const [tab, setTab] = useState<TabKey>('shoots');

  return (
    <div>
      <PageHeader title={tr.production.title}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </PageHeader>

      {tab === 'shoots' && <ShootsTab />}
      {tab === 'vehicles' && <VehiclesTab />}
      {tab === 'leaves' && <LeavesTab />}
    </div>
  );
}
