import Link from 'next/link';

import { PageHeader } from '@/components/ui';
import { getSessionProfile } from '@/lib/auth';
import { listClients } from '@/lib/db/queries';
import type { ClientColors } from '@/lib/db/domain';
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
        <p className="animate-enter text-sm text-neutral-500">
          {tr.common.notFound}
        </p>
      ) : (
        <ul className="stagger-children grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const primary =
              (c.colors as ClientColors | null)?.primary ?? '#525252';
            return (
              <li key={c.id}>
                <Link
                  href={`/clients/${c.id}`}
                  className="group relative block overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.06] hover:shadow-[0_8px_24px_-8px_rgba(0,0,0,0.7)]"
                >
                  {/* client accent: hairline bar that brightens on hover — echoes CardTile */}
                  <span
                    aria-hidden
                    className="absolute inset-y-3 left-0 w-[2.5px] rounded-full opacity-60 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: primary,
                      boxShadow: `0 0 12px ${primary}66`,
                    }}
                  />
                  <div className="pl-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate text-sm font-semibold tracking-tight text-neutral-100">
                          {c.name}
                        </h2>
                        <p className="mt-0.5 truncate font-mono text-xs text-neutral-500">
                          {c.slug}
                        </p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                          c.active
                            ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                            : 'border-white/[0.06] bg-white/[0.02] text-neutral-500'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            c.active
                              ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
                              : 'bg-neutral-600'
                          }`}
                        />
                        {c.active ? tr.clients.active : tr.clients.inactive}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {c.langs.map((l) => (
                        <span
                          key={l}
                          className="rounded-md border border-white/10 bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-medium uppercase text-neutral-300"
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
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
