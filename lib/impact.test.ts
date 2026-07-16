import { describe, expect, it } from 'vitest';

import {
  computeImpactItems,
  type ImpactCard,
  type ImpactContext,
  type ImpactShoot,
} from './impact';

/** Row factories — sensible defaults, override what the case needs. */
function shoot(over: Partial<ImpactShoot> & { id: string }): ImpactShoot {
  return {
    title: `Shoot ${over.id}`,
    client_id: 'client-1',
    starts_at: '2026-07-20T06:00:00.000Z', // 09:00 Istanbul
    ends_at: '2026-07-20T09:30:00.000Z',
    status: 'planned',
    crew: [],
    vehicle_id: null,
    card_id: null,
    ...over,
  };
}

function card(over: Partial<ImpactCard> & { id: string }): ImpactCard {
  return {
    title: `Card ${over.id}`,
    client_id: 'client-1',
    status: 'idea',
    assignee: null,
    due_at: null,
    scheduled_at: null,
    ...over,
  };
}

const ctx = (shoots: ImpactShoot[], cards: ImpactCard[]): ImpactContext => ({
  shoots,
  cards,
});

const DAY_MS = 24 * 3600 * 1000;

describe('shoot_move', () => {
  const moved = shoot({
    id: 's1',
    card_id: 'c1',
    vehicle_id: 'v1',
    starts_at: '2026-07-20T06:00:00.000Z',
    ends_at: '2026-07-20T09:30:00.000Z',
  });
  // +1 day
  const change = {
    kind: 'shoot_move' as const,
    shootId: 's1',
    startsAt: '2026-07-21T06:00:00.000Z',
  };

  it('shifts the linked card due date by the same delta', () => {
    const items = computeImpactItems(
      change,
      ctx([moved], [card({ id: 'c1', due_at: '2026-07-21T10:00:00.000Z' })]),
    );
    expect(items).toEqual([
      {
        kind: 'card',
        id: 'c1',
        title: 'Card c1',
        current: '2026-07-21T10:00:00.000Z',
        proposed: '2026-07-22T10:00:00.000Z',
        reason: 'linked_card',
      },
    ]);
  });

  it('emits a publish item (not card) when the linked card is scheduled, without chain duplicate', () => {
    const items = computeImpactItems(
      change,
      ctx(
        [moved],
        [
          card({
            id: 'c1',
            status: 'scheduled',
            scheduled_at: '2026-07-22T08:00:00.000Z',
            due_at: '2026-07-21T10:00:00.000Z',
          }),
        ],
      ),
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'publish',
      id: 'c1',
      proposed: '2026-07-23T08:00:00.000Z',
      reason: 'linked_card',
    });
  });

  it('ignores a linked card that is published or archived', () => {
    const items = computeImpactItems(
      change,
      ctx(
        [moved],
        [
          card({
            id: 'c1',
            status: 'published',
            scheduled_at: '2026-07-22T08:00:00.000Z',
          }),
        ],
      ),
    );
    expect(items).toEqual([]);
  });

  it('flags same-vehicle shoots on the old and new Istanbul days as route items', () => {
    const sameVehicleOldDay = shoot({
      id: 's2',
      vehicle_id: 'v1',
      starts_at: '2026-07-20T11:00:00.000Z',
    });
    const sameVehicleNewDay = shoot({
      id: 's3',
      vehicle_id: 'v1',
      starts_at: '2026-07-21T10:00:00.000Z',
    });
    const sameVehicleOtherDay = shoot({
      id: 's4',
      vehicle_id: 'v1',
      starts_at: '2026-07-24T10:00:00.000Z',
    });
    const otherVehicle = shoot({
      id: 's5',
      vehicle_id: 'v2',
      starts_at: '2026-07-20T11:00:00.000Z',
    });
    const cancelled = shoot({
      id: 's6',
      vehicle_id: 'v1',
      status: 'cancelled',
      starts_at: '2026-07-20T11:00:00.000Z',
    });

    const items = computeImpactItems(
      change,
      ctx(
        [
          moved,
          sameVehicleOldDay,
          sameVehicleNewDay,
          sameVehicleOtherDay,
          otherVehicle,
          cancelled,
        ],
        [],
      ),
    );
    expect(items.map((i) => i.id).sort()).toEqual(['s2', 's3']);
    for (const item of items) {
      expect(item.kind).toBe('route');
      expect(item.reason).toBe('shared_vehicle');
      expect(item.proposed).toBe(item.current); // informational — no data change
    }
  });

  it("shifts the client's scheduled publishes inside the 7-day chain window only", () => {
    const inChain = card({
      id: 'c2',
      status: 'scheduled',
      scheduled_at: '2026-07-24T08:00:00.000Z',
    });
    const outsideChain = card({
      id: 'c3',
      status: 'scheduled',
      scheduled_at: '2026-07-30T08:00:00.000Z', // > start + 7d
    });
    const otherClient = card({
      id: 'c4',
      client_id: 'client-2',
      status: 'scheduled',
      scheduled_at: '2026-07-24T08:00:00.000Z',
    });
    const notScheduled = card({
      id: 'c5',
      status: 'approved',
      scheduled_at: '2026-07-24T08:00:00.000Z',
    });

    const items = computeImpactItems(
      change,
      ctx([moved], [inChain, outsideChain, otherClient, notScheduled]),
    );
    expect(items).toEqual([
      {
        kind: 'publish',
        id: 'c2',
        title: 'Card c2',
        current: '2026-07-24T08:00:00.000Z',
        proposed: '2026-07-25T08:00:00.000Z',
        reason: 'publish_chain',
      },
    ]);
  });

  it('returns [] for a zero delta or an unknown shoot', () => {
    const noMove = {
      kind: 'shoot_move' as const,
      shootId: 's1',
      startsAt: moved.starts_at,
    };
    expect(computeImpactItems(noMove, ctx([moved], []))).toEqual([]);
    expect(computeImpactItems(change, ctx([], []))).toEqual([]);
  });
});

describe('card_reschedule', () => {
  it('shifts planned/confirmed shoots linked to the card, skipping done ones', () => {
    const c1 = card({ id: 'c1', due_at: '2026-07-20T09:00:00.000Z' });
    const linked = shoot({
      id: 's1',
      card_id: 'c1',
      starts_at: '2026-07-19T06:00:00.000Z',
    });
    const done = shoot({
      id: 's2',
      card_id: 'c1',
      status: 'done',
      starts_at: '2026-07-19T06:00:00.000Z',
    });
    const unrelated = shoot({ id: 's3', card_id: 'c9' });

    const items = computeImpactItems(
      {
        kind: 'card_reschedule',
        cardId: 'c1',
        at: '2026-07-22T09:00:00.000Z', // +2 days
      },
      ctx([linked, done, unrelated], [c1]),
    );
    expect(items).toEqual([
      {
        kind: 'shoot',
        id: 's1',
        title: 'Shoot s1',
        current: '2026-07-19T06:00:00.000Z',
        proposed: '2026-07-21T06:00:00.000Z',
        reason: 'linked_shoot',
      },
    ]);
  });

  it('returns [] when the card has no current date (unscheduled tray drag)', () => {
    const c1 = card({ id: 'c1' });
    const linked = shoot({ id: 's1', card_id: 'c1' });
    const items = computeImpactItems(
      { kind: 'card_reschedule', cardId: 'c1', at: '2026-07-22T09:00:00.000Z' },
      ctx([linked], [c1]),
    );
    expect(items).toEqual([]);
  });

  it('shifts the client publish chain only when the dragged card is scheduled', () => {
    const dragged = card({
      id: 'c1',
      status: 'scheduled',
      scheduled_at: '2026-07-20T09:00:00.000Z',
    });
    const later = card({
      id: 'c2',
      status: 'scheduled',
      scheduled_at: '2026-07-22T09:00:00.000Z',
    });
    const tooLate = card({
      id: 'c3',
      status: 'scheduled',
      scheduled_at: '2026-07-28T09:30:00.000Z', // > +7d window
    });
    const otherClient = card({
      id: 'c4',
      client_id: 'client-2',
      status: 'scheduled',
      scheduled_at: '2026-07-22T09:00:00.000Z',
    });

    const items = computeImpactItems(
      { kind: 'card_reschedule', cardId: 'c1', at: '2026-07-21T09:00:00.000Z' },
      ctx([], [dragged, later, tooLate, otherClient]),
    );
    expect(items).toEqual([
      {
        kind: 'publish',
        id: 'c2',
        title: 'Card c2',
        current: '2026-07-22T09:00:00.000Z',
        proposed: '2026-07-23T09:00:00.000Z',
        reason: 'publish_chain',
      },
    ]);

    // Same drag on a mere due-date card: no chain.
    const dueOnly = card({ id: 'c1', due_at: '2026-07-20T09:00:00.000Z' });
    expect(
      computeImpactItems(
        {
          kind: 'card_reschedule',
          cardId: 'c1',
          at: '2026-07-21T09:00:00.000Z',
        },
        ctx([], [dueOnly, later]),
      ),
    ).toEqual([]);
  });

  it('uses `from` as the anchor when the row already holds the new date (apply-after-save)', () => {
    // rescheduleCard has already written `at` into the row; without `from`
    // the recompute would see delta 0 and silently apply nothing.
    const savedCard = card({
      id: 'c1',
      status: 'scheduled',
      scheduled_at: '2026-07-22T09:00:00.000Z', // == change.at
    });
    const chained = card({
      id: 'c2',
      status: 'scheduled',
      scheduled_at: '2026-07-21T09:00:00.000Z', // inside pre-move window
    });
    const linked = shoot({
      id: 's1',
      card_id: 'c1',
      starts_at: '2026-07-19T06:00:00.000Z',
    });
    const change = {
      kind: 'card_reschedule' as const,
      cardId: 'c1',
      at: '2026-07-22T09:00:00.000Z',
      from: '2026-07-20T09:00:00.000Z', // pre-move anchor, +2d delta
    };

    // Without `from` the same context computes nothing.
    expect(
      computeImpactItems(
        { ...change, from: undefined },
        ctx([linked], [savedCard, chained]),
      ),
    ).toEqual([]);

    const items = computeImpactItems(
      change,
      ctx([linked], [savedCard, chained]),
    );
    expect(items).toEqual([
      {
        kind: 'shoot',
        id: 's1',
        title: 'Shoot s1',
        current: '2026-07-19T06:00:00.000Z',
        proposed: '2026-07-21T06:00:00.000Z',
        reason: 'linked_shoot',
      },
      {
        kind: 'publish',
        id: 'c2',
        title: 'Card c2',
        current: '2026-07-21T09:00:00.000Z',
        proposed: '2026-07-23T09:00:00.000Z',
        reason: 'publish_chain',
      },
    ]);
  });
});

describe('leave', () => {
  const change = {
    kind: 'leave' as const,
    profileId: 'p1',
    startsOn: '2026-07-20',
    endsOn: '2026-07-22',
  };

  it('proposes moving crewed shoots inside the window to the day after the leave', () => {
    const inWindow = shoot({
      id: 's1',
      crew: ['p1', 'p2'],
      starts_at: '2026-07-21T06:00:00.000Z', // 09:00 Istanbul
    });
    const otherCrew = shoot({
      id: 's2',
      crew: ['p2'],
      starts_at: '2026-07-21T06:00:00.000Z',
    });
    const outsideWindow = shoot({
      id: 's3',
      crew: ['p1'],
      starts_at: '2026-07-25T06:00:00.000Z',
    });
    const cancelled = shoot({
      id: 's4',
      crew: ['p1'],
      status: 'cancelled',
      starts_at: '2026-07-21T06:00:00.000Z',
    });

    const items = computeImpactItems(
      change,
      ctx([inWindow, otherCrew, outsideWindow, cancelled], []),
    );
    expect(items).toEqual([
      {
        kind: 'shoot',
        id: 's1',
        title: 'Shoot s1',
        current: '2026-07-21T06:00:00.000Z',
        // day after leave end, same 09:00 Istanbul wall clock
        proposed: '2026-07-23T06:00:00.000Z',
        reason: 'crew_on_leave',
      },
    ]);
  });

  it("flags the person's open cards due inside the window (Istanbul day)", () => {
    // 2026-07-19 21:30 UTC = 2026-07-20 00:30 Istanbul → inside the window.
    const edgeOfDay = card({
      id: 'c1',
      assignee: 'p1',
      due_at: '2026-07-19T21:30:00.000Z',
    });
    const otherAssignee = card({
      id: 'c2',
      assignee: 'p2',
      due_at: '2026-07-21T09:00:00.000Z',
    });
    const published = card({
      id: 'c3',
      assignee: 'p1',
      status: 'published',
      due_at: '2026-07-21T09:00:00.000Z',
    });
    const outside = card({
      id: 'c4',
      assignee: 'p1',
      due_at: '2026-07-25T09:00:00.000Z',
    });

    const items = computeImpactItems(
      change,
      ctx([], [edgeOfDay, otherAssignee, published, outside]),
    );
    expect(items).toEqual([
      {
        kind: 'card',
        id: 'c1',
        title: 'Card c1',
        current: '2026-07-19T21:30:00.000Z',
        // 00:30 Istanbul on 2026-07-23 = 21:30 UTC on 2026-07-22
        proposed: '2026-07-22T21:30:00.000Z',
        reason: 'assignee_on_leave',
      },
    ]);
  });

  it('sorts shoots before cards and orders by date within a kind', () => {
    const s1 = shoot({
      id: 's1',
      crew: ['p1'],
      starts_at: '2026-07-22T06:00:00.000Z',
    });
    const s2 = shoot({
      id: 's2',
      crew: ['p1'],
      starts_at: '2026-07-20T06:00:00.000Z',
    });
    const c1 = card({
      id: 'c1',
      assignee: 'p1',
      due_at: '2026-07-21T09:00:00.000Z',
    });

    const items = computeImpactItems(change, ctx([s1, s2], [c1]));
    expect(items.map((i) => i.id)).toEqual(['s2', 's1', 'c1']);
  });

  it('keeps the proposed delta consistent with the shift arithmetic', () => {
    const s1 = shoot({
      id: 's1',
      crew: ['p1'],
      starts_at: '2026-07-20T06:00:00.000Z',
    });
    const [item] = computeImpactItems(change, ctx([s1], []));
    const delta =
      new Date(item.proposed).getTime() - new Date(item.current).getTime();
    expect(delta).toBe(3 * DAY_MS); // 20th → 23rd
  });
});
