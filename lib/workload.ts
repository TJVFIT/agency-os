/**
 * Workload-balancing engine (v4) — pure, deterministic, no I/O.
 *
 * Grounded in prior art (Asana Workload, Linear cycle capacity, ops
 * literature): compute per-person utilization from open cards + upcoming
 * shoot crew duty, band it with median-relative thresholds, and emit ranked
 * *transfer suggestions*. Nothing here ever moves a card — a human accepts a
 * suggestion (lib/actions/automation.ts executes it under RLS and the 0005
 * assignment trigger logs it). Callers: lib/actions/workload.ts (manager
 * quick action) and worker/src/cron.ts (daily 09:30 scan) — both feed live
 * rows into the same functions so the dashboard and the cron always agree.
 */

import { interpolate, tr } from './i18n/tr';

// Statuses that still carry work for the assignee. approved/scheduled/
// published/archived are done from the team's perspective (SPEC §5).
export const OPEN_CARD_STATUSES = [
  'idea',
  'copy_draft',
  'visual_ready',
  'translated',
] as const;

export type OpenCardStatus = (typeof OPEN_CARD_STATUSES)[number];

/** Points a crew slot on one upcoming shoot adds to a member's load. */
export const SHOOT_POINTS = 2;

/** Over/idle bands relative to the team median (Asana-style traffic light). */
export const OVER_RATIO = 1.2;
export const IDLE_RATIO = 0.6;

/**
 * Below this team size median-relative bands are meaningless noise (with two
 * people someone is almost always ">120% of median") — everyone reads as
 * balanced and no transfers are suggested.
 */
export const MIN_TEAM_FOR_LEVELS = 3;

/** Cap on suggestions per run — a short reviewable list, not a reorg. */
export const MAX_TRANSFER_SUGGESTIONS = 5;

/** Horizon (days) for "upcoming" shoots counted into the load. */
export const WORKLOAD_HORIZON_DAYS = 7;

export interface WorkloadMemberInput {
  id: string;
  name: string;
}

export interface WorkloadCardInput {
  id: string;
  title: string;
  assignee: string | null;
  /** cards.status — non-open statuses are ignored defensively. */
  status: string;
  /** cards.due_at ISO string (UTC) or null. */
  dueAt: string | null;
  /** cards.task_type_id — resolved against `taskTypePoints`, fallback 1. */
  taskTypeId: string | null;
}

export type WorkloadLevel = 'over' | 'balanced' | 'idle';

export interface MemberWorkload {
  id: string;
  name: string;
  points: number;
  level: WorkloadLevel;
}

export interface TransferSuggestion {
  cardId: string;
  cardTitle: string;
  /** Donor profile id, or null when the card comes from the unassigned pool. */
  from: string | null;
  /** Receiver profile id. */
  to: string;
  /** Effective points the move shifts. */
  points: number;
}

function isOpen(status: string): status is OpenCardStatus {
  return (OPEN_CARD_STATUSES as readonly string[]).includes(status);
}

function cardPoints(
  card: WorkloadCardInput,
  taskTypePoints: Record<string, number>,
): number {
  const pts = card.taskTypeId ? taskTypePoints[card.taskTypeId] : undefined;
  return typeof pts === 'number' && Number.isFinite(pts) && pts >= 0 ? pts : 1;
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Per-member load: Σ open-card points (task_type workload_points, fallback 1)
 * + SHOOT_POINTS per upcoming shoot the member crews. Levels are relative to
 * the team median; tiny teams (< MIN_TEAM_FOR_LEVELS) and a zero median (most
 * of the team has nothing open) read as all-balanced — flagging "over" against
 * nothing is noise, not signal. Sorted busiest-first, deterministic.
 */
export function computeWorkload(
  members: readonly WorkloadMemberInput[],
  cards: readonly WorkloadCardInput[],
  shootCrews: readonly (readonly string[])[],
  taskTypePoints: Record<string, number> = {},
): MemberWorkload[] {
  const byId = new Map(
    members.map((m) => [m.id, { id: m.id, name: m.name, points: 0 }]),
  );

  for (const card of cards) {
    if (!isOpen(card.status) || !card.assignee) continue;
    const entry = byId.get(card.assignee);
    if (!entry) continue; // assignee not in the member set — ignore
    entry.points += cardPoints(card, taskTypePoints);
  }

  for (const crew of shootCrews) {
    for (const profileId of crew) {
      const entry = byId.get(profileId);
      if (entry) entry.points += SHOOT_POINTS;
    }
  }

  const rows = [...byId.values()];
  const median = medianOf(rows.map((r) => r.points));
  const flat = rows.length < MIN_TEAM_FOR_LEVELS || median <= 0;

  const level = (points: number): WorkloadLevel => {
    if (flat) return 'balanced';
    if (points > median * OVER_RATIO) return 'over';
    if (points < median * IDLE_RATIO) return 'idle';
    return 'balanced';
  };

  return rows
    .map((r) => ({ ...r, level: level(r.points) }))
    .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id));
}

const STATUS_RANK: Record<OpenCardStatus, number> = {
  idea: 0,
  copy_draft: 1,
  visual_ready: 2,
  translated: 3,
};

/** Donor-card ordering: un-started first, then due-furthest (null = furthest). */
function compareMovability(a: WorkloadCardInput, b: WorkloadCardInput): number {
  const rank =
    STATUS_RANK[a.status as OpenCardStatus] -
    STATUS_RANK[b.status as OpenCardStatus];
  if (rank !== 0) return rank;
  const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (dueA !== dueB) return dueB - dueA; // furthest due first — safest to move
  return a.id.localeCompare(b.id);
}

/**
 * Ranked transfer suggestions, max MAX_TRANSFER_SUGGESTIONS.
 *
 * Greedy with pruning (ops-literature pattern): drain the unassigned pool
 * first (a virtual infinitely-over donor), then the 'over' members busiest
 * first. Each card goes to the least-loaded 'idle' receiver still under the
 * median; the simulated receiver/donor loads are updated after every move so
 * a receiver saturates (≥ median) and a donor stops once no longer over.
 * Within a donor, un-started cards (idea/copy_draft) move before in-flight
 * ones, and among those the due-furthest card moves first.
 */
export function suggestTransfers(
  workloads: readonly MemberWorkload[],
  cards: readonly WorkloadCardInput[],
  taskTypePoints: Record<string, number> = {},
): TransferSuggestion[] {
  const median = medianOf(workloads.map((w) => w.points));
  const receivers = workloads
    .filter((w) => w.level === 'idle')
    .map((w) => ({ id: w.id, points: w.points }));
  if (receivers.length === 0) return [];

  const open = cards.filter((c) => isOpen(c.status));

  // Donor queues in drain order: pool first, then over members busiest-first.
  const donors: Array<{ from: string | null; points: number }> = [
    { from: null, points: Number.POSITIVE_INFINITY },
    ...workloads
      .filter((w) => w.level === 'over')
      .sort((a, b) => b.points - a.points || a.id.localeCompare(b.id))
      .map((w) => ({ from: w.id as string | null, points: w.points })),
  ];

  const out: TransferSuggestion[] = [];
  for (const donor of donors) {
    const queue = open
      .filter((c) => c.assignee === donor.from)
      .sort(compareMovability);

    for (const card of queue) {
      if (out.length >= MAX_TRANSFER_SUGGESTIONS) return out;
      // Pruning: a real donor stops donating once no longer over.
      if (donor.from !== null && donor.points <= median * OVER_RATIO) break;

      const receiver = receivers
        .filter((r) => r.points < median && r.id !== donor.from)
        .sort((a, b) => a.points - b.points || a.id.localeCompare(b.id))[0];
      if (!receiver) return out; // every receiver saturated

      const points = cardPoints(card, taskTypePoints);
      out.push({
        cardId: card.id,
        cardTitle: card.title,
        from: donor.from,
        to: receiver.id,
        points,
      });
      receiver.points += points;
      donor.points -= points;
    }
  }
  return out;
}

/**
 * Turkish suggestion title, identical for the server action and the worker
 * cron so both produce the same row text. Falls back to tr.common.unknown for
 * names outside the map; the unassigned pool is labelled tr.workload.pool
 * ("Havuz"), degrading to tr.common.unknown if the key is ever removed.
 */
export function transferTitle(
  transfer: TransferSuggestion,
  namesById: Record<string, string>,
): string {
  const poolLabel =
    (tr.workload as { pool?: string }).pool ?? tr.common.unknown;
  return interpolate(tr.workload.suggestion, {
    from: transfer.from
      ? (namesById[transfer.from] ?? tr.common.unknown)
      : poolLabel,
    to: namesById[transfer.to] ?? tr.common.unknown,
    title: transfer.cardTitle,
  });
}
