import { listCards, listClients } from '@/lib/db/queries';

import { CalendarView } from './_components/calendar-view';

/**
 * /calendar — month/week planning grid (SPEC §12).
 * Server Component: loads clients + all non-archived cards, hands them to the
 * client CalendarView which owns the grid, drag-to-reschedule and filters.
 */
export default async function CalendarPage() {
  const [clients, cards] = await Promise.all([
    listClients(),
    listCards({}), // non-archived by default
  ]);

  return (
    <div className="p-4 md:p-6">
      <CalendarView
        cards={cards}
        clients={clients.map((c) => ({
          id: c.id,
          name: c.name,
          langs: c.langs,
        }))}
      />
    </div>
  );
}
