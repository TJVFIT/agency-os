'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Button, Field, Input, Panel, Select, Textarea } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { createEquipment, updateEquipment } from '@/lib/actions/equipment';
import { tr } from '@/lib/i18n/tr';

import { EmptyState } from './empty-state';
import type { EquipmentRow, VehicleRow } from './types';

type Availability = 'free' | 'inUse' | 'passive';

/** Glass chip styling per availability state (Müsait/Kullanımda/Pasif). */
const AVAILABILITY_CHIP: Record<
  Availability,
  { label: string; chip: string; dot: string }
> = {
  free: {
    label: tr.fleetOps.equipmentFree,
    chip: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    dot: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
  },
  inUse: {
    label: tr.fleetOps.equipmentInUse,
    chip: 'border-sky-400/20 bg-sky-400/10 text-sky-200',
    dot: 'bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]',
  },
  passive: {
    label: tr.fleetOps.equipmentPassive,
    chip: 'border-white/[0.06] bg-white/[0.02] text-neutral-600',
    dot: 'bg-neutral-600',
  },
};

/** Ekipman tab (v4 §5): table + add/edit dialog + activate/deactivate.
 * `busyIds` = equipment reserved by a planned/confirmed shoot whose time
 * block overlaps now (computed server-side from shoots.equipment_ids). */
export function EquipmentTab({
  equipment,
  vehicles,
  busyIds,
  canManage,
}: {
  equipment: EquipmentRow[];
  vehicles: Pick<VehicleRow, 'id' | 'name' | 'active'>[];
  busyIds: string[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<'closed' | 'new' | EquipmentRow>(
    'closed',
  );
  const [error, setError] = useState<string | null>(null);

  const vehicleNames = useMemo(
    () => new Map(vehicles.map((v) => [v.id, v.name])),
    [vehicles],
  );
  const busySet = useMemo(() => new Set(busyIds), [busyIds]);

  function availabilityOf(item: EquipmentRow): Availability {
    if (!item.active) return 'passive';
    return busySet.has(item.id) ? 'inUse' : 'free';
  }

  function onToggleActive(item: EquipmentRow) {
    setError(null);
    startTransition(async () => {
      const res = await updateEquipment({
        equipmentId: item.id,
        active: !item.active,
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
        kind: String(formData.get('kind') ?? ''),
        serial: String(formData.get('serial') ?? ''),
        vehicleId: String(formData.get('vehicleId') || '') || null,
        notes: String(formData.get('notes') ?? ''),
      };
      const res =
        dialog === 'new' || dialog === 'closed'
          ? await createEquipment(fields)
          : await updateEquipment({ equipmentId: dialog.id, ...fields });
      if (!res.ok) {
        setError(tr.errors.validation);
        return;
      }
      setDialog('closed');
      router.refresh();
    });
  }

  const editing = dialog !== 'closed' && dialog !== 'new' ? dialog : null;
  const activeVehicles = vehicles.filter(
    (v) => v.active || v.id === editing?.vehicle_id,
  );

  return (
    <Panel
      title={tr.fleetOps.equipmentTitle}
      actions={
        canManage ? (
          <Button variant="primary" onClick={() => setDialog('new')}>
            {tr.fleetOps.equipmentAdd}
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
      {equipment.length === 0 ? (
        <EmptyState
          icon="🎥"
          text={tr.fleetOps.equipmentEmpty}
          cta={
            canManage ? (
              <Button variant="primary" onClick={() => setDialog('new')}>
                {tr.fleetOps.equipmentAdd}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-[0.08em] text-neutral-500">
                <th className="py-1.5 pr-3 font-medium">
                  {tr.fleetOps.equipmentName}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.fleetOps.equipmentKind}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.fleetOps.equipmentSerial}
                </th>
                <th className="py-1.5 pr-3 font-medium">
                  {tr.fleetOps.equipmentVehicle}
                </th>
                <th className="py-1.5 pr-3 font-medium">{tr.card.status}</th>
                {canManage && <th className="py-1.5" />}
              </tr>
            </thead>
            <tbody className="stagger-children">
              {equipment.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-white/[0.04] transition-colors duration-300 last:border-0 hover:bg-white/[0.03]"
                >
                  <td className="py-2 pr-3 text-neutral-100">{item.name}</td>
                  <td className="py-2 pr-3 text-xs text-neutral-400">
                    {item.kind || '—'}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs text-neutral-400">
                    {item.serial || '—'}
                  </td>
                  <td className="py-2 pr-3 text-xs text-neutral-400">
                    {item.vehicle_id
                      ? (vehicleNames.get(item.vehicle_id) ?? '—')
                      : '—'}
                  </td>
                  <td className="py-2 pr-3">
                    {(() => {
                      const chip = AVAILABILITY_CHIP[availabilityOf(item)];
                      return (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${chip.chip}`}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${chip.dot}`}
                          />
                          {chip.label}
                        </span>
                      );
                    })()}
                  </td>
                  {canManage && (
                    <td className="py-2 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setDialog(item)}
                          className="px-2.5 py-1 text-xs"
                        >
                          {tr.common.edit}
                        </Button>
                        <Button
                          variant={item.active ? 'danger' : 'secondary'}
                          disabled={pending}
                          onClick={() => onToggleActive(item)}
                          className="px-2.5 py-1 text-xs"
                        >
                          {item.active
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
        title={editing ? tr.common.edit : tr.fleetOps.equipmentAdd}
      >
        <form action={onSubmit} className="space-y-3">
          <Field label={tr.fleetOps.equipmentName}>
            <Input
              name="name"
              defaultValue={editing?.name}
              required
              maxLength={120}
              autoFocus
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={tr.fleetOps.equipmentKind}>
              <Input name="kind" defaultValue={editing?.kind} maxLength={60} />
            </Field>
            <Field label={tr.fleetOps.equipmentSerial}>
              <Input
                name="serial"
                defaultValue={editing?.serial}
                maxLength={120}
              />
            </Field>
          </div>
          <Field label={tr.fleetOps.equipmentVehicle}>
            <Select
              name="vehicleId"
              defaultValue={editing?.vehicle_id ?? ''}
              className="w-full"
            >
              <option value="">{tr.common.none}</option>
              {activeVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={tr.fleetOps.equipmentNotes}>
            <Textarea
              name="notes"
              defaultValue={editing?.notes}
              rows={2}
              maxLength={2000}
            />
          </Field>
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
