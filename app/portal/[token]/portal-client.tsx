'use client';

import { useState } from 'react';

import { tr } from '@/lib/i18n/tr';
import type { PortalView } from '@/lib/portal/service';
import { ApprovalsTab } from './approvals-tab';
import { IdeaTab } from './idea-tab';
import { AvailabilityTab } from './availability-tab';
import { PipelineTab } from './pipeline-tab';
import { MessagesTab } from './messages-tab';
import { UploadTab } from './upload-tab';
import { EditTab } from './edit-tab';
import { InfoTab } from './info-tab';

type Tab =
  | 'approvals'
  | 'pipeline'
  | 'messages'
  | 'upload'
  | 'edit'
  | 'ideas'
  | 'availability'
  | 'info';

const TABS: Tab[] = [
  'approvals',
  'pipeline',
  'messages',
  'upload',
  'edit',
  'ideas',
  'availability',
  'info',
];

/**
 * Mobile-first portal shell (UPGRADE_SPEC §2 + v3 client collaboration).
 * Eight tabs no longer fit a fixed pill row — the nav is a horizontally
 * scrollable chip bar with count badges for approvals and unread messages.
 */
export function PortalClient({
  token,
  view,
}: {
  token: string;
  view: PortalView;
}) {
  const [tab, setTab] = useState<Tab>('approvals');
  const [unread, setUnread] = useState(view.unreadMessages);

  function open(next: Tab) {
    setTab(next);
    if (next === 'messages') setUnread(0); // fetchMessages marks them read
  }

  return (
    <div>
      <nav
        role="tablist"
        className="animate-enter -mx-1 mb-5 flex gap-1.5 overflow-x-auto px-1 pb-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => open(t)}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              tab === t
                ? 'border-white/20 bg-white/[0.12] text-neutral-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'border-white/10 bg-white/[0.04] text-neutral-500 hover:text-neutral-300'
            }`}
          >
            {tr.portal.tabs[t]}
            {t === 'approvals' && view.cards.length > 0 && (
              <span className="ml-1 rounded-full border border-sky-400/20 bg-sky-400/10 px-1.5 text-[10px] tabular-nums text-sky-200">
                {view.cards.length}
              </span>
            )}
            {t === 'messages' && unread > 0 && (
              <span className="ml-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-1.5 text-[10px] tabular-nums text-emerald-200">
                {unread}
              </span>
            )}
          </button>
        ))}
      </nav>

      {tab === 'approvals' && <ApprovalsTab token={token} cards={view.cards} />}
      {tab === 'pipeline' && <PipelineTab cards={view.pipeline} />}
      {tab === 'messages' && (
        <MessagesTab token={token} initial={view.messages} />
      )}
      {tab === 'upload' && <UploadTab token={token} initial={view.media} />}
      {tab === 'edit' && <EditTab token={token} media={view.media} />}
      {tab === 'ideas' && <IdeaTab token={token} ideas={view.ideas} />}
      {tab === 'availability' && (
        <AvailabilityTab token={token} windows={view.availability} />
      )}
      {tab === 'info' && <InfoTab token={token} initial={view.contact} />}
    </div>
  );
}
