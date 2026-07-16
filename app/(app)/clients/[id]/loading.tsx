/**
 * Route-level loading skeleton for /clients/[id] — header, slug chip and the
 * two-column editor-panel grid as double-bezel glass ghosts.
 */
export default function ClientDetailLoading() {
  return (
    <div aria-busy className="animate-pulse p-4 md:p-6">
      {/* PageHeader ghost */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="h-7 w-44 rounded-lg bg-white/[0.06]" />
        <div className="h-8 w-28 rounded-full bg-white/[0.06]" />
      </div>

      {/* slug chip ghost */}
      <div className="mb-4 h-5 w-32 rounded-full bg-white/[0.05]" />

      {/* Editor-panel grid ghost */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]"
          >
            <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
                <div className="h-4 w-28 rounded bg-white/[0.06]" />
                <div className="h-7 w-20 rounded-full bg-white/[0.06]" />
              </div>
              <div className="space-y-3 p-4">
                <div className="h-3 w-20 rounded bg-white/[0.05]" />
                <div className="h-8 w-full rounded-lg bg-white/[0.04]" />
                <div className="h-3 w-24 rounded bg-white/[0.05]" />
                <div className="h-8 w-full rounded-lg bg-white/[0.04]" />
                <div className="h-8 w-2/3 rounded-lg bg-white/[0.04]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
