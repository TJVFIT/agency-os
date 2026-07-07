import { describe, expect, it } from 'vitest';

import {
  Actor,
  CARD_STATUSES,
  CardStatus,
  TransitionContext,
  canTransition,
} from './status';

const NOW = new Date('2026-01-15T12:00:00Z');
const FUTURE = new Date('2026-01-20T09:00:00Z');
const PAST = new Date('2026-01-10T09:00:00Z');

const MULTI_LANG = ['tr', 'en'] as const;
const SINGLE_LANG = ['tr'] as const;

/** ctx that satisfies every side-condition, so the matrix isolates edge + role rules. */
function validCtx(langs: readonly string[]): TransitionContext {
  return { langs, scheduledAt: FUTURE, platforms: ['instagram'], now: NOW };
}

type Edge = `${CardStatus}->${CardStatus}`;
const edge = (from: CardStatus, to: CardStatus): Edge => `${from}->${to}`;

/** Every status except archived can be archived. */
const ARCHIVE_EDGES: Edge[] = CARD_STATUSES.filter((s) => s !== 'archived').map(
  (s) => edge(s, 'archived'),
);

// Explicit expectation tables — allowed edges per actor per language config.
// Anything not listed must be rejected. (SPEC.md §5)
const MEMBER_MULTI: Edge[] = [
  'idea->copy_draft',
  'copy_draft->visual_ready',
  'visual_ready->translated',
  'approved->scheduled',
  ...ARCHIVE_EDGES,
];

const MEMBER_SINGLE: Edge[] = [
  'idea->copy_draft',
  'copy_draft->visual_ready',
  'approved->scheduled',
  ...ARCHIVE_EDGES,
];

const MANAGER_MULTI: Edge[] = [
  ...MEMBER_MULTI,
  'translated->approved',
  'translated->copy_draft', // reject
];

const MANAGER_SINGLE: Edge[] = [
  ...MEMBER_SINGLE,
  'visual_ready->approved', // translated step skipped
  'visual_ready->copy_draft', // reject
  // The skip rule governs *entering* translated, not leaving it: a card can
  // only sit in translated on a single-lang client if the client's language
  // set was edited mid-flight — it must not be stranded there.
  'translated->approved',
  'translated->copy_draft',
];

const SERVICE_MULTI: Edge[] = [...MANAGER_MULTI, 'scheduled->published'];
const SERVICE_SINGLE: Edge[] = [...MANAGER_SINGLE, 'scheduled->published'];

const MATRIX: Array<{
  actor: Actor;
  langs: readonly string[];
  label: string;
  allowed: Edge[];
}> = [
  {
    actor: 'member',
    langs: MULTI_LANG,
    label: 'member/multi-lang',
    allowed: MEMBER_MULTI,
  },
  {
    actor: 'member',
    langs: SINGLE_LANG,
    label: 'member/single-lang',
    allowed: MEMBER_SINGLE,
  },
  {
    actor: 'manager',
    langs: MULTI_LANG,
    label: 'manager/multi-lang',
    allowed: MANAGER_MULTI,
  },
  {
    actor: 'manager',
    langs: SINGLE_LANG,
    label: 'manager/single-lang',
    allowed: MANAGER_SINGLE,
  },
  {
    actor: 'admin',
    langs: MULTI_LANG,
    label: 'admin/multi-lang',
    allowed: MANAGER_MULTI,
  },
  {
    actor: 'admin',
    langs: SINGLE_LANG,
    label: 'admin/single-lang',
    allowed: MANAGER_SINGLE,
  },
  {
    actor: 'service',
    langs: MULTI_LANG,
    label: 'service/multi-lang',
    allowed: SERVICE_MULTI,
  },
  {
    actor: 'service',
    langs: SINGLE_LANG,
    label: 'service/single-lang',
    allowed: SERVICE_SINGLE,
  },
];

describe('canTransition — full matrix (every from→to pair, every actor)', () => {
  for (const { actor, langs, label, allowed } of MATRIX) {
    it(`${label}: allows exactly the SPEC §5 edges`, () => {
      const allowedSet = new Set(allowed);
      for (const from of CARD_STATUSES) {
        for (const to of CARD_STATUSES) {
          if (from === to) continue;
          const result = canTransition(actor, from, to, validCtx(langs));
          expect(result.ok, `${label} ${from}->${to}`).toBe(
            allowedSet.has(edge(from, to)),
          );
        }
      }
    });
  }

  it('rejects from===to for every status', () => {
    for (const s of CARD_STATUSES) {
      const result = canTransition('admin', s, s, validCtx(MULTI_LANG));
      expect(result).toEqual({ ok: false, reason: 'same_status' });
    }
  });
});

describe('skip-translated logic (SPEC §5: skipped when client has one language)', () => {
  it('multi-lang: visual_ready must go through translated, not straight to approved', () => {
    expect(
      canTransition(
        'manager',
        'visual_ready',
        'approved',
        validCtx(MULTI_LANG),
      ),
    ).toEqual({ ok: false, reason: 'translation_required' });
    expect(
      canTransition(
        'member',
        'visual_ready',
        'translated',
        validCtx(MULTI_LANG),
      ),
    ).toEqual({ ok: true });
  });

  it('single-lang: translated step is skipped entirely', () => {
    expect(
      canTransition(
        'member',
        'visual_ready',
        'translated',
        validCtx(SINGLE_LANG),
      ),
    ).toEqual({ ok: false, reason: 'translation_skipped_single_lang' });
    expect(
      canTransition(
        'manager',
        'visual_ready',
        'approved',
        validCtx(SINGLE_LANG),
      ),
    ).toEqual({ ok: true });
  });
});

describe('approval guard (manager/admin/service only)', () => {
  it('member cannot approve', () => {
    expect(
      canTransition('member', 'translated', 'approved', validCtx(MULTI_LANG)),
    ).toEqual({ ok: false, reason: 'approve_requires_manager' });
    expect(
      canTransition(
        'member',
        'visual_ready',
        'approved',
        validCtx(SINGLE_LANG),
      ),
    ).toEqual({ ok: false, reason: 'approve_requires_manager' });
  });

  it('manager, admin and service (magic link) can approve', () => {
    for (const actor of ['manager', 'admin', 'service'] as const) {
      expect(
        canTransition(actor, 'translated', 'approved', validCtx(MULTI_LANG)),
      ).toEqual({ ok: true });
    }
  });
});

describe('reject edge (→ copy_draft from awaiting-approval status)', () => {
  it('manager/service reject returns the card to copy_draft', () => {
    for (const actor of ['manager', 'admin', 'service'] as const) {
      expect(
        canTransition(actor, 'translated', 'copy_draft', validCtx(MULTI_LANG)),
      ).toEqual({ ok: true });
      expect(
        canTransition(
          actor,
          'visual_ready',
          'copy_draft',
          validCtx(SINGLE_LANG),
        ),
      ).toEqual({ ok: true });
    }
  });

  it('member cannot reject', () => {
    expect(
      canTransition('member', 'translated', 'copy_draft', validCtx(MULTI_LANG)),
    ).toEqual({ ok: false, reason: 'reject_requires_manager' });
  });

  it('multi-lang cards are not rejectable from visual_ready (approval happens at translated)', () => {
    expect(
      canTransition(
        'manager',
        'visual_ready',
        'copy_draft',
        validCtx(MULTI_LANG),
      ),
    ).toEqual({ ok: false, reason: 'unknown_transition' });
  });
});

describe('scheduling guards (future scheduled_at + ≥1 platform)', () => {
  it('rejects a missing scheduled_at', () => {
    expect(
      canTransition('member', 'approved', 'scheduled', {
        langs: MULTI_LANG,
        scheduledAt: null,
        platforms: ['instagram'],
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'schedule_requires_future_date' });
  });

  it('rejects a past scheduled_at', () => {
    expect(
      canTransition('member', 'approved', 'scheduled', {
        langs: MULTI_LANG,
        scheduledAt: PAST,
        platforms: ['instagram'],
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'schedule_requires_future_date' });
  });

  it('rejects scheduled_at exactly at now (must be strictly future)', () => {
    expect(
      canTransition('member', 'approved', 'scheduled', {
        langs: MULTI_LANG,
        scheduledAt: NOW,
        platforms: ['instagram'],
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'schedule_requires_future_date' });
  });

  it('rejects empty platforms', () => {
    expect(
      canTransition('member', 'approved', 'scheduled', {
        langs: MULTI_LANG,
        scheduledAt: FUTURE,
        platforms: [],
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'schedule_requires_platform' });
    expect(
      canTransition('member', 'approved', 'scheduled', {
        langs: MULTI_LANG,
        scheduledAt: FUTURE,
        now: NOW,
      }),
    ).toEqual({ ok: false, reason: 'schedule_requires_platform' });
  });

  it('accepts a future date with a platform', () => {
    expect(
      canTransition('member', 'approved', 'scheduled', validCtx(MULTI_LANG)),
    ).toEqual({ ok: true });
  });
});

describe('publishing (worker/service only, from scheduled)', () => {
  it('service publishes from scheduled', () => {
    expect(
      canTransition('service', 'scheduled', 'published', validCtx(MULTI_LANG)),
    ).toEqual({ ok: true });
  });

  it('no human role can publish — not even admin', () => {
    for (const actor of ['member', 'manager', 'admin'] as const) {
      expect(
        canTransition(actor, 'scheduled', 'published', validCtx(MULTI_LANG)),
      ).toEqual({ ok: false, reason: 'publish_requires_service_role' });
    }
  });

  it('service cannot publish from a non-scheduled status', () => {
    for (const from of [
      'idea',
      'copy_draft',
      'visual_ready',
      'translated',
      'approved',
    ] as const) {
      const result = canTransition(
        'service',
        from,
        'published',
        validCtx(MULTI_LANG),
      );
      expect(result.ok, `service ${from}->published`).toBe(false);
    }
  });
});

describe('archiving', () => {
  it('any actor archives from any status', () => {
    for (const actor of ['member', 'manager', 'admin', 'service'] as const) {
      for (const from of CARD_STATUSES.filter((s) => s !== 'archived')) {
        expect(
          canTransition(actor, from, 'archived', validCtx(MULTI_LANG)).ok,
          `${actor} ${from}->archived`,
        ).toBe(true);
      }
    }
  });

  it('archived is terminal — no way out, even for admin/service', () => {
    for (const actor of ['admin', 'service'] as const) {
      for (const to of CARD_STATUSES.filter((s) => s !== 'archived')) {
        expect(
          canTransition(actor, 'archived', to, validCtx(MULTI_LANG)),
        ).toEqual({ ok: false, reason: 'archived_is_terminal' });
      }
    }
  });
});

describe('forward chain happy path', () => {
  it('multi-lang card walks the full pipeline', () => {
    const steps: Array<[Actor, CardStatus, CardStatus]> = [
      ['member', 'idea', 'copy_draft'],
      ['member', 'copy_draft', 'visual_ready'],
      ['member', 'visual_ready', 'translated'],
      ['manager', 'translated', 'approved'],
      ['member', 'approved', 'scheduled'],
      ['service', 'scheduled', 'published'],
    ];
    for (const [actor, from, to] of steps) {
      expect(
        canTransition(actor, from, to, validCtx(MULTI_LANG)).ok,
        `${from}->${to}`,
      ).toBe(true);
    }
  });

  it('single-lang card skips translated', () => {
    const steps: Array<[Actor, CardStatus, CardStatus]> = [
      ['member', 'idea', 'copy_draft'],
      ['member', 'copy_draft', 'visual_ready'],
      ['manager', 'visual_ready', 'approved'],
      ['member', 'approved', 'scheduled'],
      ['service', 'scheduled', 'published'],
    ];
    for (const [actor, from, to] of steps) {
      expect(
        canTransition(actor, from, to, validCtx(SINGLE_LANG)).ok,
        `${from}->${to}`,
      ).toBe(true);
    }
  });
});
