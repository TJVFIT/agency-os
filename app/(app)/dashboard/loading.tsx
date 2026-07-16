/**
 * Dashboard route skeleton — mirrors the panel grid while the server
 * component fetches. Pure glass placeholders; motion comes from the
 * Tailwind pulse (disabled by the global prefers-reduced-motion rules).
 */

function PanelSkeleton({
  rows = 3,
  className = '',
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] ${className}`}
    >
      <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
        <header className="border-b border-white/[0.06] px-4 py-2.5">
          <div className="h-4 w-28 animate-pulse rounded-full bg-white/[0.06]" />
        </header>
        <div className="space-y-2 p-4">
          {Array.from({ length: rows }).map((_, i) => (
            <div
              key={i}
              className="h-10 animate-pulse rounded-xl border border-white/[0.04] bg-white/[0.03]"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-6" aria-busy>
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="h-7 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-32 animate-pulse rounded-full border border-white/[0.06] bg-white/[0.03]" />
          <div className="h-8 w-24 animate-pulse rounded-full bg-white/[0.08]" />
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-3">
        <PanelSkeleton rows={4} className="lg:col-span-2" />
        <PanelSkeleton rows={3} />
        <PanelSkeleton rows={3} className="lg:col-span-2" />
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={3} className="lg:col-span-2" />
        <PanelSkeleton rows={2} />
      </div>
    </div>
  );
}
