import { tr } from '@/lib/i18n/tr';

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
      <p className="text-sm text-neutral-500">{tr.automation.noMissingWork}</p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-start gap-2 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm"
        >
          <span
            className="mt-1 h-2 w-2 shrink-0 rounded-full bg-amber-500"
            aria-hidden
          />
          <span className="text-amber-200">
            {item.clientName ? `${item.clientName}: ${item.title}` : item.title}
          </span>
        </li>
      ))}
    </ul>
  );
}
