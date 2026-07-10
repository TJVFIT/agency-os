'use client';

import { fmtIstanbul } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import { useDemoStore } from './store';

/** Live feed rail for the demo — reflects what the visitor actually does. */
export function DemoFeed() {
  const { feed } = useDemoStore();

  return (
    <div className="flex h-full w-80 flex-col border-l border-white/[0.06] bg-white/[0.015]">
      <div className="border-b border-white/[0.06] px-4 py-3 text-sm font-semibold tracking-tight text-neutral-200">
        {tr.feed.title}
      </div>
      <ol className="stagger-children flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {feed.length === 0 && (
          <li className="text-sm text-neutral-600">{tr.demo.feedEmpty}</li>
        )}
        {feed.map((e) => (
          <li key={e.id} className="text-sm">
            <p className="text-neutral-300">{e.text}</p>
            <time className="text-xs text-neutral-600">
              {fmtIstanbul(e.at)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}
