'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { resolveSuggestion } from '@/lib/actions/automation';
import { tr } from '@/lib/i18n/tr';

export interface SuggestionItem {
  id: string;
  title: string;
  domain: string;
  cardId: string | null;
  clientName: string | null;
}

/** Domain chip label — known domains map to tr keys, others render raw. */
export function suggestionDomainLabel(domain: string): string {
  if (domain === 'missing_work') return tr.automation.missingWork;
  const domains = tr.automation.domains as Record<string, string>;
  return domains[domain] ?? domain;
}

/**
 * Öneriler inbox (UPGRADE_SPEC §9): pending worker suggestions. Accept
 * executes the structured body server-side; dismiss archives the row.
 */
export function SuggestionsPanel({
  suggestions,
  canResolve,
}: {
  suggestions: SuggestionItem[];
  canResolve: boolean;
}) {
  if (suggestions.length === 0) {
    return (
      <p className="text-sm text-neutral-500">{tr.automation.noSuggestions}</p>
    );
  }

  return (
    <ul className="stagger-children space-y-2">
      {suggestions.map((s) => (
        <SuggestionRow key={s.id} suggestion={s} canResolve={canResolve} />
      ))}
    </ul>
  );
}

function SuggestionRow({
  suggestion,
  canResolve,
}: {
  suggestion: SuggestionItem;
  canResolve: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (hidden) return null;

  function resolve(action: 'accept' | 'dismiss') {
    setErr(null);
    start(async () => {
      const res = await resolveSuggestion({ id: suggestion.id, action });
      if (res.ok) setHidden(true);
      else
        setErr(
          res.error === 'validation' ? tr.errors.validation : tr.errors.generic,
        );
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-white/[0.12] hover:bg-white/[0.05]">
      <span className="shrink-0 rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-neutral-400">
        {suggestionDomainLabel(suggestion.domain)}
      </span>
      <div className="min-w-0 flex-1">
        {suggestion.cardId ? (
          <Link
            href={`/cards/${suggestion.cardId}`}
            className="block truncate text-sm font-medium text-neutral-100 hover:underline"
          >
            {suggestion.title}
          </Link>
        ) : (
          <div className="truncate text-sm font-medium text-neutral-100">
            {suggestion.title}
          </div>
        )}
        {suggestion.clientName && (
          <div className="truncate text-xs text-neutral-500">
            {suggestion.clientName}
          </div>
        )}
      </div>
      {err && <span className="text-xs text-red-400">{err}</span>}
      {canResolve && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="primary"
            disabled={pending}
            onClick={() => resolve('accept')}
            className="!px-2.5 !py-1 !text-xs"
          >
            {tr.automation.accept}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => resolve('dismiss')}
            className="!px-2.5 !py-1 !text-xs"
          >
            {tr.automation.dismiss}
          </Button>
        </div>
      )}
    </li>
  );
}
