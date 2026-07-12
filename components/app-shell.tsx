'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { tr } from '@/lib/i18n/tr';
import type { Profile } from '@/lib/db/types';

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: '/dashboard', label: tr.nav.dashboard },
  { href: '/board', label: tr.nav.board },
  { href: '/calendar', label: tr.nav.calendar },
  { href: '/clients', label: tr.nav.clients },
  { href: '/production', label: tr.nav.production },
  { href: '/finance', label: tr.nav.finance },
  { href: '/assets', label: tr.nav.assets },
  { href: '/reports', label: tr.nav.reports },
  { href: '/settings', label: tr.nav.settings },
  { href: '/manual', label: tr.nav.manual },
];

export function AppShell({
  profile,
  logout,
  children,
  feed,
  navItems = NAV_ITEMS,
}: {
  profile: Profile;
  logout: () => Promise<void>;
  children: React.ReactNode;
  feed: React.ReactNode;
  /** Override for the demo shell (/preview) — real app uses the default. */
  navItems?: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen text-neutral-100">
      <nav className="flex w-14 flex-col items-center border-r border-white/[0.06] bg-white/[0.015] py-4 md:w-52 md:items-stretch md:px-3">
        <Link
          href={navItems[0]?.href ?? '/dashboard'}
          className="mb-6 px-2 text-center md:text-left"
        >
          <span className="hidden bg-gradient-to-r from-white via-white to-neutral-400 bg-clip-text text-sm font-bold tracking-tight text-transparent md:inline">
            {tr.appName}
          </span>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-xs font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] md:hidden">
            A
          </span>
        </Link>
        <ul className="stagger-children flex flex-1 flex-col gap-0.5">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group relative block rounded-lg px-2.5 py-1.5 text-sm transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                    active
                      ? 'bg-white/[0.08] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                      : 'text-neutral-500 hover:translate-x-0.5 hover:bg-white/[0.04] hover:text-neutral-200'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-indigo-300/80 shadow-[0_0_10px_rgba(165,180,252,0.8)]"
                    />
                  )}
                  <span className="hidden md:inline">{item.label}</span>
                  <span className="md:hidden">{item.label.slice(0, 1)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-white/[0.06] pt-3 text-xs text-neutral-500">
          <p className="hidden truncate px-2.5 font-medium text-neutral-300 md:block">
            {profile.full_name}
          </p>
          <p className="hidden px-2.5 text-[11px] uppercase tracking-[0.08em] text-neutral-600 md:block">
            {tr.roles[profile.role]}
          </p>
          <form action={logout}>
            <button
              type="submit"
              className="mt-1.5 w-full rounded-lg px-2.5 py-1 text-left text-xs text-neutral-600 transition-colors duration-300 hover:bg-white/[0.04] hover:text-neutral-200"
            >
              {tr.auth.logout}
            </button>
          </form>
        </div>
      </nav>

      <main className="animate-enter min-w-0 flex-1 overflow-x-hidden">
        {children}
      </main>

      <div className="hidden shrink-0 lg:block">{feed}</div>
    </div>
  );
}
