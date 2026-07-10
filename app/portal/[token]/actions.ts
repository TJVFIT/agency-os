'use server';

import {
  submitAvailability,
  submitDecision,
  submitIdea,
} from '@/lib/portal/service';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Public portal mutations (UPGRADE_SPEC §2). No login — the durable portal
 * token IS the auth. All validation, the token/active check and the per-token
 * rate limit live in lib/portal/service.ts (service role).
 */

export async function submitPortalIdea(input: {
  token: string;
  title: string;
  body: string;
}): Promise<ActionResult> {
  return submitIdea(input.token, { title: input.title, body: input.body });
}

export async function submitPortalAvailability(input: {
  token: string;
  startsAt: string;
  endsAt: string;
  note: string;
}): Promise<ActionResult> {
  return submitAvailability(input.token, {
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    note: input.note,
  });
}

export async function submitPortalDecision(input: {
  token: string;
  cardId: string;
  decision: 'approved' | 'rejected';
  comment: string;
}): Promise<ActionResult> {
  return submitDecision(input.token, {
    cardId: input.cardId,
    decision: input.decision,
    comment: input.comment,
  });
}
