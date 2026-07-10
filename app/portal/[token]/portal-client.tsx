'use client';

import { useState } from 'react';

import { tr } from '@/lib/i18n/tr';
import type { PortalView } from '@/lib/portal/service';
import { ApprovalsTab } from './approvals-tab';
import { IdeaTab } from './idea-tab';
import { AvailabilityTab } from './availability-tab';

type Tab = 'approvals' | 'ideas' | 'availability';

const TABS: Tab[] = ['approvals', 'ideas', 'availability'];

/** Mobile-first portal shell: three tabs (UPGRADE_SPEC §2). */
export function PortalClient({
  token,
  view,
}: {
  token: string;
  view: PortalView;
}) {
  const [tab, setTab] = useState<Tab>('approvals');

  return (
    <div>
      <nav className="mb-4 flex rounded-lg border border-neutral-800 bg-neutral-900 p-1">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
              tab === t
                ? 'bg-neutral-700 text-neutral-100'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {tr.portal.tabs[t]}
            {t === 'approvals' && view.cards.length > 0 && (
              <span className="ml-1 rounded-full bg-sky-900 px-1.5 text-[10px] text-sky-200">
                {view.cards.length}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'approvals' && <ApprovalsTab token={token} cards={view.cards} />}
      {tab === 'ideas' && <IdeaTab token={token} ideas={view.ideas} />}
      {tab === 'availability' && (
        <AvailabilityTab token={token} windows={view.availability} />
      )}
    </div>
  );
}
