'use server';

import {
  completeUpload,
  fetchEditJob,
  fetchMessages,
  presignUpload,
  submitAvailability,
  submitContact,
  submitDecision,
  submitEditRequest,
  submitIdea,
  submitMessage,
  type PortalEditJobState,
  type PortalMessage,
} from '@/lib/portal/service';
import type { ClientContact } from '@/lib/db/domain';
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

// ---------- v3: messages / info / upload / edit ----------

export async function submitPortalMessage(input: {
  token: string;
  body: string;
}): Promise<ActionResult> {
  return submitMessage(input.token, { body: input.body });
}

export async function fetchPortalMessages(
  token: string,
): Promise<ActionResult<{ messages: PortalMessage[] }>> {
  return fetchMessages(token);
}

export async function submitPortalContact(input: {
  token: string;
  contact: ClientContact;
}): Promise<ActionResult> {
  return submitContact(input.token, input.contact);
}

export async function presignPortalUpload(input: {
  token: string;
  filename: string;
  contentType: string;
  size: number;
}): Promise<ActionResult<{ key: string; url: string }>> {
  return presignUpload(input.token, {
    filename: input.filename,
    contentType: input.contentType,
    size: input.size,
  });
}

export async function completePortalUpload(input: {
  token: string;
  key: string;
  kind: 'image' | 'video';
  originalName: string;
}): Promise<ActionResult<{ assetId: string }>> {
  return completeUpload(input.token, {
    key: input.key,
    kind: input.kind,
    originalName: input.originalName,
  });
}

export async function submitPortalEditRequest(input: {
  token: string;
  kind: 'edit_video' | 'edit_photo';
  assetIds: string[];
  prompt: string;
}): Promise<ActionResult<{ jobId: string }>> {
  return submitEditRequest(input.token, {
    kind: input.kind,
    assetIds: input.assetIds,
    prompt: input.prompt,
  });
}

export async function fetchPortalEditJob(input: {
  token: string;
  jobId: string;
}): Promise<ActionResult<PortalEditJobState>> {
  return fetchEditJob(input.token, input.jobId);
}
