import { tr } from '@/lib/i18n/tr';

/** Skeleton block: soft glass tint with a pulse, hairline border.
 *  Radius comes from the caller so pills and tiles share one primitive. */
function Bone({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`animate-pulse border border-white/[0.05] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${className}`}
    />
  );
}

/**
 * /board loading state — mirrors the board layout (header, filter toolbar,
 * kanban columns) so the transition into real data is seamless.
 */
export default function BoardLoading() {
  // Varied card counts per skeleton column read as a believable board.
  const stacks = [3, 2, 4, 1, 2, 3, 1];

  return (
    <div className="p-4 md:p-6" role="status" aria-label={tr.common.loading}>
      {/* Page header: title + action pill. */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <Bone className="h-7 w-24 rounded-lg" />
        <Bone className="h-8 w-28 rounded-full" />
      </div>

      {/* Filter toolbar. */}
      <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <Bone className="h-8 w-28 rounded-lg" />
        <Bone className="h-8 w-28 rounded-lg" />
        <Bone className="hidden h-8 w-28 rounded-lg sm:block" />
        <Bone className="ml-auto h-6 w-12 rounded-full" />
      </div>

      {/* Kanban columns. */}
      <div className="flex gap-3 overflow-hidden pb-3">
        {stacks.map((count, i) => (
          <div key={i} className="flex w-64 shrink-0 flex-col">
            <div className="mb-2 flex items-center justify-between px-1">
              <Bone className="h-5 w-20 rounded-full" />
              <Bone className="h-4 w-7 rounded-full" />
            </div>
            <div className="flex min-h-44 flex-1 flex-col gap-2 rounded-2xl border border-white/[0.06] bg-gradient-to-b from-white/[0.02] to-white/[0.01] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              {Array.from({ length: count }).map((_, j) => (
                <Bone key={j} className="h-[72px] w-full rounded-xl" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">{tr.common.loading}</span>
    </div>
  );
}
