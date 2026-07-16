/**
 * Route-level loading skeleton for /finance — mirrors the page scaffold
 * (header row, tab pill, card grid) in quiet glass placeholders so the
 * layout doesn't jump when the server component resolves.
 */
export default function FinanceLoading() {
  return (
    <div aria-busy className="animate-pulse p-4 md:p-6">
      {/* PageHeader ghost */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="h-7 w-32 rounded-lg bg-white/[0.06]" />
        <div className="h-8 w-28 rounded-full bg-white/[0.06]" />
      </div>

      {/* Tab pill ghost */}
      <div className="mb-4 inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5">
        <div className="h-8 w-20 rounded-full bg-white/[0.08]" />
        <div className="h-8 w-20 rounded-full bg-transparent" />
        <div className="h-8 w-20 rounded-full bg-transparent" />
      </div>

      {/* Card grid ghost */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px"
          >
            <div className="space-y-4 rounded-[calc(1rem-1px)] bg-[#0a0a0b] p-4">
              <div className="h-4 w-2/3 rounded bg-white/[0.06]" />
              <div className="h-6 w-24 rounded bg-white/[0.08]" />
              <div className="space-y-2.5">
                {[0, 1, 2, 3].map((j) => (
                  <div key={j}>
                    <div className="mb-1 flex items-center justify-between">
                      <div className="h-3 w-16 rounded bg-white/[0.05]" />
                      <div className="h-3 w-8 rounded bg-white/[0.05]" />
                    </div>
                    <div className="h-1.5 rounded-full bg-white/[0.06]" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
