'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole, requireSession } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Dynamic task types (v4 §6, migration 0010): the görev türleri catalog the
 * managers maintain in Ayarlar. workload_points feeds lib/workload scoring;
 * default_assignee pre-fills new cards; RLS mirror: mgr_write_task_types.
 * Inserts are logged by the 0010 trigger (`task_type.created`); updates have
 * no trigger, so they are logged here (hard rule 2).
 */

const taskTypeFields = {
  name: z.string().min(1).max(120),
  defaultMinutes: z.number().int().min(5).max(1440),
  workloadPoints: z.number().int().min(0).max(100),
  requiresReview: z.boolean(),
  priority: z.number().int().min(1).max(5),
  autoOpen: z.boolean(),
  dependsOn: z.uuid().nullish(),
  defaultAssignee: z.uuid().nullish(),
};

const createTaskTypeSchema = z.object({
  ...taskTypeFields,
  defaultMinutes: taskTypeFields.defaultMinutes.default(60),
  workloadPoints: taskTypeFields.workloadPoints.default(1),
  requiresReview: taskTypeFields.requiresReview.default(false),
  priority: taskTypeFields.priority.default(3),
  autoOpen: taskTypeFields.autoOpen.default(false),
});

export async function createTaskType(
  input: z.input<typeof createTaskTypeSchema>,
): Promise<ActionResult<{ id: string }>> {
  await requireRole('admin', 'manager');
  const parsed = createTaskTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('task_types')
    .insert({
      name: parsed.data.name,
      default_minutes: parsed.data.defaultMinutes,
      workload_points: parsed.data.workloadPoints,
      requires_review: parsed.data.requiresReview,
      priority: parsed.data.priority,
      auto_open: parsed.data.autoOpen,
      depends_on: parsed.data.dependsOn ?? null,
      default_assignee: parsed.data.defaultAssignee ?? null,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/settings');
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true, data: { id: data.id } };
}

const updateTaskTypeSchema = z.object({
  taskTypeId: z.uuid(),
  name: taskTypeFields.name.optional(),
  defaultMinutes: taskTypeFields.defaultMinutes.optional(),
  workloadPoints: taskTypeFields.workloadPoints.optional(),
  requiresReview: taskTypeFields.requiresReview.optional(),
  priority: taskTypeFields.priority.optional(),
  autoOpen: taskTypeFields.autoOpen.optional(),
  dependsOn: z.uuid().nullable().optional(),
  defaultAssignee: z.uuid().nullable().optional(),
  active: z.boolean().optional(),
});

/** Edit/(de)activate a task type (deactivate = { active: false }). */
export async function updateTaskType(
  input: z.input<typeof updateTaskTypeSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = updateTaskTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { taskTypeId, ...fields } = parsed.data;

  // A type must not depend on itself (depends_on gates auto-open ordering).
  if (fields.dependsOn === taskTypeId)
    return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data: updated, error } = await supabase
    .from('task_types')
    .update({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.defaultMinutes !== undefined && {
        default_minutes: fields.defaultMinutes,
      }),
      ...(fields.workloadPoints !== undefined && {
        workload_points: fields.workloadPoints,
      }),
      ...(fields.requiresReview !== undefined && {
        requires_review: fields.requiresReview,
      }),
      ...(fields.priority !== undefined && { priority: fields.priority }),
      ...(fields.autoOpen !== undefined && { auto_open: fields.autoOpen }),
      ...(fields.dependsOn !== undefined && { depends_on: fields.dependsOn }),
      ...(fields.defaultAssignee !== undefined && {
        default_assignee: fields.defaultAssignee,
      }),
      ...(fields.active !== undefined && { active: fields.active }),
    })
    .eq('id', taskTypeId)
    .select('id, name')
    .single();
  if (error) return { ok: false, error: error.message };

  // No update trigger on task_types — log here (hard rule 2).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      action: 'task_type.updated',
      detail: {
        task_type_id: taskTypeId,
        name: updated.name,
        fields: Object.keys(fields),
      },
    });

  revalidatePath('/settings');
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true };
}

const setCardTaskTypeSchema = z.object({
  cardId: z.uuid(),
  /** null detaches the görev türü from the card. */
  taskTypeId: z.uuid().nullable(),
});

/**
 * Attach/clear a görev türü on an existing card (workroom header select).
 * Mirrors createCard's defaults (v4 §6): an unassigned card picks up the
 * type's default_assignee; inactive/unknown types are rejected server-side.
 */
export async function setCardTaskType(
  input: z.input<typeof setCardTaskTypeSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = setCardTaskTypeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { cardId, taskTypeId } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: card } = await supabase
    .from('cards')
    .select('id, client_id, assignee')
    .eq('id', cardId)
    .single();
  if (!card) return { ok: false, error: 'cardNotFound' };

  let assignee = card.assignee;
  if (taskTypeId) {
    const { data: taskType } = await supabase
      .from('task_types')
      .select('id, active, default_assignee')
      .eq('id', taskTypeId)
      .single();
    if (!taskType || !taskType.active)
      return { ok: false, error: 'validation' };
    if (!assignee) assignee = taskType.default_assignee;
  }

  const { error } = await supabase
    .from('cards')
    .update({ task_type_id: taskTypeId, assignee })
    .eq('id', cardId);
  if (error) return { ok: false, error: error.message };

  // Card triggers only cover insert/status/assignment — the type change
  // itself is logged here (hard rule 2).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: card.client_id,
      card_id: cardId,
      action: 'card.task_type_set',
      detail: { task_type_id: taskTypeId },
    });

  revalidatePath('/board');
  revalidatePath(`/cards/${cardId}`);
  revalidatePath('/dashboard');
  return { ok: true };
}
