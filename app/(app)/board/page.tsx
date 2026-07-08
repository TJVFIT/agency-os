import { PageHeader } from '@/components/ui';
import { NewCardDialog } from '@/components/new-card-dialog';
import { listCards, listClients, listProfiles } from '@/lib/db/queries';
import { tr } from '@/lib/i18n/tr';

import { BoardView } from './_components/board-view';

/**
 * /board — kanban by status. Filters: client, assignee, type (SPEC §12).
 * Server component: load data under the user's RLS, hand off to the client
 * BoardView for drag-and-drop + realtime patching.
 */
export default async function BoardPage() {
  const [clients, profiles, cards] = await Promise.all([
    listClients(),
    listProfiles(),
    listCards({ includeArchived: false }),
  ]);

  const clientOptions = clients.map((c) => ({ id: c.id, name: c.name }));
  const profileOptions = profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name || p.id.slice(0, 8),
  }));

  return (
    <div className="p-4 md:p-6">
      <PageHeader title={tr.nav.board}>
        <NewCardDialog clients={clientOptions} profiles={profileOptions} />
      </PageHeader>
      <BoardView
        initialCards={cards}
        clients={clientOptions}
        profiles={profileOptions}
      />
    </div>
  );
}
