'use client';

import { useState, useTransition } from 'react';

import { Button, Field, Input, Panel, Select } from '@/components/ui';
import {
  suggestRouteForDay,
  type RouteSuggestionDTO,
} from '@/lib/actions/production';
import { istanbulDateString } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';

import type { VehicleRow } from './types';

/**
 * Day + vehicle → nearest-neighbor stop order (lib/scheduling.suggestRoute
 * via server action). Depot = first shoot's location or Ankara center.
 */
export function RoutePanel({
  vehicles,
}: {
  vehicles: Pick<VehicleRow, 'id' | 'name' | 'active'>[];
}) {
  const [day, setDay] = useState(istanbulDateString(new Date()));
  const [vehicleId, setVehicleId] = useState('');
  const [route, setRoute] = useState<RouteSuggestionDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSuggest() {
    setError(null);
    startTransition(async () => {
      const res = await suggestRouteForDay({
        day,
        vehicleId: vehicleId || null,
      });
      if (!res.ok) {
        setError(tr.errors.generic);
        return;
      }
      setRoute(res.data ?? null);
    });
  }

  return (
    <Panel title={tr.production.route}>
      <div className="space-y-3">
        <Field label={tr.common.today}>
          <Input
            type="date"
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <Field label={tr.production.vehicle}>
          <Select
            value={vehicleId}
            onChange={(e) => setVehicleId(e.target.value)}
            className="w-full"
          >
            <option value="">{tr.common.all}</option>
            {vehicles
              .filter((v) => v.active)
              .map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
          </Select>
        </Field>
        <Button
          variant="secondary"
          onClick={onSuggest}
          disabled={pending}
          className="w-full"
        >
          {pending ? tr.common.processing : tr.production.route}
        </Button>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {route && (
          <div className="animate-enter space-y-2">
            {route.stops.length === 0 ? (
              <p className="text-xs text-neutral-500">
                {route.skipped > 0
                  ? interpolate(tr.production.routeSkipped, {
                      n: route.skipped,
                    })
                  : tr.production.noShoots}
              </p>
            ) : (
              <ol className="stagger-children space-y-1.5">
                {route.stops.map((stop) => (
                  <li
                    key={stop.id}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.10] hover:bg-white/[0.05]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[10px] font-semibold text-neutral-300">
                      {stop.order}
                    </span>
                    <span className="flex-1 truncate text-neutral-200">
                      {stop.name}
                    </span>
                    <span className="whitespace-nowrap text-neutral-500">
                      {stop.legKm} km · {stop.etaMinutes} dk
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {route.stops.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-neutral-200">
                <span>
                  {interpolate(tr.production.routeTotal, {
                    km: route.totalKm,
                  })}
                </span>
                <span className="text-neutral-500">
                  {route.totalMinutes} dk
                </span>
              </div>
            )}
            {route.stops.length > 0 && route.skipped > 0 && (
              <p className="text-[11px] text-amber-300/80">
                {interpolate(tr.production.routeSkipped, { n: route.skipped })}
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
