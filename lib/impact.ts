/**
 * Change-impact analysis (v4 §21, §9) — pure, deterministic, no I/O.
 *
 * Given a proposed change (moving a shoot, rescheduling a card, filing a
 * staff leave) plus pre-fetched related rows, compute which other work is
 * affected and what the sensible follow-up update would be. The server action
 * layer (lib/actions/impact.ts) fetches the rows and applies selected items;
 * the dialog (components/impact-dialog.tsx) renders them.
 *
 * Semantics per change kind:
 * - shoot_move: the linked card's date shifts by the same delta (due_at →
 *   'card' item, scheduled_at → 'publish' item); other planned/confirmed
 *   shoots using the same vehicle on the old or new Istanbul day are flagged
 *   as 'route' items (informational — the day's route needs re-planning, no
 *   data change); the client's scheduled publishes within CHAIN_WINDOW_DAYS
 *   after the shoot shift by the delta ('publish' items).
 * - card_reschedule: planned/confirmed shoots linked to the card shift by the
 *   delta ('shoot' items); when the card itself is scheduled, later scheduled
 *   publishes of the same client within CHAIN_WINDOW_DAYS shift too.
 * - leave: planned/confirmed shoots whose crew includes the person and whose
 *   start day falls inside the leave window are proposed to move to the first
 *   day after the leave (same Istanbul wall-clock time); the person's open
 *   cards due inside the window get the same day-after proposal.
 *
 * All timestamps in and out are UTC ISO strings; day math uses the Istanbul
 * calendar day (store UTC, display/compare Europe/Istanbul).
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

const TZ = 'Europe/Istanbul';

/** Scheduled publishes this many days after the moved item count as its chain. */
export const CHAIN_WINDOW_DAYS = 7;

export type ProposedChange =
  | { kind: 'shoot_move'; shootId: string; startsAt: string }
  | {
      kind: 'card_reschedule';
      cardId: string;
      at: string;
      /**
       * Pre-move anchor (`scheduled_at ?? due_at` before the reschedule was
       * saved). The apply pass runs AFTER the primary save, so the stored
       * anchor already equals `at` and recomputing from the row would always
       * yield delta 0 — pass the original value here to keep compute and
       * apply on the same anchor. The action layer validates it against the
       * current row before any write.
       */
      from?: string;
    }
  | { kind: 'leave'; profileId: string; startsOn: string; endsOn: string };

/** Minimal shoot row the analysis needs (subset of Tables<'shoots'>). */
export interface ImpactShoot {
  id: string;
  title: string;
  client_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  crew: string[];
  vehicle_id: string | null;
  card_id: string | null;
}

/** Minimal card row the analysis needs (subset of Tables<'cards'>). */
export interface ImpactCard {
  id: string;
  title: string;
  client_id: string;
  status: string;
  assignee: string | null;
  due_at: string | null;
  scheduled_at: string | null;
}

export interface ImpactContext {
  shoots: ImpactShoot[];
  cards: ImpactCard[];
}

export type ImpactKind = 'card' | 'shoot' | 'route' | 'publish';

export type ImpactReason =
  | 'linked_card' // card linked to the moved shoot
  | 'linked_shoot' // shoot linked to the rescheduled card
  | 'shared_vehicle' // another shoot uses the same vehicle that day
  | 'publish_chain' // scheduled publish inside the client's chain window
  | 'crew_on_leave' // shoot whose crew includes the person on leave
  | 'assignee_on_leave'; // card assigned to the person, due inside the window

export interface ImpactItem {
  kind: ImpactKind;
  /** Affected row id — cards.id for card/publish, shoots.id for shoot/route. */
  id: string;
  title: string;
  /** Current date value (UTC ISO). */
  current: string;
  /** Proposed date value (UTC ISO); equals `current` for informational 'route' items. */
  proposed: string;
  reason: ImpactReason;
}

const ACTIVE_SHOOT_STATUSES = ['planned', 'confirmed'];
const TERMINAL_CARD_STATUSES = ['published', 'archived'];

function isActiveShoot(shoot: ImpactShoot): boolean {
  return ACTIVE_SHOOT_STATUSES.includes(shoot.status);
}

function isOpenCard(card: ImpactCard): boolean {
  return !TERMINAL_CARD_STATUSES.includes(card.status);
}

/** Istanbul calendar day (yyyy-MM-dd) of a UTC timestamp. */
function istDay(ts: string): string {
  return formatInTimeZone(new Date(ts), TZ, 'yyyy-MM-dd');
}

function shiftIso(ts: string, deltaMs: number): string {
  return new Date(new Date(ts).getTime() + deltaMs).toISOString();
}

/** Same Istanbul wall-clock time as `ts`, on the day after `endsOn`. */
function dayAfterAt(ts: string, endsOn: string): string {
  const time = formatInTimeZone(new Date(ts), TZ, 'HH:mm:ss');
  const d = new Date(`${endsOn}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return fromZonedTime(`${d.toISOString().slice(0, 10)}T${time}`, TZ).toISOString();
}

const KIND_RANK: Record<ImpactKind, number> = {
  shoot: 0,
  card: 1,
  publish: 2,
  route: 3,
};

function sortItems(items: ImpactItem[]): ImpactItem[] {
  return items.sort(
    (a, b) =>
      KIND_RANK[a.kind] - KIND_RANK[b.kind] ||
      a.current.localeCompare(b.current) ||
      a.id.localeCompare(b.id),
  );
}

/** Scheduled publishes of `clientId` within the chain window after `anchorTs`. */
function publishChain(
  ctx: ImpactContext,
  clientId: string,
  anchorTs: string,
  deltaMs: number,
  exclude: Set<string>,
): ImpactItem[] {
  const start = new Date(anchorTs).getTime();
  const end = start + CHAIN_WINDOW_DAYS * 24 * 3600 * 1000;
  const items: ImpactItem[] = [];
  for (const card of ctx.cards) {
    if (exclude.has(card.id) || card.client_id !== clientId) continue;
    if (card.status !== 'scheduled' || !card.scheduled_at) continue;
    const t = new Date(card.scheduled_at).getTime();
    if (t <= start || t > end) continue;
    items.push({
      kind: 'publish',
      id: card.id,
      title: card.title,
      current: card.scheduled_at,
      proposed: shiftIso(card.scheduled_at, deltaMs),
      reason: 'publish_chain',
    });
  }
  return items;
}

function shootMoveImpact(
  change: Extract<ProposedChange, { kind: 'shoot_move' }>,
  ctx: ImpactContext,
): ImpactItem[] {
  const shoot = ctx.shoots.find((s) => s.id === change.shootId);
  if (!shoot) return [];
  const delta =
    new Date(change.startsAt).getTime() - new Date(shoot.starts_at).getTime();
  if (delta === 0) return [];

  const items: ImpactItem[] = [];
  const seenCards = new Set<string>();

  // Linked card: its date moves with the shoot.
  if (shoot.card_id) {
    const card = ctx.cards.find((c) => c.id === shoot.card_id);
    if (card && isOpenCard(card)) {
      if (card.scheduled_at) {
        items.push({
          kind: 'publish',
          id: card.id,
          title: card.title,
          current: card.scheduled_at,
          proposed: shiftIso(card.scheduled_at, delta),
          reason: 'linked_card',
        });
        seenCards.add(card.id);
      } else if (card.due_at) {
        items.push({
          kind: 'card',
          id: card.id,
          title: card.title,
          current: card.due_at,
          proposed: shiftIso(card.due_at, delta),
          reason: 'linked_card',
        });
        seenCards.add(card.id);
      }
    }
  }

  // Route: other shoots on the same vehicle, on the old or the new day.
  if (shoot.vehicle_id) {
    const oldDay = istDay(shoot.starts_at);
    const newDay = istDay(change.startsAt);
    for (const other of ctx.shoots) {
      if (other.id === shoot.id || !isActiveShoot(other)) continue;
      if (other.vehicle_id !== shoot.vehicle_id) continue;
      const day = istDay(other.starts_at);
      if (day !== oldDay && day !== newDay) continue;
      items.push({
        kind: 'route',
        id: other.id,
        title: other.title,
        current: other.starts_at,
        proposed: other.starts_at,
        reason: 'shared_vehicle',
      });
    }
  }

  // The client's publish chain seeded by the shoot's current start.
  items.push(
    ...publishChain(ctx, shoot.client_id, shoot.starts_at, delta, seenCards),
  );

  return sortItems(items);
}

function cardRescheduleImpact(
  change: Extract<ProposedChange, { kind: 'card_reschedule' }>,
  ctx: ImpactContext,
): ImpactItem[] {
  const card = ctx.cards.find((c) => c.id === change.cardId);
  if (!card) return [];
  // A card without a date (unscheduled tray) has nothing linked to shift.
  // `from` (the validated pre-move anchor) wins over the stored value, which
  // at apply time has already been overwritten with `change.at`.
  const currentTs = change.from ?? card.scheduled_at ?? card.due_at;
  if (!currentTs) return [];
  const delta = new Date(change.at).getTime() - new Date(currentTs).getTime();
  if (delta === 0) return [];

  const items: ImpactItem[] = [];

  // Shoots linked to this card move with it.
  for (const shoot of ctx.shoots) {
    if (shoot.card_id !== card.id || !isActiveShoot(shoot)) continue;
    items.push({
      kind: 'shoot',
      id: shoot.id,
      title: shoot.title,
      current: shoot.starts_at,
      proposed: shiftIso(shoot.starts_at, delta),
      reason: 'linked_shoot',
    });
  }

  // Chain only applies when the dragged card is itself a scheduled publish.
  // Seed the window from the pre-move anchor (for a scheduled card currentTs
  // IS its scheduled_at, or the `from` override at apply time).
  if (card.status === 'scheduled' && card.scheduled_at) {
    items.push(
      ...publishChain(
        ctx,
        card.client_id,
        currentTs,
        delta,
        new Set([card.id]),
      ),
    );
  }

  return sortItems(items);
}

function leaveImpact(
  change: Extract<ProposedChange, { kind: 'leave' }>,
  ctx: ImpactContext,
): ImpactItem[] {
  const items: ImpactItem[] = [];

  for (const shoot of ctx.shoots) {
    if (!isActiveShoot(shoot) || !shoot.crew.includes(change.profileId))
      continue;
    const day = istDay(shoot.starts_at);
    if (day < change.startsOn || day > change.endsOn) continue;
    items.push({
      kind: 'shoot',
      id: shoot.id,
      title: shoot.title,
      current: shoot.starts_at,
      proposed: dayAfterAt(shoot.starts_at, change.endsOn),
      reason: 'crew_on_leave',
    });
  }

  for (const card of ctx.cards) {
    if (!isOpenCard(card) || card.assignee !== change.profileId) continue;
    if (!card.due_at) continue;
    const day = istDay(card.due_at);
    if (day < change.startsOn || day > change.endsOn) continue;
    items.push({
      kind: 'card',
      id: card.id,
      title: card.title,
      current: card.due_at,
      proposed: dayAfterAt(card.due_at, change.endsOn),
      reason: 'assignee_on_leave',
    });
  }

  return sortItems(items);
}

/**
 * The one entry point: proposed change + pre-fetched rows → affected items,
 * sorted shoot → card → publish → route, then by date.
 */
export function computeImpactItems(
  change: ProposedChange,
  ctx: ImpactContext,
): ImpactItem[] {
  switch (change.kind) {
    case 'shoot_move':
      return shootMoveImpact(change, ctx);
    case 'card_reschedule':
      return cardRescheduleImpact(change, ctx);
    case 'leave':
      return leaveImpact(change, ctx);
  }
}
