import { tr } from '@/lib/i18n/tr';

/**
 * Route-segment skeleton shown while the server page queries reports.
 * Mirrors the real layout (header + filter, week label, two-up card grid)
 * so the swap-in does not shift content. Pulse collapses to a static state
 * under prefers-reduced-motion via the global animation override.
 */
export default function ReportsLoading() {
  return (
    <div aria-busy="true" className="p-4 md:p-6">
      <span className="sr-only">{tr.common.loading}</span>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="h-7 w-32 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="h-[34px] w-[168px] animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.03]" />
      </div>

      <div className="space-y-7">
        {[0, 1].map((section) => (
          <section key={section}>
            <div className="mb-3 flex items-center gap-3">
              <div className="h-3 w-36 animate-pulse rounded bg-white/[0.05]" />
              <div className="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent" />
            </div>

            <div className="grid items-start gap-4 lg:grid-cols-2">
              {[0, 1].map((card) => (
                <div
                  key={card}
                  className="rounded-2xl bg-gradient-to-b from-white/[0.07] via-white/[0.03] to-white/[0.02] p-px"
                >
                  <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
                    <div className="flex items-center justify-between gap-3 border-b border-white/[0.06] px-4 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 animate-pulse rounded-full bg-white/[0.06]" />
                        <div className="h-3.5 w-28 animate-pulse rounded bg-white/[0.06]" />
                      </div>
                      <div className="h-5 w-24 animate-pulse rounded-full bg-white/[0.04]" />
                    </div>
                    <div className="space-y-3 p-4">
                      <div className="h-3 w-24 animate-pulse rounded bg-white/[0.05]" />
                      <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
                      <div className="h-3 w-11/12 animate-pulse rounded bg-white/[0.04]" />
                      <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.04]" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
