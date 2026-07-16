'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button, Field, Input, Label, Panel, Select, Textarea } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import {
  createVehicle,
  createVehicleBlock,
  deleteVehicleBlock,
  updateVehicle,
} from '@/lib/actions/production';
import { fmtIstanbulDate, istanbulDateString } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';

import { EmptyState } from './empty-state';
import type { ProfileOption, VehicleBlockRow, VehicleRow } from './types';

/** Araçlar tab: table + add/edit dialog (driver, notes, unavailability
 *  blocks — v4 §4) + activate/deactivate. */
export function VehiclesTab({
  vehicles,
  profiles,
  blocks,
  canManage,
}: {
  vehicles: VehicleRow[];
  profiles: ProfileOption[];
  blocks: VehicleBlockRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<'closed' | 'new' | VehicleRow>('closed');
  const [error, setError] = useState<string | null>(null);

  const profileNames = useMemo(
    () => new Map(profiles.map((p) => [p.id, p.full_name])),
    [profiles],
  );
  const blocksByVehicle = useMemo(() => {
    const map = new Map<string, VehicleBlockRow[]>();
    for (const block of blocks) {
      const list = map.get(block.vehicle_id) ?? [];
      list.push(block);
      map.set(block.vehicle_id, list);
    }
    return map;
  }, [blocks]);
  const today = istanbulDateString();

  function isBlockedNowOrLater(vehicleId: string): boolean {
    return (blocksByVehicle.get(vehicleId) ?? []).some(
      (b) => b.ends_on >= today,
    );
  }

  function onToggleActive(vehicle: VehicleRow) {
    setError(null);
    startTransition(async () => {
      const res = await updateVehicle({
        vehicleId: vehicle.id,
        active: !vehicle.active,
      });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      router.refresh();
    });
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const fields = {
        name: String(formData.get('name')),
        plate: String(formData.get('plate') ?? ''),
        capacity: Number(formData.get('capacity') || 4),
        driver: String(formData.get('driver') || '') || null,
        notes: String(formData.get('notes') ?? ''),
      };
      const res =
        dialog === 'new' || dialog === 'closed'
          ? await createVehicle(fields)
          : await updateVehicle({ vehicleId: dialog.id, ...fields });
      if (!res.ok) {
        setError(tr.errors.validation);
        return;
      }
      setDialog('closed');
      router.refresh();
    });
  }

  const editing = dialog !== 'closed' && dialog !== 'new' ? dialog : null;

  return (
    <Panel
      title={tr.production.vehicles}
      actions={
        canManage ? (
          <Button variant="primary" onClick={() => setDialog('new')}>
            {tr.production.newVehicle}
          </Button>
        ) : undefined
      }
    >
      {error && (
        <p
          role="alert"
          className="animate-enter mb-3 rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
        >
          {error}
        </p>
      )}
      {vehicles.length === 0 ? (
        <EmptyState
          icon="🚐"
          text={tr.demo.noVehicles}
          cta={
            canManage ? (
              <Button variant="primary" onClick={() => setDialog('new')}>
                {tr.production.newVehicle}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.08em] text-neutral-500">
                <th className="py-1.5 pr-3 font-medium">{tr.clients.name}</th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.production.plate}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.production.capacity}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.fleetOps.driver}
                </th>
                <th className="py-1.5 pr-3 font-medium">{tr.card.status}</th>
                {canManage && <th className="py-1.5" />}
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
                  <td className="py-2 pr-3 tabular-nums text-neutral-300">
                    {vehicle.capacity}
                  </td>
                  <td className="py-2 pr-3 text-xs text-neutral-400">
                    {vehicle.driver
                      ? (profileNames.get(vehicle.driver) ?? '—')
                      : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${
                          vehicle.active
                            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                            : 'border-white/[0.06] bg-white/[0.02] text-neutral-600'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            vehicle.active
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                              : 'bg-neutral-600'
                          }`}
                        />
                        {vehicle.active
                          ? tr.clients.active
                          : tr.clients.inactive}
                      </span>
                      {isBlockedNowOrLater(vehicle.id) && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]" />
                          {tr.fleetOps.blocksTitle}
                        </span>
                      )}
                    </span>
                  </td>
                  {canManage && (
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setDialog(vehicle)}
                          className="px-2.5 py-1 text-xs"
                        >
                          {tr.common.edit}
                        </Button>
                        <Button
                          variant={vehicle.active ? 'danger' : 'secondary'}
                          disabled={pending}
                          onClick={() => onToggleActive(vehicle)}
                          className="px-2.5 py-1 text-xs"
                        >
                          {vehicle.active
                            ? tr.clients.inactive
                            : tr.clients.active}
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={dialog !== 'closed'}
        onClose={() => setDialog('closed')}
        title={editing ? tr.common.edit : tr.production.newVehicle}
      >
        <form action={onSubmit} className="space-y-3">
          <Field label={tr.clients.name}>
            <Input
              name="name"
              defaultValue={editing?.name}
              required
              maxLength={100}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr.production.plate}>
              <Input
                name="plate"
                defaultValue={editing?.plate}
                maxLength={20}
              />
            </Field>
            <Field label={tr.production.capacity}>
              <Input
                name="capacity"
                type="number"
                min={1}
                max={20}
                defaultValue={editing?.capacity ?? 4}
                required
              />
            </Field>
          </div>
          <Field label={tr.fleetOps.driver}>
            <Select
              name="driver"
              defaultValue={editing?.driver ?? ''}
              className="w-full"
            >
              <option value="">{tr.common.none}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.fleetOps.vehicleNotes}>
            <Textarea name="notes" defaultValue={editing?.notes} rows={2} />
          </Field>

          {editing && (
            <VehicleBlocksManager
              vehicleId={editing.id}
              blocks={blocksByVehicle.get(editing.id) ?? []}
              onChanged={() => router.refresh()}
            />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialog('closed')}
            >
              {tr.common.cancel}
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? tr.common.loading : tr.common.save}
            </Button>
          </div>
        </form>
      </Dialog>
    </Panel>
  );
}

/**
 * Unavailability windows for one vehicle (v4 §4). Lives inside the edit
 * dialog's form, so it uses controlled inputs + type="button" — no nested
 * form. Mutations refresh the server page; the list re-renders from props.
 */
function VehicleBlocksManager({
  vehicleId,
  blocks,
  onChanged,
}: {
  vehicleId: string;
  blocks: VehicleBlockRow[];
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onAdd() {
    if (!startsOn || !endsOn) {
      setError(tr.errors.validation);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await createVehicleBlock({
        vehicleId,
        startsOn,
        endsOn,
        reason,
      });
      if (!res.ok) {
        setError(tr.errors.validation);
        return;
      }
      setStartsOn('');
      setEndsOn('');
      setReason('');
      onChanged();
    });
  }

  function onDelete(blockId: string) {
    setError(null);
    startTransition(async () => {
      const res = await deleteVehicleBlock({ blockId });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      onChanged();
    });
  }

  return (
    <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <Label className="mb-1.5">{tr.fleetOps.blocksTitle}</Label>
      {blocks.length > 0 && (
        <ul className="stagger-children mb-2 max-h-28 space-y-1 overflow-y-auto">
          {blocks.map((block) => (
            <li
              key={block.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1 text-xs"
            >
              <span className="min-w-0 truncate text-neutral-300">
                <span className="font-mono tabular-nums">
                  {fmtIstanbulDate(block.starts_on)}–
                  {fmtIstanbulDate(block.ends_on)}
                </span>
                {block.reason && (
                  <span className="ml-1.5 text-neutral-500">
                    {block.reason}
                  </span>
                )}
              </span>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => onDelete(block.id)}
                className="shrink-0 px-2 py-0.5 text-[11px]"
              >
                {tr.common.delete}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={startsOn}
          onChange={(e) => setStartsOn(e.target.value)}
          aria-label={tr.production.leaveStart}
        />
        <Input
          type="date"
          value={endsOn}
          onChange={(e) => setEndsOn(e.target.value)}
          min={startsOn || undefined}
          aria-label={tr.production.leaveEnd}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={tr.fleetOps.blockReason}
          maxLength={500}
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={onAdd}
          className="shrink-0 px-2.5 py-1 text-xs"
        >
          {tr.fleetOps.blockAdd}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {error}
        </p>
      )}
    </div>
  );
}
