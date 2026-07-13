import Link from 'next/link';

/**
 * URL-driven glass segmented control (Ethereal Glass). Renders plain <Link>s
 * so it works from the server-rendered production page — no client state.
 */
export function TabNav<T extends string>({
  tabs,
  active,
  hrefFor,
}: {
  tabs: readonly { key: T; label: string }[];
  active: T;
  hrefFor: (key: T) => string;
}) {
  return (
    <div
      role="tablist"
      className="inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.03] p-0.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
    >
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={hrefFor(t.key)}
            role="tab"
            aria-selected={isActive}
            className={`rounded-full px-3.5 py-1 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              isActive
                ? 'bg-white/[0.10] text-neutral-50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
