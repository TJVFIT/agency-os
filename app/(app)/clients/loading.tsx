/**
 * Route-level loading skeleton for /clients — mirrors the header row and the
 * client-card grid in quiet glass placeholders so layout doesn't jump.
 */
export default function ClientsLoading() {
  return (
    <div aria-busy className="animate-pulse p-4 md:p-6">
      {/* PageHeader ghost */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="h-7 w-36 rounded-lg bg-white/[0.06]" />
        <div className="flex items-center gap-2">
          <div className="h-5 w-9 rounded-full bg-white/[0.05]" />
          <div className="h-8 w-28 rounded-full bg-white/[0.06]" />
        </div>
      </div>

      {/* Client-card grid ghost */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          >
            <div className="flex items-start justify-between gap-2 pl-2.5">
              <div className="space-y-2">
                <div className="h-4 w-28 rounded bg-white/[0.07]" />
                <div className="h-3 w-20 rounded bg-white/[0.05]" />
              </div>
              <div className="h-5 w-14 rounded-full bg-white/[0.06]" />
            </div>
            <div className="mt-4 flex gap-1.5 pl-2.5">
              <div className="h-5 w-9 rounded-full bg-white/[0.05]" />
              <div className="h-5 w-9 rounded-full bg-white/[0.05]" />
              <div className="h-5 w-16 rounded-full bg-white/[0.04]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
