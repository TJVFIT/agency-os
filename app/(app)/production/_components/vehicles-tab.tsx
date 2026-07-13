'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Panel } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import { createVehicle, updateVehicle } from '@/lib/actions/production';
import { tr } from '@/lib/i18n/tr';

import type { VehicleRow } from './types';

/** Araçlar tab: table + add/edit dialog + activate/deactivate. */
export function VehiclesTab({
  vehicles,
  canManage,
}: {
  vehicles: VehicleRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<'closed' | 'new' | VehicleRow>('closed');
  const [error, setError] = useState<string | null>(null);

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
      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
      {vehicles.length === 0 ? (
        <p className="text-sm text-neutral-500">{tr.common.none}</p>
      ) : (
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
                  <td className="py-2 pr-3 text-neutral-300">
                    {vehicle.capacity}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
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
                      {vehicle.active ? tr.clients.active : tr.clients.inactive}
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
