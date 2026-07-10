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
  ProfileOption,
  ShootRow,
  VehicleRow,
} from './types';

const LOCAL_FMT = "yyyy-MM-dd'T'HH:mm";

/**
 * Create/edit shoot form. Fully controlled so "Zaman öner" suggestions can
 * fill start time + crew + vehicle with one click.
 */
export function ShootDialog({
  clients,
  profiles,
  vehicles,
  shoot,
  open,
  onClose,
}: {
  clients: ClientOption[];
  profiles: ProfileOption[];
  vehicles: Pick<VehicleRow, 'id' | 'name' | 'active'>[];
  /** When set, the dialog edits this shoot instead of creating one. */
  shoot?: ShootRow;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suggesting, startSuggesting] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
  const [slots, setSlots] = useState<SlotSuggestionDTO[] | null>(null);

  const activeVehicles = vehicles.filter((v) => v.active || v.id === vehicleId);

  function toggleCrew(id: string) {
    setCrew((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
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
      });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      setSlots(res.data ?? []);
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
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
          })
        : await createShoot({
            clientId,
            title,
            briefMd: brief,
            startsAt,
            endsAt,
            crew,
            vehicleId: vehicleId || null,
          });
      if (!res.ok) {
        setError(tr.errors.validation);
        return;
      }
      onClose();
      router.refresh();
    });
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
        <p className="text-xs text-neutral-500">{tr.production.defaultBlock}</p>

        <div>
          <Label>{tr.production.crew}</Label>
          <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-neutral-800 p-2">
            {profiles.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 text-sm text-neutral-200"
              >
                <input
                  type="checkbox"
                  checked={crew.includes(p.id)}
                  onChange={() => toggleCrew(p.id)}
                  className="accent-neutral-100"
                />
                {p.full_name}
              </label>
            ))}
          </div>
        </div>

        <Field label={tr.production.vehicle}>
          <Select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
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

        <div className="rounded-md border border-neutral-800 p-2">
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
          {slots && (
            <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto">
              {slots.length === 0 && (
                <li className="text-xs text-neutral-500">{tr.common.none}</li>
              )}
              {slots.map((slot) => (
                <li key={slot.startsAt + slot.crew.join(',')}>
                  <button
                    type="button"
                    onClick={() => applySuggestion(slot)}
                    className="w-full rounded px-2 py-1 text-left text-xs text-neutral-300 hover:bg-neutral-800"
                  >
                    <span className="font-medium text-neutral-100">
                      {fmtIstanbul(slot.startsAt, 'd MMM HH:mm')}–
                      {fmtIstanbul(slot.endsAt, 'HH:mm')}
                    </span>{' '}
                    <span className="text-neutral-500">
                      {slot.reasons.join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
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
