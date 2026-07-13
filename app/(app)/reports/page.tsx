import { PageHeader, Panel } from '@/components/ui';
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

  let query = supabase
    .from('reports')
    .select('id, client_id, week_start, body_md, created_at, clients(name)')
    .order('week_start', { ascending: false });
  if (client) query = query.eq('client_id', client);

  const { data } = await query;
  const reports = (data ?? []) as unknown as ReportRow[];

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.reports.title}>
        <ClientFilter clients={clients} />
      </PageHeader>

      {reports.length === 0 ? (
        <Panel className="animate-enter">
          <p className="py-6 text-center text-sm text-neutral-500">
            {tr.reports.empty}
          </p>
        </Panel>
      ) : (
        <div className="stagger-children space-y-4">
          {reports.map((r) => (
            <Panel
              key={r.id}
              title={r.clients?.name ?? tr.common.unknown}
              actions={
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-medium tabular-nums text-neutral-400">
                  {interpolate(tr.reports.weekOf, {
                    date: fmtIstanbulDate(r.week_start),
                  })}
                </span>
              }
            >
              <ReportBody markdown={r.body_md} />
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
