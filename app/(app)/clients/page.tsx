import Link from 'next/link';

import { PageHeader } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { listClients } from '@/lib/db/queries';
import { tr } from '@/lib/i18n/tr';
import { NewClientDialog } from './_components/new-client-dialog';

export default async function ClientsPage() {
  const session = await getSessionProfile();
  const clients = await listClients();
  const isAdmin = session?.role === 'admin';

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.clients.title}>
        {isAdmin && <NewClientDialog />}
      </PageHeader>

      {clients.length === 0 ? (
        <p className="text-sm text-neutral-500">{tr.common.notFound}</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <li key={c.id}>
              <Link
                href={`/clients/${c.id}`}
                className="block rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 transition-colors hover:border-neutral-700 hover:bg-neutral-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-neutral-100">
                      {c.name}
                    </h2>
                    <p className="mt-0.5 truncate font-mono text-xs text-neutral-500">
                      {c.slug}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                      c.active
                        ? 'bg-emerald-950 text-emerald-300'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {c.active ? tr.clients.active : tr.clients.inactive}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {c.langs.map((l) => (
                    <span
                      key={l}
                      className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] uppercase text-neutral-300"
                    >
                      {l}
                    </span>
                  ))}
                  {c.industry && (
                    <span className="text-xs text-neutral-500">
                      · {c.industry}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
