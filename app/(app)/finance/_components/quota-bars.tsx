/**
 * Per-type quota usage bars for a package card. Pure presentational —
 * the page computes {used, quota, pct} via lib/finance compareQuota.
 */

export interface QuotaBarItem {
  key: string;
  label: string;
  used: number;
  quota: number;
  pct: number;
  over: boolean;
}

export function QuotaBars({ items }: { items: QuotaBarItem[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((it) => (
        <div key={it.key}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-neutral-400">{it.label}</span>
            <span
              className={`font-mono tabular-nums ${
                it.over ? 'font-medium text-red-300' : 'text-neutral-400'
              }`}
            >
              {it.used}/{it.quota}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)]">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                it.over
                  ? 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.5)]'
                  : it.pct >= 100
                    ? 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
                    : 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]'
              }`}
              style={{ width: `${Math.min(it.pct, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
