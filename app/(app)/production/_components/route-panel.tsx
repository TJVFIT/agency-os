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
          <div className="space-y-1">
            {route.stops.length === 0 ? (
              <p className="text-xs text-neutral-500">
                {tr.production.noShoots}
              </p>
            ) : (
              <ol className="space-y-1">
                {route.stops.map((stop) => (
                  <li
                    key={stop.id}
                    className="flex items-baseline justify-between gap-2 rounded bg-neutral-900 px-2 py-1 text-xs"
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
            )}
            {route.stops.length > 0 && (
              <p className="pt-1 text-xs font-medium text-neutral-300">
                {interpolate(tr.production.routeTotal, { km: route.totalKm })}{' '}
                <span className="text-neutral-500">
                  · {route.totalMinutes} dk
                </span>
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
