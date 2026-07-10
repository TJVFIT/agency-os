import type { Metadata } from 'next';

import { loadPortalView } from '@/lib/portal/service';
import { tr } from '@/lib/i18n/tr';
import { PortalClient } from './portal-client';

// UPGRADE_SPEC §2: token in URL only — never index (same as /approve).
export const metadata: Metadata = {
  title: tr.portal.title,
  robots: { index: false, follow: false },
};

export default async function PortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await loadPortalView(token);

  // Unknown or revoked token — clean dead end, no detail leaked.
  if (!view) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="mt-20 text-neutral-300">{tr.portal.linkInactive}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4 pb-16">
      <header className="mb-4 flex items-center gap-3">
        {view.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={view.logoUrl}
            alt={view.clientName}
            className="h-10 w-10 rounded-full object-cover"
          />
        )}
        <div>
          <h1 className="text-base font-semibold text-neutral-50">
            {view.clientName}
          </h1>
          <p className="text-xs text-neutral-400">{tr.portal.title}</p>
        </div>
      </header>

      <PortalClient token={token} view={view} />
    </main>
  );
}
