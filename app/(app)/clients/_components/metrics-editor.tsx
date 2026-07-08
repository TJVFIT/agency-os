'use client';

import { useMemo, useState, useTransition } from 'react';

import { Button, Input, Panel } from '@/components/ui';
import { saveReportMetrics } from '@/lib/actions/reports';
import type { Report } from '@/lib/db/types';
import { istanbulDateString, istanbulWeekStart } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';

import { SaveIndicator, type SaveState } from './save-state';

type MetricRow = { key: string; value: string };

/** yyyy-MM-dd for the Monday of the week containing `now` (Istanbul). */
function currentWeekStart(): string {
  return istanbulDateString(istanbulWeekStart());
}

function metricsToRows(metrics: unknown): MetricRow[] {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics))
    return [];
  return Object.entries(metrics as Record<string, unknown>).map(
    ([key, value]) => ({ key, value: String(value ?? '') }),
  );
}

export function MetricsEditor({
  clientId,
  reports,
  canManage,
}: {
  clientId: string;
  reports: Report[];
  canManage: boolean;
}) {
  const [weekStart, setWeekStart] = useState(currentWeekStart());
  const [rows, setRows] = useState<MetricRow[]>([{ key: '', value: '' }]);
  const [state, setState] = useState<SaveState>('idle');
  const [pending, startTransition] = useTransition();

  const existing = useMemo(
    () => reports.find((r) => r.week_start === weekStart),
    [reports, weekStart],
  );

  // Load existing metrics for the picked week into the form.
  function pickWeek(value: string) {
    setWeekStart(value);
    const found = reports.find((r) => r.week_start === value);
    const loaded = metricsToRows(found?.metrics);
    setRows(loaded.length ? loaded : [{ key: '', value: '' }]);
    setState('idle');
  }

  function update(i: number, patch: Partial<MetricRow>) {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function save() {
    setState('saving');
    const metrics: Record<string, string | number> = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      const num = Number(r.value);
      metrics[k] = r.value.trim() !== '' && !Number.isNaN(num) ? num : r.value;
    }
    startTransition(async () => {
      const res = await saveReportMetrics({ clientId, weekStart, metrics });
      setState(res.ok ? 'saved' : 'error');
    });
  }

  return (
    <Panel
      title={tr.clients.metrics}
      className="lg:col-span-2"
      actions={
        canManage ? (
          <div className="flex items-center gap-2">
            <SaveIndicator state={state} />
            <Button variant="primary" onClick={save} disabled={pending}>
              {tr.common.save}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Entry */}
        <div className="space-y-3">
          <div>
            <span className="mb-1 block text-xs font-medium text-neutral-400">
              {tr.clients.metricsEntry}
            </span>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => pickWeek(e.target.value)}
              disabled={!canManage}
            />
            {existing && (
              <p className="mt-1 text-[11px] text-neutral-500">
                {tr.common.saved}
              </p>
            )}
          </div>

          {canManage ? (
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={row.key}
                    onChange={(e) => update(i, { key: e.target.value })}
                    placeholder="reach, likes, saves…"
                    className="flex-1"
                  />
                  <Input
                    value={row.value}
                    onChange={(e) => update(i, { value: e.target.value })}
                    placeholder="0"
                    className="w-28"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="shrink-0 px-1 py-2 text-xs text-neutral-500 hover:text-red-400"
                    aria-label={tr.common.remove}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setRows((prev) => [...prev, { key: '', value: '' }])
                }
              >
                {tr.common.add}
              </Button>
            </div>
          ) : (
            <p className="text-xs text-neutral-500">{tr.common.forbidden}</p>
          )}
        </div>

        {/* History */}
        <div>
          <span className="mb-1 block text-xs font-medium text-neutral-400">
            {tr.clients.reportsHistory}
          </span>
          {reports.length === 0 ? (
            <p className="text-xs text-neutral-500">{tr.clients.noReports}</p>
          ) : (
            <ul className="space-y-2">
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="rounded-md border border-neutral-800 bg-neutral-950 p-2.5"
                >
                  <div className="mb-1 font-mono text-xs text-neutral-400">
                    {r.week_start}
                  </div>
                  {metricsToRows(r.metrics).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {metricsToRows(r.metrics).map((m) => (
                        <span
                          key={m.key}
                          className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] text-neutral-300"
                        >
                          {m.key}: {m.value}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.body_md && (
                    <p className="mt-2 whitespace-pre-wrap text-xs text-neutral-300">
                      {r.body_md}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
