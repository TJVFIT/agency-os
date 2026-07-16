import { tr } from '@/lib/i18n/tr';

import { EmptyState } from './ui-bits';

export interface MissingWorkItem {
  id: string;
  title: string;
  clientName: string | null;
}

/**
 * Eksik işler (UPGRADE_SPEC §6): pending `missing_work` suggestions rendered
 * as warning rows. Resolution (Uygula/Yoksay) happens in the Öneriler panel —
 * this panel is the at-a-glance warning strip.
 */
export function MissingWork({ items }: { items: MissingWorkItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState icon="✓" tone="emerald" text={tr.automation.noMissingWork} />
    );
  }

  return (
    <ul className="stagger-children grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-3 py-2.5 text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-amber-400/40 hover:bg-amber-400/[0.12]"
        >
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]"
            aria-hidden
          />
          <span className="leading-snug text-amber-200">
            {item.clientName ? `${item.clientName}: ${item.title}` : item.title}
          </span>
        </li>
      ))}
    </ul>
  );
}
