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
  const activeIndex = TABS.indexOf(tab);

  return (
    <div>
      <nav
        role="tablist"
        className="animate-enter relative mb-5 flex rounded-full border border-white/10 bg-white/[0.04] p-1 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]"
      >
        <span
          aria-hidden
          className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-full bg-white/[0.1] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_8px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`relative z-10 flex-1 rounded-full px-1 py-1.5 text-xs font-medium transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              tab === t
                ? 'text-neutral-50'
                : 'text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {tr.portal.tabs[t]}
            {t === 'approvals' && view.cards.length > 0 && (
              <span className="ml-1 rounded-full border border-sky-400/20 bg-sky-400/10 px-1.5 text-[10px] tabular-nums text-sky-200">
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
