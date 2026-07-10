'use client';

/**
 * /preview/production — live production module demo (no backend, no example
 * data). Çekimler / Araçlar / İzinler all start empty; everything the visitor
 * adds is held in page-level local state so it survives tab switches.
 * Clients come from the shared demo store; activity is logged to the feed.
 */

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';

import {
  Button,
  Field,
  Input,
  Panel,
  PageHeader,
  Select,
} from '@/components/ui';
import { fmtIstanbul, fmtIstanbulTime, istanbulToUtc } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';

import { DEMO_PROFILE, DEMO_TEAM } from '../_demo/data';
import { useDemoStore } from '../_demo/store';

const SHOOT_BLOCK_MS = 3.5 * 60 * 60 * 1000; // default block: 3h 30m
const DAY_MS = 24 * 60 * 60 * 1000;

type ShootStatus = 'planned' | 'confirmed' | 'done' | 'cancelled';

interface ShootItem {
  id: string;
  clientId: string;
  title: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC — start + default block
  crew: string;
  vehicle: string | null;
  status: ShootStatus;
}

interface VehicleItem {
  id: string;
  name: string;
  plate: string;
  capacity: number;
}

interface LeaveItem {
  id: string;
  person: string;
  startsOn: string; // dd.MM.yyyy (display)
  endsOn: string;
  note: string;
}

interface SlotItem {
  id: string;
  startLocal: string; // datetime-local value (Istanbul wall clock)
  label: string;
  crew: string;
  vehicle: string | null;
}

function uid(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

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

/** Inviting empty state: emoji + copy + a CTA that opens the add-flow. */
function EmptyState({
  emoji,
  text,
  cta,
}: {
  emoji: string;
  text: string;
  cta?: React.ReactNode;
}) {
  return (
    <div className="animate-enter relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(22rem_12rem_at_50%_-3rem,rgba(129,140,248,0.09),transparent_70%)]"
      />
      <span
        aria-hidden
        className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.14)]"
      >
        {emoji}
      </span>
      <p className="relative max-w-sm text-sm leading-relaxed text-neutral-400">
        {text}
      </p>
      <span className="relative">{cta}</span>
    </div>
  );
}

function NoClientsState() {
  return (
    <EmptyState
      emoji="🏢"
      text={tr.demo.noClients}
      cta={
        <Link href="/preview/clients">
          <Button variant="primary">{tr.demo.addClientCta}</Button>
        </Link>
      }
    />
  );
}

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
            className={`rounded-full px-3.5 py-1 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${
              active
                ? 'bg-white/[0.10] text-neutral-50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]'
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

function ShootsTab({
  shoots,
  setShoots,
  vehicles,
}: {
  shoots: ShootItem[];
  setShoots: React.Dispatch<React.SetStateAction<ShootItem[]>>;
  vehicles: VehicleItem[];
}) {
  const store = useDemoStore();
  const titleRef = useRef<HTMLInputElement>(null);

  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [crew, setCrew] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [slotsOpen, setSlotsOpen] = useState(false);

  const selectedClient = clientId || (store.clients[0]?.id ?? '');

  // Suggested slots: next 3 workdays, 10:00 Istanbul, default 3.5h block.
  // Crew rotates through the demo team; vehicle from what the visitor added.
  const slots = useMemo(() => {
    const out: SlotItem[] = [];
    let cursor = new Date();
    while (out.length < 3) {
      cursor = new Date(cursor.getTime() + DAY_MS);
      if (Number(fmtIstanbul(cursor, 'i')) >= 6) continue; // skip weekends
      const day = fmtIstanbul(cursor, 'yyyy-MM-dd');
      const i = out.length;
      out.push({
        id: day,
        startLocal: `${day}T10:00`,
        label: `${fmtIstanbul(cursor, 'd MMMM EEEE')} · 10:00–13:30`,
        crew: DEMO_TEAM[i % DEMO_TEAM.length].name,
        vehicle:
          vehicles.length > 0 ? vehicles[i % vehicles.length].name : null,
      });
    }
    return out;
  }, [vehicles]);

  // Group by Istanbul calendar day, earliest day first.
  const days = useMemo(() => {
    const sorted = [...shoots].sort((a, b) =>
      a.startsAt.localeCompare(b.startsAt),
    );
    const map = new Map<string, ShootItem[]>();
    for (const shoot of sorted) {
      const key = fmtIstanbul(shoot.startsAt, 'yyyy-MM-dd');
      map.set(key, [...(map.get(key) ?? []), shoot]);
    }
    return [...map.entries()];
  }, [shoots]);

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient || !title.trim() || !start) return;
    const startUtc = istanbulToUtc(start);
    const shoot: ShootItem = {
      id: uid('shoot'),
      clientId: selectedClient,
      title: title.trim(),
      startsAt: startUtc.toISOString(),
      endsAt: new Date(startUtc.getTime() + SHOOT_BLOCK_MS).toISOString(),
      crew: crew.trim(),
      vehicle: vehicle || null,
      status: 'planned',
    };
    setShoots((s) => [...s, shoot]);
    store.log(
      interpolate(tr.feed.actions['shoot.created'], {
        actor: DEMO_PROFILE.full_name,
        title: shoot.title,
      }),
    );
    setTitle('');
    setStart('');
    setCrew('');
    setVehicle('');
  }

  function moveTo(id: string, status: ShootStatus) {
    const shoot = shoots.find((s) => s.id === id);
    setShoots((s) => s.map((x) => (x.id === id ? { ...x, status } : x)));
    if (shoot)
      store.log(
        interpolate(tr.feed.actions['shoot.status_changed'], {
          title: shoot.title,
          to: tr.production.statuses[status],
        }),
      );
  }

  if (store.clients.length === 0) return <NoClientsState />;

  const clientName = (id: string) =>
    store.clients.find((c) => c.id === id)?.name ?? '—';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-neutral-500">
            {tr.production.defaultBlock}
          </p>
          <Button variant="secondary" onClick={() => setSlotsOpen((v) => !v)}>
            {tr.production.suggestSlots}
          </Button>
        </div>

        {slotsOpen && (
          <Panel title={tr.production.suggestions} className="animate-enter">
            <ol className="stagger-children grid gap-2 md:grid-cols-3">
              {slots.map((slot, i) => {
                const picked = start === slot.startLocal;
                return (
                  <li key={slot.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setStart(slot.startLocal);
                        titleRef.current?.focus();
                      }}
                      className={`group w-full rounded-xl border px-3 py-2.5 text-left transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 active:scale-[0.98] ${
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
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.8)]" />
                        )}
                      </div>
                      <p className="mt-1 text-sm font-medium text-neutral-100">
                        {slot.label}
                      </p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {tr.production.crew}:{' '}
                        <span className="text-neutral-300">{slot.crew}</span>
                      </p>
                      <p className="text-xs text-neutral-500">
                        {tr.production.vehicle}:{' '}
                        <span className="text-neutral-300">
                          {slot.vehicle ?? tr.common.none}
                        </span>
                      </p>
                    </button>
                  </li>
                );
              })}
            </ol>
          </Panel>
        )}

        {shoots.length === 0 ? (
          <EmptyState
            emoji="🎬"
            text={tr.demo.noShoots}
            cta={
              <Button
                variant="primary"
                onClick={() => titleRef.current?.focus()}
              >
                {tr.production.newShoot}
              </Button>
            }
          />
        ) : (
          days.map(([day, dayShoots]) => (
            <section key={day} className="animate-enter">
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-500">
                {fmtIstanbul(dayShoots[0].startsAt, 'd MMM yyyy')}
              </h3>
              <ul className="stagger-children space-y-1.5">
                {dayShoots.map((shoot) => (
                  <li
                    key={shoot.id}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.10] hover:bg-white/[0.05]"
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
                      <span className="ml-auto">
                        {shoot.status === 'planned' && (
                          <Button
                            variant="secondary"
                            className="px-2.5 py-1 text-xs"
                            onClick={() => moveTo(shoot.id, 'confirmed')}
                          >
                            {tr.production.confirm}
                          </Button>
                        )}
                        {shoot.status === 'confirmed' && (
                          <Button
                            variant="secondary"
                            className="px-2.5 py-1 text-xs"
                            onClick={() => moveTo(shoot.id, 'done')}
                          >
                            {tr.production.markDone}
                          </Button>
                        )}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                      <span>
                        {tr.production.crew}:{' '}
                        <span className="text-neutral-400">
                          {shoot.crew || tr.common.none}
                        </span>
                      </span>
                      <span>
                        {tr.production.vehicle}:{' '}
                        <span className="text-neutral-400">
                          {shoot.vehicle ?? tr.common.none}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>

      <Panel
        title={tr.production.newShoot}
        className="animate-enter self-start"
      >
        <form onSubmit={onAdd} className="space-y-3">
          <Field label={tr.card.client}>
            <Select
              value={selectedClient}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full"
            >
              {store.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.card.title}>
            <Input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              required
            />
          </Field>
          <Field label={tr.production.leaveStart}>
            <Input
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              required
            />
          </Field>
          <p className="-mt-2 text-[11px] text-neutral-600">
            {tr.production.defaultBlock}
          </p>
          <Field label={tr.production.crew}>
            <Input
              value={crew}
              onChange={(e) => setCrew(e.target.value)}
              placeholder={`${DEMO_TEAM[1].name}, ${DEMO_TEAM[2].name}`}
              maxLength={200}
            />
          </Field>
          <Field label={tr.production.vehicle}>
            <Select
              value={vehicle}
              onChange={(e) => setVehicle(e.target.value)}
              className="w-full"
            >
              <option value="">{tr.common.none}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.name}>
                  {v.name}
                </option>
              ))}
            </Select>
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

// --- Araçlar ------------------------------------------------------------------

function VehiclesTab({
  vehicles,
  setVehicles,
}: {
  vehicles: VehicleItem[];
  setVehicles: React.Dispatch<React.SetStateAction<VehicleItem[]>>;
}) {
  const store = useDemoStore();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [plate, setPlate] = useState('');
  const [capacity, setCapacity] = useState('4');

  function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setVehicles((v) => [
      ...v,
      {
        id: uid('v'),
        name: name.trim(),
        plate: plate.trim(),
        capacity: Number(capacity) || 4,
      },
    ]);
    store.log(
      interpolate(tr.feed.actions['vehicle.created'], {
        actor: DEMO_PROFILE.full_name,
      }),
    );
    setName('');
    setPlate('');
    setCapacity('4');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {vehicles.length === 0 ? (
        <EmptyState
          emoji="🚐"
          text={tr.demo.noVehicles}
          cta={
            <Button variant="primary" onClick={() => nameRef.current?.focus()}>
              {tr.production.newVehicle}
            </Button>
          }
        />
      ) : (
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
                    <td className="py-2 pr-3 text-neutral-100">
                      {vehicle.name}
                    </td>
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
      )}

      <Panel
        title={tr.production.newVehicle}
        className="animate-enter self-start"
      >
        <form onSubmit={onAdd} className="space-y-3">
          <Field label={tr.clients.name}>
            <Input
              ref={nameRef}
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

function LeavesTab({
  leaves,
  setLeaves,
}: {
  leaves: LeaveItem[];
  setLeaves: React.Dispatch<React.SetStateAction<LeaveItem[]>>;
}) {
  const store = useDemoStore();
  const personRef = useRef<HTMLSelectElement>(null);
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
        id: uid('l'),
        person,
        startsOn: fmtIstanbul(`${startsOn}T00:00:00Z`, 'dd.MM.yyyy'),
        endsOn: fmtIstanbul(`${endsOn}T00:00:00Z`, 'dd.MM.yyyy'),
        note: note.trim(),
      },
    ]);
    store.log(
      interpolate(tr.feed.actions['leave.created'], {
        actor: DEMO_PROFILE.full_name,
      }),
    );
    setStartsOn('');
    setEndsOn('');
    setNote('');
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {leaves.length === 0 ? (
        <EmptyState
          emoji="🌴"
          text={tr.demo.noLeaves}
          cta={
            <Button
              variant="primary"
              onClick={() => personRef.current?.focus()}
            >
              {tr.production.newLeave}
            </Button>
          }
        />
      ) : (
        <Panel title={tr.production.leaves} className="animate-enter">
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
        </Panel>
      )}

      <Panel
        title={tr.production.newLeave}
        className="animate-enter self-start"
      >
        <form onSubmit={onAdd} className="space-y-3">
          <Field label={tr.card.assignee}>
            <Select
              ref={personRef}
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
  const store = useDemoStore();
  const [tab, setTab] = useState<TabKey>('shoots');
  // Lifted to the page so entries survive tab switches (session-local only).
  const [shoots, setShoots] = useState<ShootItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);

  if (!store.hydrated) return null;

  return (
    <div>
      <PageHeader title={tr.production.title}>
        <Segmented options={TABS} value={tab} onChange={setTab} />
      </PageHeader>

      {tab === 'shoots' && (
        <ShootsTab shoots={shoots} setShoots={setShoots} vehicles={vehicles} />
      )}
      {tab === 'vehicles' && (
        <VehiclesTab vehicles={vehicles} setVehicles={setVehicles} />
      )}
      {tab === 'leaves' && <LeavesTab leaves={leaves} setLeaves={setLeaves} />}
    </div>
  );
}
