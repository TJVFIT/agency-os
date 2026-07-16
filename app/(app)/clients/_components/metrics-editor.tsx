'use client';

import { useMemo, useState, useTransition } from 'react';

import { Button, Input, Label, Panel } from '@/components/ui';
import { saveReportMetrics } from '@/lib/actions/reports';
import type { Report } from '@/lib/db/types';
import { istanbulDateString, istanbulWeekStart } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';

import { CountChip, EmptyState } from './empty-state';
import { SaveIndicator, type SaveState } from './save-state';

type MetricRow = { key: string; value: string };

/** yyyy-MM-dd for the Monday of the week containing `now` (Istanbul). */
function currentWeekStart(): string {
  return istanbulDateString(istanbulWeekStart());
}

function metricsToRows(metrics: unknown): MetricRow[] {
  if (!metrics || typeof metrics !== 'object' || Array.isArray(metrics))
    return [];
  return (
    Object.entries(metrics as Record<string, unknown>)
      // Only scalar entries are manually editable. The cron auto-fills nested
      // objects (publishes/quota/payments) that are narrated in body_md — they
      // must not surface here, where String(value) would print '[object Object]'
      // and a re-save would corrupt them.
      .filter(([, value]) => value === null || typeof value !== 'object')
      .map(([key, value]) => ({ key, value: String(value ?? '') }))
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
            <Label>{tr.clients.metricsEntry}</Label>
            <Input
              type="date"
              value={weekStart}
              onChange={(e) => pickWeek(e.target.value)}
              disabled={!canManage}
              className="tabular-nums"
            />
            {existing && (
              <p className="mt-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-medium text-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                  {tr.common.saved}
                </span>
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
                    className="w-28 tabular-nums"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setRows((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] text-neutral-600 transition-colors duration-300 hover:bg-red-400/10 hover:text-red-300"
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
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
              {tr.clients.reportsHistory}
            </span>
            <CountChip value={reports.length} />
          </div>
          {reports.length === 0 ? (
            <EmptyState compact icon="📊" text={tr.clients.noReports} />
          ) : (
            <ul className="stagger-children max-h-96 space-y-2 overflow-y-auto pr-1">
              {reports.map((r) => (
                <li
                  key={r.id}
                  className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-colors duration-300 hover:border-white/[0.12]"
                >
                  <div className="mb-1.5 font-mono text-xs tabular-nums text-neutral-400">
                    {r.week_start}
                  </div>
                  {metricsToRows(r.metrics).length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {metricsToRows(r.metrics).map((m) => (
                        <span
                          key={m.key}
                          className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[11px] tabular-nums text-neutral-300"
                        >
                          {m.key}: {m.value}
                        </span>
                      ))}
                    </div>
                  )}
                  {r.body_md && (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">
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
