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
    <Panel
      title={tr.production.route}
      className="animate-enter self-start xl:sticky xl:top-4"
    >
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

        {error && (
          <p
            role="alert"
            className="animate-enter rounded-xl border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200"
          >
            {error}
          </p>
        )}

        {pending && (
          <ul aria-hidden className="animate-pulse space-y-1.5">
            {[0, 1, 2].map((i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-white/[0.04] bg-white/[0.02] px-2.5 py-1.5"
              >
                <span className="h-5 w-5 shrink-0 rounded-full bg-white/[0.06]" />
                <span className="h-2.5 flex-1 rounded-full bg-white/[0.05]" />
                <span className="h-2.5 w-12 rounded-full bg-white/[0.04]" />
              </li>
            ))}
          </ul>
        )}

        {!pending && !route && !error && (
          <p className="text-[11px] leading-relaxed text-neutral-600">
            {tr.production.locationHint}
          </p>
        )}

        {!pending && route && (
          <div className="animate-enter space-y-2">
            {route.stops.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-center">
                <span
                  aria-hidden
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-base shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                >
                  🗺️
                </span>
                <p className="text-xs leading-relaxed text-neutral-500">
                  {route.skipped > 0
                    ? interpolate(tr.production.routeSkipped, {
                        n: route.skipped,
                      })
                    : tr.production.noShoots}
                </p>
              </div>
            ) : (
              <ol className="stagger-children space-y-1.5">
                {route.stops.map((stop) => (
                  <li
                    key={stop.id}
                    className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2.5 py-1.5 text-xs transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.10] hover:bg-white/[0.05]"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-[10px] font-semibold tabular-nums text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      {stop.order}
                    </span>
                    <span className="flex-1 truncate text-neutral-200">
                      {stop.name}
                    </span>
                    <span className="whitespace-nowrap tabular-nums text-neutral-500">
                      {stop.legKm} km · {stop.etaMinutes} dk
                    </span>
                  </li>
                ))}
              </ol>
            )}
            {route.stops.length > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-white/[0.08] bg-white/[0.05] px-2.5 py-1.5 text-xs font-medium text-neutral-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <span className="tabular-nums">
                  {interpolate(tr.production.routeTotal, {
                    km: route.totalKm,
                  })}
                </span>
                <span className="tabular-nums text-neutral-500">
                  {route.totalMinutes} dk
                </span>
              </div>
            )}
            {route.stops.length > 0 && route.skipped > 0 && (
              <p className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200">
                {interpolate(tr.production.routeSkipped, { n: route.skipped })}
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
