'use client';

import { useMemo, useState } from 'react';

import { Dialog } from '@/components/dialog';
import { Button } from '@/components/ui';
import { fmtIstanbul } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';
import type { ImpactItem, ImpactKind, ImpactReason } from '@/lib/impact';

/**
 * Change-impact dialog (v4 §21): before persisting a reschedule / leave, show
 * what else the change touches, grouped by kind, all pre-checked. The caller
 * owns the primary save; `onConfirm(selectedIds)` reports which linked items
 * to apply — `[]` means "only this" (save without touching linked work).
 */

const KIND_ORDER: ImpactKind[] = ['shoot', 'card', 'publish', 'route'];

const KIND_LABEL: Record<ImpactKind, string> = {
  card: tr.impact.kinds.card,
  shoot: tr.impact.kinds.shoot,
  route: tr.impact.kinds.route,
  publish: tr.impact.kinds.publish,
};

// Reason keys are pre-registered in missing_tr_keys (i18n scaffold adds them
// at integration — see the note at the top of lib/i18n/tr.ts).
const REASON_LABEL: Record<ImpactReason, string> = {
  linked_card: tr.impact.reasons.linkedCard,
  linked_shoot: tr.impact.reasons.linkedShoot,
  shared_vehicle: tr.impact.reasons.sharedVehicle,
  publish_chain: tr.impact.reasons.publishChain,
  crew_on_leave: tr.impact.reasons.crewOnLeave,
  assignee_on_leave: tr.impact.reasons.assigneeOnLeave,
};

export function ImpactDialog({
  open,
  items,
  pending = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  items: ImpactItem[];
  pending?: boolean;
  /** Abort: nothing is saved, not even the primary change. */
  onCancel: () => void;
  /** Save the primary change + apply these linked item ids ([] = only this). */
  onConfirm: (selectedIds: string[]) => void;
}) {
  // Remount the body when the item set changes so the checkbox state resets
  // to "all checked" for every fresh analysis (no derived-state effects).
  const idsKey = items.map((i) => i.id).join(',');

  return (
    <Dialog open={open} onClose={onCancel} title={tr.impact.title}>
      <ImpactBody
        key={idsKey}
        items={items}
        pending={pending}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    </Dialog>
  );
}

function ImpactBody({
  items,
  pending,
  onCancel,
  onConfirm,
}: {
  items: ImpactItem[];
  pending: boolean;
  onCancel: () => void;
  onConfirm: (selectedIds: string[]) => void;
}) {
  // Default: everything checked.
  const [checked, setChecked] = useState<Set<string>>(
    () => new Set(items.map((i) => i.id)),
  );

  const groups = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({
        kind,
        items: items.filter((i) => i.kind === kind),
      })).filter((g) => g.items.length > 0),
    [items],
  );

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-300">
        {items.length === 0
          ? tr.impact.none
          : interpolate(tr.impact.affected, { count: items.length })}
      </p>

      <div className="stagger-children max-h-[50vh] space-y-3 overflow-y-auto pr-1">
        {groups.map((group) => (
          <div key={group.kind}>
            <p className="mb-1.5 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-neutral-500">
              {KIND_LABEL[group.kind]}
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-px text-[10px] tabular-nums text-neutral-400">
                {group.items.length}
              </span>
            </p>
            <ul className="space-y-1.5">
              {group.items.map((item) => (
                <li key={`${item.kind}:${item.id}`}>
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2 transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.05]">
                    <input
                      type="checkbox"
                      checked={checked.has(item.id)}
                      onChange={() => toggle(item.id)}
                      className="mt-1 h-3.5 w-3.5 shrink-0 accent-indigo-400"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-neutral-100">
                        {item.title}
                      </span>
                      <span className="block font-mono text-[11px] tabular-nums text-neutral-400">
                        {fmtIstanbul(item.current)}
                        {item.proposed !== item.current && (
                          <span className="text-indigo-200">
                            {' → '}
                            {fmtIstanbul(item.proposed)}
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-neutral-500">
                        {REASON_LABEL[item.reason]}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-3">
        <Button variant="ghost" disabled={pending} onClick={onCancel}>
          {tr.impact.cancel}
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => onConfirm([])}
        >
          {tr.impact.onlyThis}
        </Button>
        <Button
          variant="secondary"
          disabled={pending || checked.size === 0}
          onClick={() => onConfirm([...checked])}
        >
          {tr.impact.updateSelected}
        </Button>
        <Button
          variant="primary"
          disabled={pending}
          onClick={() => onConfirm(items.map((i) => i.id))}
        >
          {tr.impact.updateAll}
        </Button>
      </div>
    </div>
  );
}
