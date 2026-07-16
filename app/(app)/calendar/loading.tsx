/**
 * Calendar route skeleton — mirrors the month grid + unscheduled tray while
 * the server component fetches. Pure glass placeholders; the pulse motion is
 * disabled by the global prefers-reduced-motion rules in globals.css.
 */

export default function CalendarLoading() {
  return (
    <div className="p-4 md:p-6" aria-busy>
      {/* Page header: title + client filter + view toggle */}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="h-7 w-24 animate-pulse rounded-lg bg-white/[0.06]" />
        <div className="flex items-center gap-2">
          <div className="h-8 w-36 animate-pulse rounded-lg border border-white/[0.06] bg-white/[0.03]" />
          <div className="h-8 w-28 animate-pulse rounded-full border border-white/[0.06] bg-white/[0.03]" />
        </div>
      </header>

      {/* Period toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="h-8 w-44 animate-pulse rounded-full border border-white/[0.06] bg-white/[0.03]" />
        <div className="h-8 w-16 animate-pulse rounded-full bg-white/[0.04]" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_260px]">
        {/* Month grid */}
        <div className="min-w-0 space-y-1.5">
          <div className="grid grid-cols-7 gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="h-3 w-8 max-w-full animate-pulse rounded-full bg-white/[0.05]"
              />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, w) => (
            <div key={w} className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: 7 }).map((_, d) => (
                <div
                  key={d}
                  className="min-h-28 animate-pulse rounded-lg border border-white/[0.05] bg-white/[0.02]"
                  style={{ animationDelay: `${(w * 7 + d) * 18}ms` }}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Unscheduled tray */}
        <section className="self-start rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)]">
          <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
            <header className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
              <div className="h-4 w-28 animate-pulse rounded-full bg-white/[0.06]" />
              <div className="h-4 w-8 animate-pulse rounded-full bg-white/[0.05]" />
            </header>
            <div className="space-y-2 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-xl border border-white/[0.04] bg-white/[0.03]"
                  style={{ animationDelay: `${i * 120}ms` }}
                />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
