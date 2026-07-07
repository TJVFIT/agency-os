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
  { href: '/assets', label: tr.nav.assets },
  { href: '/reports', label: tr.nav.reports },
  { href: '/settings', label: tr.nav.settings },
];

export function AppShell({
  profile,
  logout,
  children,
  feed,
}: {
  profile: Profile;
  logout: () => Promise<void>;
  children: React.ReactNode;
  feed: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen bg-neutral-950 text-neutral-100">
      <nav className="flex w-14 flex-col items-center border-r border-neutral-800 py-4 md:w-48 md:items-stretch md:px-3">
        <Link
          href="/dashboard"
          className="mb-6 px-2 text-center text-sm font-bold tracking-tight text-neutral-100 md:text-left"
        >
          <span className="hidden md:inline">{tr.appName}</span>
          <span className="md:hidden">A</span>
        </Link>
        <ul className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded-md px-2 py-1.5 text-sm ${
                    active
                      ? 'bg-neutral-800 text-neutral-50'
                      : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'
                  }`}
                >
                  <span className="hidden md:inline">{item.label}</span>
                  <span className="md:hidden">{item.label.slice(0, 1)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
          <p className="hidden truncate px-2 md:block">{profile.full_name}</p>
          <p className="hidden px-2 md:block">{tr.roles[profile.role]}</p>
          <form action={logout}>
            <button
              type="submit"
              className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-neutral-500 hover:text-neutral-200"
            >
              {tr.auth.logout}
            </button>
          </form>
        </div>
      </nav>

      <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>

      <div className="hidden shrink-0 lg:block">{feed}</div>
    </div>
  );
}
