'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Button, Field, Input, Label, Select, Textarea } from '@/components/ui';
import { Dialog } from '@/components/dialog';
import {
  createShoot,
  suggestSlots,
  updateShoot,
  type SlotSuggestionDTO,
} from '@/lib/actions/production';
import { fmtIstanbul, istanbulToUtc } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';

import type {
  ClientOption,
  EquipmentRow,
  ProfileOption,
  ShootRow,
  VehicleRow,
} from './types';

const LOCAL_FMT = "yyyy-MM-dd'T'HH:mm";

/** KRİTİK ENGEL codes (v4 §5) — the save is refused server-side, no override. */
const CRITICAL_MESSAGES: Record<string, string> = {
  equipment_conflict: tr.fleetOps.equipmentConflict,
  vehicle_conflict: tr.fleetOps.vehicleConflict,
  vehicle_blocked: tr.fleetOps.blockConflict,
};

/**
 * Create/edit shoot form. Fully controlled so "Zaman öner" suggestions can
 * fill start time + crew + vehicle with one click.
 */
export function ShootDialog({
  clients,
  profiles,
  vehicles,
  equipment,
  shoot,
  open,
  onClose,
}: {
  clients: ClientOption[];
  profiles: ProfileOption[];
  vehicles: Pick<VehicleRow, 'id' | 'name' | 'active'>[];
  equipment: Pick<
    EquipmentRow,
    'id' | 'name' | 'kind' | 'active' | 'vehicle_id'
  >[];
  /** When set, the dialog edits this shoot instead of creating one. */
  shoot?: ShootRow;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suggesting, startSuggesting] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** Crew-busy UYARI — save is allowed via "Uyarıya rağmen kaydet". */
  const [warning, setWarning] = useState(false);

  const [clientId, setClientId] = useState(
    shoot?.client_id ?? clients[0]?.id ?? '',
  );
  const [title, setTitle] = useState(shoot?.title ?? '');
  const [brief, setBrief] = useState(shoot?.brief_md ?? '');
  const [startsAtLocal, setStartsAtLocal] = useState(
    shoot ? fmtIstanbul(shoot.starts_at, LOCAL_FMT) : '',
  );
  const [endsAtLocal, setEndsAtLocal] = useState(
    shoot ? fmtIstanbul(shoot.ends_at, LOCAL_FMT) : '',
  );
  const [crew, setCrew] = useState<string[]>(shoot?.crew ?? []);
  const [vehicleId, setVehicleId] = useState(shoot?.vehicle_id ?? '');
  const [equipmentIds, setEquipmentIds] = useState<string[]>(
    shoot?.equipment_ids ?? [],
  );
  const [slots, setSlots] = useState<SlotSuggestionDTO[] | null>(null);

  const activeVehicles = vehicles.filter((v) => v.active || v.id === vehicleId);
  const activeEquipment = equipment.filter(
    (e) => e.active || equipmentIds.includes(e.id),
  );

  function toggleCrew(id: string) {
    setCrew((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  }

  function toggleEquipment(id: string) {
    setEquipmentIds((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id],
    );
  }

  /** Picking a vehicle auto-suggests its fixed kit (equipment.vehicle_id) —
   * pre-checked, still freely un-checkable. */
  function onVehicleChange(id: string) {
    setVehicleId(id);
    if (!id) return;
    const fixed = equipment
      .filter((e) => e.active && e.vehicle_id === id)
      .map((e) => e.id);
    if (fixed.length > 0)
      setEquipmentIds((prev) => [...new Set([...prev, ...fixed])]);
  }

  function applySuggestion(slot: SlotSuggestionDTO) {
    setStartsAtLocal(fmtIstanbul(slot.startsAt, LOCAL_FMT));
    setEndsAtLocal(fmtIstanbul(slot.endsAt, LOCAL_FMT));
    setCrew(slot.crew);
    setVehicleId(slot.vehicleId ?? '');
  }

  function onSuggest() {
    if (!clientId) return;
    setError(null);
    startSuggesting(async () => {
      const res = await suggestSlots({
        clientId,
        crewSize: crew.length > 0 ? crew.length : undefined,
        equipmentIds: equipmentIds.length > 0 ? equipmentIds : undefined,
      });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      setSlots(res.data ?? []);
    });
  }

  function save(force: boolean) {
    setError(null);
    setWarning(false);
    if (!startsAtLocal) {
      setError(tr.errors.validation);
      return;
    }
    startTransition(async () => {
      const startsAt = istanbulToUtc(startsAtLocal).toISOString();
      const endsAt = endsAtLocal
        ? istanbulToUtc(endsAtLocal).toISOString()
        : null;
      const res = shoot
        ? await updateShoot({
            shootId: shoot.id,
            title,
            briefMd: brief,
            startsAt,
            ...(endsAt && { endsAt }),
            crew,
            vehicleId: vehicleId || null,
            equipmentIds,
            force,
          })
        : await createShoot({
            clientId,
            title,
            briefMd: brief,
            startsAt,
            endsAt,
            crew,
            vehicleId: vehicleId || null,
            equipmentIds,
            force,
          });
      if (!res.ok) {
        if (res.error === 'crew_busy') setWarning(true);
        else setError(CRITICAL_MESSAGES[res.error] ?? tr.errors.validation);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    save(false);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={shoot ? tr.common.edit : tr.production.newShoot}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <Field label={tr.card.client}>
          <Select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            disabled={!!shoot}
            required
            className="w-full"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={tr.card.title}>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={200}
            autoFocus
          />
        </Field>
        <Field label={tr.production.brief}>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={tr.production.leaveStart}>
            <Input
              type="datetime-local"
              value={startsAtLocal}
              onChange={(e) => setStartsAtLocal(e.target.value)}
              required
            />
          </Field>
          <Field label={tr.production.leaveEnd}>
            <Input
              type="datetime-local"
              value={endsAtLocal}
              onChange={(e) => setEndsAtLocal(e.target.value)}
            />
          </Field>
        </div>
        <p className="-mt-1 text-[11px] text-neutral-600">
          {tr.production.defaultBlock}
        </p>

        <div>
          <Label>{tr.production.crew}</Label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
            {profiles.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-neutral-300 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.04] has-[:checked]:bg-white/[0.06] has-[:checked]:text-neutral-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-300/40"
              >
                <input
                  type="checkbox"
                  checked={crew.includes(p.id)}
                  onChange={() => toggleCrew(p.id)}
                  className="accent-indigo-400 outline-none"
                />
                {p.full_name}
              </label>
            ))}
          </div>
        </div>

        <Field label={tr.production.vehicle}>
          <Select
            value={vehicleId}
            onChange={(e) => onVehicleChange(e.target.value)}
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

        {activeEquipment.length > 0 && (
          <div>
            <Label>{tr.fleetOps.shootEquipment}</Label>
            <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
              {activeEquipment.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-neutral-300 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-white/[0.04] has-[:checked]:bg-white/[0.06] has-[:checked]:text-neutral-100 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-indigo-300/40"
                >
                  <input
                    type="checkbox"
                    checked={equipmentIds.includes(item.id)}
                    onChange={() => toggleEquipment(item.id)}
                    className="accent-indigo-400 outline-none"
                  />
                  <span className="min-w-0 truncate">{item.name}</span>
                  {item.kind && (
                    <span className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.03] px-1.5 text-[10px] leading-4 text-neutral-500">
                      {item.kind}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
          <div className="flex items-center justify-between">
            <Label className="mb-0">{tr.production.suggestions}</Label>
            <Button
              type="button"
              variant="secondary"
              onClick={onSuggest}
              disabled={suggesting || !clientId}
            >
              {suggesting ? tr.common.processing : tr.production.suggestSlots}
            </Button>
          </div>
          {suggesting && (
            <ul aria-hidden className="mt-2 animate-pulse space-y-1">
              {[0, 1, 2].map((i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-2 py-1.5"
                >
                  <span className="h-2.5 w-24 rounded-full bg-white/[0.06]" />
                  <span className="h-2.5 flex-1 rounded-full bg-white/[0.04]" />
                </li>
              ))}
            </ul>
          )}
          {!suggesting && slots && (
            <ul className="stagger-children mt-2 max-h-36 space-y-1 overflow-y-auto">
              {slots.length === 0 && (
                <li className="rounded-lg border border-dashed border-white/10 bg-white/[0.02] px-2 py-2 text-center text-xs text-neutral-500">
                  {tr.common.none}
                </li>
              )}
              {slots.map((slot) => {
                const picked =
                  startsAtLocal === fmtIstanbul(slot.startsAt, LOCAL_FMT);
                return (
                  <li key={slot.startsAt + slot.crew.join(',')}>
                    <button
                      type="button"
                      onClick={() => applySuggestion(slot)}
                      className={`w-full rounded-lg border px-2 py-1.5 text-left text-xs outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-indigo-300/40 active:scale-[0.99] ${
                        picked
                          ? 'border-indigo-300/40 bg-indigo-400/[0.12] shadow-[0_0_0_3px_rgba(129,140,248,0.12)]'
                          : 'border-transparent text-neutral-300 hover:border-white/[0.08] hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1.5 font-medium tabular-nums text-neutral-100">
                        {picked && (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.8)]"
                          />
                        )}
                        {fmtIstanbul(slot.startsAt, 'd MMM HH:mm')}–
                        {fmtIstanbul(slot.endsAt, 'HH:mm')}
                      </span>{' '}
                      <span className="text-neutral-500">
                        {slot.reasons.join(' · ')}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="animate-enter rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        )}
        {warning && (
          <div
            role="alert"
            className="animate-enter rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <p className="text-sm text-amber-200">
              {tr.fleetOps.crewBusyWarning}
            </p>
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => save(true)}
                className="px-2.5 py-1 text-xs"
              >
                {tr.fleetOps.forceSave}
              </Button>
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tr.common.cancel}
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending
              ? tr.common.loading
              : shoot
                ? tr.common.save
                : tr.common.create}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
