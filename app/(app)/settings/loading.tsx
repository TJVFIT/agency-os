/**
 * Route-level skeleton for /settings — mirrors the panel grid (profile,
 * telegram, provider health, admin panels) while server data loads.
 * Pulse respects prefers-reduced-motion via `motion-safe:`.
 */
export default function SettingsLoading() {
  return (
    <div className="p-4 md:p-6" aria-busy="true">
      <div className="mb-5 flex items-center justify-between">
        <div className="h-7 w-32 rounded-lg bg-white/[0.06] motion-safe:animate-pulse" />
        <div className="h-6 w-20 rounded-full bg-white/[0.05] motion-safe:animate-pulse" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelSkeleton lines={3} />
        <PanelSkeleton lines={2} />
        <PanelSkeleton lines={4} className="lg:col-span-2" tiles />
        <PanelSkeleton lines={3} className="lg:col-span-2" />
      </div>
    </div>
  );
}

/** Double-bezel panel shell (same recipe as components/ui Panel) filled with
 *  pulsing placeholder bars — and an optional stat-tile row. */
function PanelSkeleton({
  lines,
  tiles = false,
  className = '',
}: {
  lines: number;
  tiles?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl bg-gradient-to-b from-white/[0.09] via-white/[0.04] to-white/[0.02] p-px shadow-[0_12px_40px_-12px_rgba(0,0,0,0.6)] ${className}`}
    >
      <div className="rounded-[calc(1rem-1px)] bg-[#0a0a0b]">
        <header className="border-b border-white/[0.06] px-4 py-3">
          <div className="h-4 w-28 rounded bg-white/[0.06] motion-safe:animate-pulse" />
        </header>
        <div className="flex flex-col gap-2.5 p-4">
          {tiles && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-14 rounded-xl border border-white/[0.06] bg-white/[0.03] motion-safe:animate-pulse"
                />
              ))}
            </div>
          )}
          {Array.from({ length: lines }).map((_, i) => (
            <div
              key={i}
              className="h-3.5 rounded bg-white/[0.05] motion-safe:animate-pulse"
              style={{ width: `${88 - i * 16}%` }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
