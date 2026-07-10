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
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.key}>
          <div className="mb-0.5 flex items-center justify-between text-xs">
            <span className="text-neutral-400">{it.label}</span>
            <span
              className={
                it.over ? 'font-medium text-red-400' : 'text-neutral-400'
              }
            >
              {it.used}/{it.quota}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full rounded-full transition-all ${
                it.over
                  ? 'bg-red-500'
                  : it.pct >= 100
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(it.pct, 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
