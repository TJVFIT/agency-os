import type { Metadata } from 'next';

import { loadApprovalView } from '@/lib/approvals/service';
import { fmtIstanbulDate } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';
import { ApprovalClient } from './approval-client';

// SPEC §10: token in URL only — never index.
export const metadata: Metadata = {
  title: tr.approval.pageTitle,
  robots: { index: false, follow: false },
};

export default async function ApprovePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await loadApprovalView(token);

  if (!view) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <p className="mt-20 text-neutral-300">{tr.approval.expired}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-4">
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
          <p className="text-xs text-neutral-400">
            {interpolate(tr.approval.weekOf, {
              date: fmtIstanbulDate(view.weekStart),
            })}
          </p>
        </div>
      </header>

      <ApprovalClient token={token} view={view} />
    </main>
  );
}
