'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui';
import { retryFailedPublish } from '@/lib/actions/publishing';
import { tr } from '@/lib/i18n/tr';

import { EmptyState, InlineError } from './ui-bits';

export interface PublishFailureItem {
  jobId: string;
  cardId: string | null;
  cardTitle: string | null;
  error: string | null;
}

/**
 * Başarısız yayınlar (req 27/28): publish ai_jobs that exhausted their retries.
 * A manager can re-queue one; handlePublish re-verifies everything and skips
 * already-posted platforms, so the retry is safe.
 */
export function PublishFailures({
  failures,
  canRetry,
}: {
  failures: PublishFailureItem[];
  canRetry: boolean;
}) {
  if (failures.length === 0) {
    return (
      <EmptyState
        icon="✓"
        tone="emerald"
        text={tr.dashboard.publishFailuresEmpty}
      />
    );
  }

  return (
    <ul className="stagger-children space-y-2">
      {failures.map((f) => (
        <FailureRow key={f.jobId} failure={f} canRetry={canRetry} />
      ))}
    </ul>
  );
}

function FailureRow({
  failure,
  canRetry,
}: {
  failure: PublishFailureItem;
  canRetry: boolean;
}) {
  const [hidden, setHidden] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (hidden) return null;

  function retry() {
    setErr(null);
    start(async () => {
      const res = await retryFailedPublish({ jobId: failure.jobId });
      if (res.ok) setHidden(true);
      else setErr(tr.errors.generic);
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.08] px-3 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-red-500/40 hover:bg-red-500/[0.12]">
      <span
        className="h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.7)]"
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {failure.cardId ? (
          <Link
            href={`/cards/${failure.cardId}`}
            className="block truncate text-sm font-medium text-red-100 hover:underline"
          >
            {failure.cardTitle ?? failure.cardId}
          </Link>
        ) : (
          <div className="truncate text-sm font-medium text-red-100">
            {failure.cardTitle ?? tr.common.unknown}
          </div>
        )}
        {failure.error && (
          <div className="truncate text-xs text-red-300/70">
            {failure.error}
          </div>
        )}
      </div>
      {err && <InlineError text={err} />}
      {canRetry && (
        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={retry}
          className="!px-2.5 !py-1 !text-xs"
        >
          {tr.dashboard.retryPublish}
        </Button>
      )}
    </li>
  );
}
