import type { Metadata } from 'next';

import { AppShell } from '@/components/app-shell';
import { fmtIstanbul } from '@/lib/dates';
import { tr } from '@/lib/i18n/tr';
import { DEMO_FEED, DEMO_PROFILE } from './_demo/data';
import { demoLogout } from './actions';

export const metadata: Metadata = {
  title: `${tr.appName} — Demo`,
  robots: { index: false, follow: false },
};

const DEMO_NAV = [
  { href: '/preview/dashboard', label: tr.nav.dashboard },
  { href: '/preview/board', label: tr.nav.board },
  { href: '/preview/calendar', label: tr.nav.calendar },
  { href: '/preview/clients', label: tr.nav.clients },
  { href: '/preview/production', label: tr.nav.production },
  { href: '/preview/finance', label: tr.nav.finance },
  { href: '/preview/portal', label: tr.portal.title },
  { href: '/preview/settings', label: tr.nav.settings },
];

function DemoFeed() {
  return (
    <div className="flex h-full w-80 flex-col border-l border-white/[0.06] bg-white/[0.015]">
      <div className="border-b border-white/[0.06] px-4 py-3 text-sm font-semibold tracking-tight text-neutral-200">
        {tr.feed.title}
      </div>
      <ol className="stagger-children flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {DEMO_FEED.map((e, i) => (
          <li key={i} className="text-sm">
            <p className="text-neutral-300">{e.action}</p>
            <time className="text-xs text-neutral-600">
              {fmtIstanbul(e.when)}
            </time>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      profile={DEMO_PROFILE}
      logout={demoLogout}
      navItems={DEMO_NAV}
      feed={<DemoFeed />}
    >
      <div className="p-4 md:p-6">
        <div className="animate-enter mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.15em] text-neutral-400">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-300 shadow-[0_0_8px_rgba(165,180,252,0.8)]" />
          Demo — örnek veriler
        </div>
        {children}
      </div>
    </AppShell>
  );
}
