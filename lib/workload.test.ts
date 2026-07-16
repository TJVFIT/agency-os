import { describe, expect, it } from 'vitest';

import {
  MAX_TRANSFER_SUGGESTIONS,
  MIN_TEAM_FOR_LEVELS,
  OPEN_CARD_STATUSES,
  SHOOT_POINTS,
  computeWorkload,
  suggestTransfers,
  transferTitle,
  type MemberWorkload,
  type WorkloadCardInput,
  type WorkloadMemberInput,
} from './workload';
import { interpolate, tr } from './i18n/tr';

const members = (...ids: string[]): WorkloadMemberInput[] =>
  ids.map((id) => ({ id, name: `name-${id}` }));

let seq = 0;
const card = (
  assignee: string | null,
  overrides: Partial<WorkloadCardInput> = {},
): WorkloadCardInput => ({
  id: overrides.id ?? `card-${++seq}`,
  title: overrides.title ?? `Card ${seq}`,
  assignee,
  status: overrides.status ?? 'idea',
  dueAt: overrides.dueAt ?? null,
  taskTypeId: overrides.taskTypeId ?? null,
});

describe('computeWorkload — points', () => {
  it('sums 1 point per open card without a task type', () => {
    const rows = computeWorkload(
      members('a', 'b', 'c'),
      [card('a'), card('a'), card('b')],
      [],
    );
    expect(rows.find((r) => r.id === 'a')?.points).toBe(2);
    expect(rows.find((r) => r.id === 'b')?.points).toBe(1);
    expect(rows.find((r) => r.id === 'c')?.points).toBe(0);
  });

  it('uses task_type workload_points with fallback 1 for unknown ids', () => {
    const rows = computeWorkload(
      members('a', 'b', 'c'),
      [
        card('a', { taskTypeId: 'tt-heavy' }),
        card('a', { taskTypeId: 'tt-missing' }),
      ],
      [],
      { 'tt-heavy': 5 },
    );
    expect(rows.find((r) => r.id === 'a')?.points).toBe(6);
  });

  it('ignores non-open statuses and unknown assignees', () => {
    const rows = computeWorkload(
      members('a', 'b', 'c'),
      [
        card('a', { status: 'approved' }),
        card('a', { status: 'scheduled' }),
        card('a', { status: 'published' }),
        card('a', { status: 'archived' }),
        card('ghost'),
      ],
      [],
    );
    expect(rows.every((r) => r.points === 0)).toBe(true);
  });

  it('counts every open status', () => {
    const rows = computeWorkload(
      members('a', 'b', 'c'),
      OPEN_CARD_STATUSES.map((status) => card('a', { status })),
      [],
    );
    expect(rows.find((r) => r.id === 'a')?.points).toBe(
      OPEN_CARD_STATUSES.length,
    );
  });

  it('adds SHOOT_POINTS per upcoming shoot crew slot', () => {
    const rows = computeWorkload(members('a', 'b', 'c'), [card('b')], [
      ['a', 'b'],
      ['a'],
      ['ghost'],
    ]);
    expect(rows.find((r) => r.id === 'a')?.points).toBe(2 * SHOOT_POINTS);
    expect(rows.find((r) => r.id === 'b')?.points).toBe(1 + SHOOT_POINTS);
  });
});

describe('computeWorkload — levels', () => {
  it('bands over (>120% of median) and idle (<60% of median)', () => {
    // points: a=10, b=5, c=2 → median 5, over >6, idle <3.
    const rows = computeWorkload(
      members('a', 'b', 'c'),
      [
        ...Array.from({ length: 10 }, () => card('a')),
        ...Array.from({ length: 5 }, () => card('b')),
        ...Array.from({ length: 2 }, () => card('c')),
      ],
      [],
    );
    expect(rows.find((r) => r.id === 'a')?.level).toBe('over');
    expect(rows.find((r) => r.id === 'b')?.level).toBe('balanced');
    expect(rows.find((r) => r.id === 'c')?.level).toBe('idle');
  });

  it('guards tiny teams: below MIN_TEAM_FOR_LEVELS everyone is balanced', () => {
    const ids = ['a', 'b'].slice(0, MIN_TEAM_FOR_LEVELS - 1);
    const rows = computeWorkload(
      members(...ids),
      Array.from({ length: 9 }, () => card('a')),
      [],
    );
    expect(rows.every((r) => r.level === 'balanced')).toBe(true);
  });

  it('guards a zero median: one busy person in an empty team is not "over"', () => {
    // a=4, b=0, c=0 → median 0 → flat.
    const rows = computeWorkload(
      members('a', 'b', 'c'),
      Array.from({ length: 4 }, () => card('a')),
      [],
    );
    expect(rows.every((r) => r.level === 'balanced')).toBe(true);
  });

  it('sorts busiest first, deterministically', () => {
    const rows = computeWorkload(
      members('b', 'a', 'c'),
      [card('c'), card('c'), card('a')],
      [],
    );
    expect(rows.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

const wl = (
  id: string,
  points: number,
  level: MemberWorkload['level'],
): MemberWorkload => ({ id, name: `name-${id}`, points, level });

describe('suggestTransfers', () => {
  it('returns nothing without an idle receiver', () => {
    const out = suggestTransfers(
      [wl('a', 10, 'over'), wl('b', 8, 'balanced'), wl('c', 7, 'balanced')],
      [card('a'), card(null)],
    );
    expect(out).toEqual([]);
  });

  it('drains the unassigned pool before over members', () => {
    const out = suggestTransfers(
      [wl('a', 10, 'over'), wl('b', 5, 'balanced'), wl('c', 1, 'idle')],
      [
        card('a', { id: 'mine', title: 'Mine' }),
        card(null, { id: 'pool', title: 'Pool' }),
      ],
    );
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0]).toMatchObject({ cardId: 'pool', from: null, to: 'c' });
    expect(out[1]).toMatchObject({ cardId: 'mine', from: 'a', to: 'c' });
  });

  it('prefers un-started statuses, then the furthest due date', () => {
    const out = suggestTransfers(
      [wl('a', 20, 'over'), wl('b', 5, 'balanced'), wl('c', 0, 'idle')],
      [
        card('a', { id: 'inflight', status: 'visual_ready' }),
        card('a', { id: 'due-soon', status: 'idea', dueAt: '2026-07-17T09:00:00Z' }),
        card('a', { id: 'due-far', status: 'idea', dueAt: '2026-08-01T09:00:00Z' }),
        card('a', { id: 'no-due', status: 'idea' }),
      ],
    );
    expect(out.map((t) => t.cardId)).toEqual([
      'no-due', // null due = furthest, safest to move
      'due-far',
      'due-soon',
      'inflight',
    ]);
    expect(out.every((t) => t.from === 'a' && t.to === 'c')).toBe(true);
  });

  it('caps at MAX_TRANSFER_SUGGESTIONS', () => {
    // median 10 → receiver a can absorb well past the cap at 1 pt per card.
    const out = suggestTransfers(
      [wl('a', 0, 'idle'), wl('b', 10, 'balanced'), wl('c', 10, 'balanced')],
      Array.from({ length: 10 }, () => card(null)),
    );
    expect(out).toHaveLength(MAX_TRANSFER_SUGGESTIONS);
  });

  it('saturates a receiver at the median and moves to the next one', () => {
    // median of [9,2,1,0] = 1.5 … use clearer numbers:
    // loads a=10, b=4, c=1, d=0 → median (4+1)/2 = 2.5.
    const out = suggestTransfers(
      [wl('a', 10, 'over'), wl('b', 4, 'balanced'), wl('c', 1, 'idle'), wl('d', 0, 'idle')],
      [
        card('a', { id: 'c1', taskTypeId: 'tt3' }),
        card('a', { id: 'c2', taskTypeId: 'tt3' }),
        card('a', { id: 'c3', taskTypeId: 'tt3' }),
      ],
      { tt3: 3 },
    );
    // d (0 pts) receives first → 3 ≥ 2.5 saturated; c (1 pt) next → 4
    // saturated; then no receiver under the median remains.
    expect(out.map((t) => [t.cardId, t.to])).toEqual([
      ['c1', 'd'],
      ['c2', 'c'],
    ]);
  });

  it('stops draining a donor once it is no longer over', () => {
    // median of [8,5,0] = 5 → over-threshold 6. Donor a at 8 gives one
    // 3-point card → 5 ≤ 6 → stops even though it has more cards.
    const out = suggestTransfers(
      [wl('a', 8, 'over'), wl('b', 5, 'balanced'), wl('c', 0, 'idle')],
      [
        card('a', { id: 'c1', taskTypeId: 'tt3' }),
        card('a', { id: 'c2', taskTypeId: 'tt3' }),
      ],
      { tt3: 3 },
    );
    expect(out.map((t) => t.cardId)).toEqual(['c1']);
  });

  it('never suggests a transfer back to the donor', () => {
    const out = suggestTransfers(
      [wl('a', 10, 'over'), wl('b', 5, 'balanced'), wl('c', 1, 'idle')],
      [card('a')],
    );
    expect(out.every((t) => t.from !== t.to)).toBe(true);
  });

  it('is deterministic across shuffled input order', () => {
    const loads = [wl('a', 9, 'over'), wl('b', 4, 'balanced'), wl('c', 0, 'idle')];
    const cards = [
      card('a', { id: 'x', status: 'copy_draft' }),
      card('a', { id: 'y', status: 'idea' }),
      card(null, { id: 'z' }),
    ];
    const first = suggestTransfers(loads, cards);
    const second = suggestTransfers(
      [...loads].reverse(),
      [...cards].reverse(),
    );
    expect(second).toEqual(first);
  });
});

describe('transferTitle', () => {
  const names = { a: 'Ayşe', b: 'Barış' };

  it('renders the tr.workload.suggestion template with member names', () => {
    const title = transferTitle(
      { cardId: 'c1', cardTitle: 'Reel kurgusu', from: 'a', to: 'b', points: 1 },
      names,
    );
    expect(title).toBe(
      interpolate(tr.workload.suggestion, {
        from: 'Ayşe',
        to: 'Barış',
        title: 'Reel kurgusu',
      }),
    );
  });

  it('labels the pool via tr.workload.pool with tr.common.unknown fallback', () => {
    const title = transferTitle(
      { cardId: 'c1', cardTitle: 'Post', from: null, to: 'b', points: 1 },
      names,
    );
    const poolLabel =
      (tr.workload as { pool?: string }).pool ?? tr.common.unknown;
    expect(title).toContain(poolLabel);
    expect(title).toContain('Barış');
  });
});
