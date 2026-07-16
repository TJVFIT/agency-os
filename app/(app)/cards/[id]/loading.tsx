/** Route-level skeleton for the workroom — mirrors the real layout so the
 * page doesn't jump when data lands. Purely presentational. */

function Shimmer({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-white/[0.05] ${className}`}
      aria-hidden
    />
  );
}

function PanelSkeleton({
  bodyClassName = '',
  children,
}: {
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
      <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
        <header className="border-b border-white/[0.06] px-4 py-2.5">
          <Shimmer className="h-4 w-24" />
        </header>
        <div className={`space-y-3 p-4 ${bodyClassName}`}>{children}</div>
      </div>
    </section>
  );
}

export default function CardLoading() {
  return (
    <div className="p-4 md:p-6" aria-busy="true">
      {/* Breadcrumb */}
      <div className="animate-enter mb-4">
        <Shimmer className="h-3.5 w-36" />
      </div>

      {/* Header panel */}
      <div className="animate-enter rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
        <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b] p-4">
          <div className="mb-3 flex gap-2">
            <Shimmer className="h-5 w-24 rounded-full" />
            <Shimmer className="h-5 w-16 rounded-full" />
            <Shimmer className="h-5 w-20 rounded-full" />
          </div>
          <Shimmer className="h-7 w-2/3" />
          <div className="mt-4 flex gap-6 border-t border-white/[0.06] pt-3">
            <Shimmer className="h-6 w-32" />
            <Shimmer className="hidden h-6 w-28 sm:block" />
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="stagger-children space-y-4 lg:col-span-2">
          {/* Content tabs */}
          <PanelSkeleton>
            <Shimmer className="h-3 w-16" />
            <Shimmer className="h-32 w-full rounded-xl" />
            <Shimmer className="h-3 w-24" />
            <Shimmer className="h-12 w-full rounded-xl" />
            <div className="flex justify-end border-t border-white/[0.06] pt-3">
              <Shimmer className="h-8 w-24 rounded-full" />
            </div>
          </PanelSkeleton>

          {/* AI actions */}
          <PanelSkeleton>
            <Shimmer className="h-3 w-14" />
            <Shimmer className="h-12 w-full rounded-xl" />
            <div className="flex gap-2">
              <Shimmer className="h-8 w-28 rounded-full" />
              <Shimmer className="h-8 w-20 rounded-full" />
              <Shimmer className="h-8 w-24 rounded-full" />
            </div>
          </PanelSkeleton>
        </div>

        <div className="stagger-children space-y-4">
          {/* Status controls */}
          <PanelSkeleton>
            <Shimmer className="h-5 w-24 rounded-full" />
            <Shimmer className="h-9 w-full rounded-full" />
            <Shimmer className="h-9 w-full rounded-full" />
          </PanelSkeleton>

          {/* Comments */}
          <PanelSkeleton>
            <div className="flex gap-2.5">
              <Shimmer className="h-6 w-6 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3 w-28" />
                <Shimmer className="h-3 w-full" />
              </div>
            </div>
            <div className="flex gap-2.5">
              <Shimmer className="h-6 w-6 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Shimmer className="h-3 w-24" />
                <Shimmer className="h-3 w-4/5" />
              </div>
            </div>
            <Shimmer className="h-12 w-full rounded-xl" />
          </PanelSkeleton>
        </div>
      </div>
    </div>
  );
}
