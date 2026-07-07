/**
 * Card status machine — SPEC.md §5.
 *
 * idea → copy_draft → visual_ready → [translated] → approved → scheduled → published
 *                                                       ↘ (reject) → copy_draft
 * any → archived
 *
 * - `translated` is skipped when the client has a single language.
 * - Only manager/admin or the service role (approval magic link) may approve.
 * - Rejecting a card awaiting approval (translated, or visual_ready for a
 *   single-language client) returns it to copy_draft.
 * - `scheduled` requires a future scheduled_at and at least one platform.
 * - `published` is set only by the publish worker (service role).
 * - `archived` is terminal; unarchiving is not part of v1.
 *
 * This function is the single source of truth for server actions. The DB
 * trigger `cards_status_guard` (supabase/migrations/0001_init.sql) is a
 * looser backstop — keep the two in sync when either changes.
 */

export const CARD_STATUSES = [
  'idea',
  'copy_draft',
  'visual_ready',
  'translated',
  'approved',
  'scheduled',
  'published',
  'archived',
] as const;

export type CardStatus = (typeof CARD_STATUSES)[number];

export type Role = 'admin' | 'manager' | 'member';

/** `service` = worker / approval-link server route acting with the service role. */
export type Actor = Role | 'service';

export type TransitionReason =
  | 'same_status'
  | 'unknown_transition'
  | 'archived_is_terminal'
  | 'translation_skipped_single_lang'
  | 'translation_required'
  | 'approve_requires_manager'
  | 'reject_requires_manager'
  | 'publish_requires_service_role'
  | 'schedule_requires_future_date'
  | 'schedule_requires_platform';

export interface TransitionContext {
  /** client.langs — a single language skips the `translated` step. */
  langs: readonly string[];
  /** Candidate cards.scheduled_at when entering `scheduled`. */
  scheduledAt?: Date | null;
  /** Candidate cards.platforms when entering `scheduled`. */
  platforms?: readonly string[];
  /** Injectable clock for tests; defaults to `new Date()`. */
  now?: Date;
}

export type TransitionResult =
  { ok: true } | { ok: false; reason: TransitionReason };

const APPROVERS: readonly Actor[] = ['admin', 'manager', 'service'];

function deny(reason: TransitionReason): TransitionResult {
  return { ok: false, reason };
}

/** Is `to` reachable from `from` on the graph, given the client's languages? */
function edgeCheck(
  from: CardStatus,
  to: CardStatus,
  multiLang: boolean,
): TransitionReason | null {
  switch (from) {
    case 'idea':
      return to === 'copy_draft' ? null : 'unknown_transition';
    case 'copy_draft':
      return to === 'visual_ready' ? null : 'unknown_transition';
    case 'visual_ready':
      if (to === 'translated')
        return multiLang ? null : 'translation_skipped_single_lang';
      if (to === 'approved') return multiLang ? 'translation_required' : null;
      // Reject at the approval step — only single-language clients await
      // approval in visual_ready.
      if (to === 'copy_draft') return multiLang ? 'unknown_transition' : null;
      return 'unknown_transition';
    case 'translated':
      if (to === 'approved') return null;
      if (to === 'copy_draft') return null; // reject
      return 'unknown_transition';
    case 'approved':
      return to === 'scheduled' ? null : 'unknown_transition';
    case 'scheduled':
      return to === 'published' ? null : 'unknown_transition';
    case 'published':
    case 'archived':
      return 'unknown_transition';
  }
}

export function canTransition(
  actor: Actor,
  from: CardStatus,
  to: CardStatus,
  ctx: TransitionContext,
): TransitionResult {
  if (from === to) return deny('same_status');
  if (from === 'archived') return deny('archived_is_terminal');
  if (to === 'archived') return { ok: true };

  const multiLang = ctx.langs.length > 1;
  const edgeReason = edgeCheck(from, to, multiLang);
  if (edgeReason) return deny(edgeReason);

  if (to === 'approved' && !APPROVERS.includes(actor))
    return deny('approve_requires_manager');

  // Reject (→ copy_draft from an awaiting-approval status) is an approval
  // decision: manager/admin in the UI, service role via the magic link.
  if (to === 'copy_draft' && from !== 'idea' && !APPROVERS.includes(actor))
    return deny('reject_requires_manager');

  if (to === 'published' && actor !== 'service')
    return deny('publish_requires_service_role');

  if (to === 'scheduled') {
    const now = ctx.now ?? new Date();
    if (!ctx.scheduledAt || ctx.scheduledAt.getTime() <= now.getTime())
      return deny('schedule_requires_future_date');
    if (!ctx.platforms || ctx.platforms.length === 0)
      return deny('schedule_requires_platform');
  }

  return { ok: true };
}
