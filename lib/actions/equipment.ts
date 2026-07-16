'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import type { ActionResult } from '@/lib/actions/cards';

/**
 * Equipment module actions (v4 §5): manager add/edit/deactivate — never a
 * hard delete from the UI, history stays intact. Availability is derived at
 * read time from overlapping shoots' equipment_ids; double-booking is gated
 * in lib/actions/production.ts via lib/scheduling equipmentConflicts.
 */

const createEquipmentSchema = z.object({
  name: z.string().min(1).max(120),
  kind: z.string().max(60).default(''),
  serial: z.string().max(120).default(''),
  /** Fixed kit that lives on a vehicle. */
  vehicleId: z.uuid().nullish(),
  notes: z.string().max(2000).default(''),
});

/** New equipment item (v4 §5). The 0010 insert trigger logs
 * `equipment.created` (hard rule 2). */
export async function createEquipment(
  input: z.input<typeof createEquipmentSchema>,
): Promise<ActionResult<{ id: string }>> {
  await requireRole('admin', 'manager');
  const parsed = createEquipmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('equipment')
    .insert({
      name: parsed.data.name,
      kind: parsed.data.kind,
      serial: parsed.data.serial,
      vehicle_id: parsed.data.vehicleId ?? null,
      notes: parsed.data.notes,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/production');
  return { ok: true, data: { id: data.id } };
}

const updateEquipmentSchema = z.object({
  equipmentId: z.uuid(),
  name: z.string().min(1).max(120).optional(),
  kind: z.string().max(60).optional(),
  serial: z.string().max(120).optional(),
  vehicleId: z.uuid().nullable().optional(),
  active: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

/** Edit/(de)activate equipment. The 0010 trigger logs active flips; other
 * field edits are logged here (hard rule 2, no double logging). */
export async function updateEquipment(
  input: z.input<typeof updateEquipmentSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = updateEquipmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { equipmentId, ...fields } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: updated, error } = await supabase
    .from('equipment')
    .update({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.kind !== undefined && { kind: fields.kind }),
      ...(fields.serial !== undefined && { serial: fields.serial }),
      ...(fields.vehicleId !== undefined && { vehicle_id: fields.vehicleId }),
      ...(fields.active !== undefined && { active: fields.active }),
      ...(fields.notes !== undefined && { notes: fields.notes }),
    })
    .eq('id', equipmentId)
    .select('id, name')
    .single();
  if (error) return { ok: false, error: error.message };

  if (fields.active === undefined) {
    await createSupabaseAdmin()
      .from('activity_log')
      .insert({
        actor: session.userId,
        action: 'equipment.updated',
        detail: { equipment_id: equipmentId, name: updated.name, ...fields },
      });
  }

  revalidatePath('/production');
  return { ok: true };
}
