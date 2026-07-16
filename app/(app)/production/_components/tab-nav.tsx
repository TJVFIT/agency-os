import Link from 'next/link';

/**
 * URL-driven glass segmented control (Ethereal Glass). Renders plain <Link>s
 * so it works from the server-rendered production page — no client state.
 * Tabs may carry an optional count rendered as a tabular-nums glass pill.
 */
export function TabNav<T extends string>({
  tabs,
  active,
  hrefFor,
}: {
  tabs: readonly { key: T; label: string; count?: number }[];
  active: T;
  hrefFor: (key: T) => string;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            role="tab"
            aria-selected={isActive}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1 text-sm font-medium outline-none transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] focus-visible:ring-2 focus-visible:ring-indigo-300/40 ${
              isActive
                ? 'bg-white/[0.10] text-neutral-50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span
                className={`rounded-full border px-1.5 text-[10px] font-semibold tabular-nums leading-4 ${
                  isActive
                    ? 'border-white/10 bg-white/[0.08] text-neutral-200'
                    : 'border-white/[0.06] bg-white/[0.03] text-neutral-500'
                }`}
              >
                {t.count}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
