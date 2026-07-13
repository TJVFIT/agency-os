import type { Metadata } from 'next';

import { Panel } from '@/components/ui';
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

  // Expired or unknown token — an intentional dead end, not an error dump.
  if (!view) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center px-4 py-10">
        <div className="animate-enter w-full max-w-sm">
          <Panel>
            <div className="flex flex-col items-center gap-4 py-6 text-center">
              <span
                aria-hidden
                className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
              >
                ⏳
              </span>
              <div className="space-y-1.5">
                <h1 className="text-sm font-semibold tracking-tight text-neutral-100">
                  {tr.approval.pageTitle}
                </h1>
                <p className="text-sm leading-relaxed text-neutral-400">
                  {tr.approval.expired}
                </p>
              </div>
            </div>
          </Panel>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6">
      <header className="animate-enter mb-5 flex items-center gap-3">
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.05] text-sm font-semibold text-neutral-200 shadow-[0_0_20px_rgba(129,140,248,0.18),inset_0_1px_0_rgba(255,255,255,0.08)]">
          {view.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.logoUrl}
              alt={view.clientName}
              className="h-full w-full object-cover"
            />
          ) : (
            view.clientName.charAt(0).toUpperCase()
          )}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold tracking-tight text-neutral-50">
            {view.clientName}
          </h1>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
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
