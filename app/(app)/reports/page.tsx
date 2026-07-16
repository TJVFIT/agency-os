import type { ReactNode } from 'react';

import { PageHeader } from '@/components/ui';
import { createSupabaseServer } from '@/lib/supabase/server';
import { fmtIstanbulDate } from '@/lib/dates';
import { tr, interpolate } from '@/lib/i18n/tr';

import { ClientFilter } from './_components/client-filter';
import { ReportBody } from './_components/report-body';

export const metadata = { title: `${tr.reports.title} — ${tr.appName}` };

type ReportRow = {
  id: string;
  client_id: string;
  week_start: string;
  body_md: string;
  created_at: string;
  clients: { name: string } | null;
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  const { client } = await searchParams;
  const supabase = await createSupabaseServer();

  // Distinct clients that actually have reports, for the filter dropdown.
  const { data: clientRows } = await supabase
    .from('clients')
    .select('id, name')
    .order('name');
  const clients = clientRows ?? [];

  // Hide not-yet-written rows: the cron pre-creates a metrics-only report row
  // before the LLM fills body_md, and in suggest mode / on AI failure that row
  // can linger with an empty body — it must not render as a blank 'none' panel.
  let query = supabase
    .from('reports')
    .select('id, client_id, week_start, body_md, created_at, clients(name)')
    .neq('body_md', '')
    .order('week_start', { ascending: false });
  if (client) query = query.eq('client_id', client);

  const { data } = await query;
  const reports = (data ?? []) as unknown as ReportRow[];

  // Presentational grouping only: rows already arrive sorted newest-week
  // first, so Map insertion order keeps the sections in that same order.
  const byWeek = new Map<string, ReportRow[]>();
  for (const r of reports) {
    const rows = byWeek.get(r.week_start);
    if (rows) rows.push(r);
    else byWeek.set(r.week_start, [r]);
  }

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.reports.title}>
        {reports.length > 0 && (
          <span
            aria-label={tr.reports.title}
            className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium tabular-nums text-neutral-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            {reports.length}
          </span>
        )}
        <ClientFilter clients={clients} />
      </PageHeader>

      {reports.length === 0 ? (
        <ReportsEmptyState />
      ) : (
        <div className="stagger-children space-y-7">
          {[...byWeek.entries()].map(([week, rows]) => (
            <section key={week}>
              <div className="mb-3 flex items-center gap-3">
                <h2 className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-500">
                  {interpolate(tr.reports.weekOf, {
                    date: fmtIstanbulDate(week),
                  })}
                </h2>
                <span
                  aria-hidden
                  className="h-px min-w-4 flex-1 bg-gradient-to-r from-white/[0.08] to-transparent"
                />
                <span className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.04] px-2 py-px text-[10px] font-medium tabular-nums text-neutral-500">
                  {rows.length}
                </span>
              </div>

              <div className="stagger-children grid items-start gap-4 lg:grid-cols-2">
                {rows.map((r) => (
                  <ReportCard
                    key={r.id}
                    clientName={r.clients?.name ?? tr.common.unknown}
                    weekLabel={interpolate(tr.reports.weekOf, {
                      date: fmtIstanbulDate(r.week_start),
                    })}
                  >
                    <ReportBody markdown={r.body_md} />
                  </ReportCard>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Route-private glass card: double-bezel shell (gradient hairline around a
 * solid core), client monogram orb, quiet week chip, spring hover lift.
 */
function ReportCard({
  clientName,
  weekLabel,
  children,
}: {
  clientName: string;
  weekLabel: string;
  children: ReactNode;
}) {
  const monogram = clientName.trim().charAt(0).toLocaleUpperCase('tr-TR');
  return (
    <article className="rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:from-white/[0.14] hover:shadow-[0_20px_56px_-16px_rgba(0,0,0,0.75)]">
      <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-[11px] font-semibold text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
            >
              {monogram || '•'}
            </span>
            <h3 className="truncate text-sm font-semibold tracking-tight text-neutral-200">
              {clientName}
            </h3>
          </div>
          <span className="shrink-0 rounded-full border border-white/[0.06] bg-white/[0.04] px-2.5 py-1 text-[10px] font-medium tabular-nums text-neutral-500">
            {weekLabel}
          </span>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </article>
  );
}

/** Designed empty state: dashed glass shell, radial glow, document orb. */
function ReportsEmptyState() {
  return (
    <div className="animate-enter relative flex flex-col items-center gap-3 overflow-hidden rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(22rem_12rem_at_50%_-3rem,rgba(129,140,248,0.09),transparent_70%)]"
      />
      <span
        aria-hidden
        className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] text-neutral-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_28px_rgba(129,140,248,0.14)]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6"
        >
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6" />
          <path d="M9 17h4" />
        </svg>
      </span>
      <p className="relative max-w-sm text-sm leading-relaxed text-neutral-400">
        {tr.reports.empty}
      </p>
    </div>
  );
}
