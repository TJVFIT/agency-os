import { redirect } from 'next/navigation';

import { AppShell } from '@/components/app-shell';
import { FeedDrawer, type FeedEntry } from '@/components/feed-drawer';
import { RealtimeProvider } from '@/components/realtime-provider';
import { logoutAction } from '@/app/login/actions';
import { getSessionProfile } from '@/lib/auth';
import { listActivity, listProfiles } from '@/lib/db/queries';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionProfile();
  if (!session) redirect('/login');

  const [activity, profiles] = await Promise.all([
    listActivity(50),
    listProfiles(),
  ]);

  const profileNames = Object.fromEntries(
    profiles.map((p) => [p.id, p.full_name || p.id.slice(0, 8)]),
  );

  const feedEntries: FeedEntry[] = activity.map((row) => ({
    ...row,
    actorName: (row.profiles as { full_name?: string } | null)?.full_name,
    cardTitle: (row.cards as { title?: string } | null)?.title,
  }));

  return (
    <RealtimeProvider>
      <AppShell
        profile={session.profile}
        logout={logoutAction}
        feed={
          <FeedDrawer
            initialEntries={feedEntries}
            profileNames={profileNames}
          />
        }
      >
        {children}
      </AppShell>
    </RealtimeProvider>
  );
}
