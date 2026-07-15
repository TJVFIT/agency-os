'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireRole, requireSession } from '@/lib/auth';
import { createSupabaseAdmin } from '@/lib/supabase/admin';
import { createSupabaseServer } from '@/lib/supabase/server';
import { effectiveMode } from '@/lib/automation';
import { istanbulDateString, istanbulToUtc } from '@/lib/dates';
import { interpolate, tr } from '@/lib/i18n/tr';
import {
  SHOOT_BLOCK_MINUTES,
  suggestRoute,
  suggestShootSlots,
  type Booking,
  type GeoPoint,
  type LeaveRange,
  type RouteStop,
  type StaffMember,
  type TimeRange,
  type VehicleInfo,
} from '@/lib/scheduling';
import type { ActionResult } from '@/lib/actions/cards';
import type { Shoot } from '@/lib/db/types';

/**
 * Production module actions (UPGRADE_SPEC §3): shoots lifecycle, slot/route
 * suggestions (pure engine in lib/scheduling), vehicles + staff leaves CRUD.
 * All mutations end up in activity_log — shoots/status via the 0006 triggers,
 * the rest logged here through the admin client (hard rule 2).
 */

type ShootStatus = Shoot['status'];

/** planned → confirmed → done; cancel from any non-terminal status. */
const SHOOT_FLOW: Record<ShootStatus, ShootStatus[]> = {
  planned: ['confirmed', 'cancelled'],
  confirmed: ['done', 'cancelled'],
  done: [],
  cancelled: [],
};

const ANKARA_CENTER: GeoPoint = { lat: 39.92, lng: 32.85 };

function toGeo(location: unknown): GeoPoint | null {
  if (!location || typeof location !== 'object') return null;
  const { lat, lng } = location as { lat?: unknown; lng?: unknown };
  return typeof lat === 'number' && typeof lng === 'number'
    ? { lat, lng }
    : null;
}

// ---------- shoots ----------

const createShootSchema = z.object({
  clientId: z.uuid(),
  title: z.string().min(1).max(200),
  briefMd: z.string().max(20000).default(''),
  startsAt: z.iso.datetime({ offset: true }),
  /** Defaults to startsAt + 210 min (SHOOT_BLOCK_MINUTES). */
  endsAt: z.iso.datetime({ offset: true }).nullish(),
  crew: z.array(z.uuid()).max(20).default([]),
  vehicleId: z.uuid().nullish(),
});

export async function createShoot(
  input: z.input<typeof createShootSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = createShootSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = parsed.data.endsAt
    ? new Date(parsed.data.endsAt)
    : new Date(startsAt.getTime() + SHOOT_BLOCK_MINUTES * 60_000);
  if (endsAt <= startsAt) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  // Shoot location defaults to the client's saved location (route planning).
  const { data: client } = await supabase
    .from('clients')
    .select('id, location')
    .eq('id', parsed.data.clientId)
    .single();
  if (!client) return { ok: false, error: 'clientNotFound' };

  const { data, error } = await supabase
    .from('shoots')
    .insert({
      client_id: parsed.data.clientId,
      title: parsed.data.title,
      brief_md: parsed.data.briefMd,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      crew: parsed.data.crew,
      vehicle_id: parsed.data.vehicleId ?? null,
      location: client.location,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/production');
  return { ok: true, data: { id: data.id } };
}

const updateShootSchema = z.object({
  shootId: z.uuid(),
  title: z.string().min(1).max(200).optional(),
  briefMd: z.string().max(20000).optional(),
  startsAt: z.iso.datetime({ offset: true }).optional(),
  endsAt: z.iso.datetime({ offset: true }).optional(),
  crew: z.array(z.uuid()).max(20).optional(),
  vehicleId: z.uuid().nullable().optional(),
});

export async function updateShoot(
  input: z.input<typeof updateShootSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateShootSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { shootId, ...fields } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: shoot } = await supabase
    .from('shoots')
    .select('id, client_id, starts_at, ends_at, status, crew')
    .eq('id', shootId)
    .single();
  if (!shoot) return { ok: false, error: 'notFound' };

  // When only the start moves, keep the block length instead of violating
  // the ends_at > starts_at check.
  let startsAt = fields.startsAt ? new Date(fields.startsAt) : null;
  let endsAt = fields.endsAt ? new Date(fields.endsAt) : null;
  if (startsAt && !endsAt) {
    const duration =
      new Date(shoot.ends_at).getTime() - new Date(shoot.starts_at).getTime();
    endsAt = new Date(startsAt.getTime() + duration);
  }
  if (!startsAt && endsAt) startsAt = new Date(shoot.starts_at);
  if (startsAt && endsAt && endsAt <= startsAt)
    return { ok: false, error: 'validation' };

  const { error } = await supabase
    .from('shoots')
    .update({
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.briefMd !== undefined && { brief_md: fields.briefMd }),
      ...(startsAt && { starts_at: startsAt.toISOString() }),
      ...(endsAt && { ends_at: endsAt.toISOString() }),
      ...(fields.crew !== undefined && { crew: fields.crew }),
      ...(fields.vehicleId !== undefined && { vehicle_id: fields.vehicleId }),
    })
    .eq('id', shootId);
  if (error) return { ok: false, error: error.message };

  // No update trigger for non-status shoot edits — log explicitly (hard rule 2).
  // detail.status + fields let the worker re-brief the crew when a *confirmed*
  // shoot's time or crew changed (UPGRADE_SPEC §3).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      client_id: shoot.client_id,
      action: 'shoot.updated',
      detail: {
        shoot_id: shootId,
        fields: Object.keys(fields),
        status: shoot.status,
      },
    });

  revalidatePath('/production');
  return { ok: true };
}

const transitionShootSchema = z.object({
  shootId: z.uuid(),
  to: z.enum(['confirmed', 'done', 'cancelled']),
});

/**
 * Shoot status gate. The 0006 trigger logs `shoot.status_changed` (the worker
 * notification dispatcher listens to it — crew brief on `confirmed`). On
 * `done` the post-shoot kurgu/metin/kontrol cards open here, automation-mode
 * aware: in `suggest` mode a suggestions row is written instead (§9).
 */
export async function transitionShoot(
  input: z.input<typeof transitionShootSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = transitionShootSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { shootId, to } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: shoot } = await supabase
    .from('shoots')
    .select('id, client_id, title, status, tasks_opened')
    .eq('id', shootId)
    .single();
  if (!shoot) return { ok: false, error: 'notFound' };

  if (!SHOOT_FLOW[shoot.status].includes(to))
    return { ok: false, error: 'unknown_transition' };

  const { data: updated, error } = await supabase
    .from('shoots')
    .update({ status: to })
    .eq('id', shootId)
    .eq('status', shoot.status) // optimistic lock: no double transitions
    .select('id');
  if (error) return { ok: false, error: error.message };
  if (!updated?.length) return { ok: false, error: 'unknown_transition' };

  if (to === 'done' && !shoot.tasks_opened)
    await openPostShootTasks(supabase, session.userId, {
      id: shoot.id,
      clientId: shoot.client_id,
      title: shoot.title,
    });

  revalidatePath('/production');
  revalidatePath('/board');
  revalidatePath('/dashboard');
  return { ok: true };
}

/**
 * Post-shoot automation (§3 + §9). `suggest` mode: write a suggestions row
 * (worker/inbox executes it on accept) and leave tasks_opened=false. Other
 * modes: open the three cards inline and log `shoot.tasks_opened`.
 */
async function openPostShootTasks(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  actorId: string,
  shoot: { id: string; clientId: string; title: string },
): Promise<void> {
  const admin = createSupabaseAdmin();
  const { data: settings } = await supabase
    .from('automation_settings')
    .select('key, mode');
  const mode = effectiveMode(settings ?? [], 'post_shoot');

  if (mode === 'suggest') {
    const { data: suggestion } = await admin
      .from('suggestions')
      .insert({
        domain: 'post_shoot',
        title: shoot.title,
        body: {
          kind: 'post_shoot_tasks',
          shoot_id: shoot.id,
          client_id: shoot.clientId,
          shoot_title: shoot.title,
        },
        client_id: shoot.clientId,
      })
      .select('id')
      .single();
    await admin.from('activity_log').insert({
      actor: actorId,
      client_id: shoot.clientId,
      action: 'suggestion.created',
      detail: {
        suggestion_id: suggestion?.id ?? null,
        domain: 'post_shoot',
        title: shoot.title,
      },
    });
    return;
  }

  const titles = [
    interpolate(tr.production.postShootTasks.edit, { title: shoot.title }),
    interpolate(tr.production.postShootTasks.copy, { title: shoot.title }),
    interpolate(tr.production.postShootTasks.review, { title: shoot.title }),
  ];
  const { data: cards, error } = await supabase
    .from('cards')
    .insert(
      titles.map((title) => ({
        client_id: shoot.clientId,
        title,
        type: 'other' as const,
        status: 'idea' as const,
        tags: ['post_shoot'],
        created_by: actorId,
      })),
    )
    .select('id');
  if (error) return; // shoot is done either way; worker's eksik-işler detector catches the gap

  await supabase
    .from('shoots')
    .update({ tasks_opened: true })
    .eq('id', shoot.id);
  await admin.from('activity_log').insert({
    actor: actorId,
    client_id: shoot.clientId,
    action: 'shoot.tasks_opened',
    detail: {
      shoot_id: shoot.id,
      title: shoot.title,
      card_ids: cards?.map((c) => c.id) ?? [],
      mode,
    },
  });
}

// ---------- slot suggestions ----------

export interface SlotSuggestionDTO {
  startsAt: string;
  endsAt: string;
  crew: string[];
  vehicleId: string | null;
  score: number;
  reasons: string[];
}

const suggestSlotsSchema = z.object({
  clientId: z.uuid(),
  crewSize: z.number().int().min(1).max(10).optional(),
});

/** Ranked shoot slots from the pure engine, serialized for the dialog. */
export async function suggestSlots(
  input: z.input<typeof suggestSlotsSchema>,
): Promise<ActionResult<SlotSuggestionDTO[]>> {
  await requireSession();
  const parsed = suggestSlotsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const now = new Date();
  const supabase = await createSupabaseServer();
  const [availabilityRes, profilesRes, leavesRes, vehiclesRes, bookingsRes] =
    await Promise.all([
      supabase
        .from('client_availability')
        .select('starts_at, ends_at')
        .eq('client_id', parsed.data.clientId)
        .gte('ends_at', now.toISOString())
        .order('starts_at'),
      supabase.from('profiles').select('id, full_name').order('full_name'),
      supabase
        .from('staff_leaves')
        .select('profile_id, starts_on, ends_on')
        .gte('ends_on', istanbulDateString(now)),
      supabase
        .from('vehicles')
        .select('id, name, capacity')
        .eq('active', true)
        .order('name'),
      supabase
        .from('shoots')
        .select('starts_at, ends_at, crew, vehicle_id')
        .in('status', ['planned', 'confirmed'])
        .gte('ends_at', now.toISOString()),
    ]);

  const leavesByProfile = new Map<string, LeaveRange[]>();
  for (const leave of leavesRes.data ?? []) {
    const list = leavesByProfile.get(leave.profile_id) ?? [];
    list.push({ startsOn: leave.starts_on, endsOn: leave.ends_on });
    leavesByProfile.set(leave.profile_id, list);
  }

  const availability: TimeRange[] = (availabilityRes.data ?? []).map((w) => ({
    startsAt: new Date(w.starts_at),
    endsAt: new Date(w.ends_at),
  }));
  const staff: StaffMember[] = (profilesRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name,
    leaves: leavesByProfile.get(p.id) ?? [],
  }));
  const vehicles: VehicleInfo[] = (vehiclesRes.data ?? []).map((v) => ({
    id: v.id,
    name: v.name,
    capacity: v.capacity,
  }));
  const bookings: Booking[] = (bookingsRes.data ?? []).map((b) => ({
    startsAt: new Date(b.starts_at),
    endsAt: new Date(b.ends_at),
    crew: b.crew,
    vehicleId: b.vehicle_id,
  }));

  const slots = suggestShootSlots({
    availability,
    staff,
    vehicles,
    bookings,
    crewSize: parsed.data.crewSize,
    now,
  });

  return {
    ok: true,
    data: slots.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      crew: s.crew,
      vehicleId: s.vehicleId,
      score: s.score,
      reasons: s.reasons,
    })),
  };
}

// ---------- route suggestion ----------

export interface RouteStopDTO {
  id: string;
  name: string;
  order: number;
  legKm: number;
  etaMinutes: number;
}

export interface RouteSuggestionDTO {
  stops: RouteStopDTO[];
  totalKm: number;
  totalMinutes: number;
  /** Shoots that day without lat/lng on their location. */
  skipped: number;
}

const suggestRouteSchema = z.object({
  day: z.iso.date(), // yyyy-MM-dd, Istanbul wall-clock day
  vehicleId: z.uuid().nullish(),
});

/**
 * Nearest-neighbor route for a day's planned/confirmed shoots (optionally one
 * vehicle's). Depot = first shoot's location, else Ankara center.
 */
export async function suggestRouteForDay(
  input: z.input<typeof suggestRouteSchema>,
): Promise<ActionResult<RouteSuggestionDTO>> {
  await requireSession();
  const parsed = suggestRouteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const dayStart = istanbulToUtc(`${parsed.data.day}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

  const supabase = await createSupabaseServer();
  let query = supabase
    .from('shoots')
    .select('id, title, starts_at, location')
    .in('status', ['planned', 'confirmed'])
    .gte('starts_at', dayStart.toISOString())
    .lt('starts_at', dayEnd.toISOString())
    .order('starts_at');
  if (parsed.data.vehicleId)
    query = query.eq('vehicle_id', parsed.data.vehicleId);
  const { data: shoots, error } = await query;
  if (error) return { ok: false, error: error.message };

  const stops: RouteStop[] = [];
  let skipped = 0;
  for (const shoot of shoots ?? []) {
    const geo = toGeo(shoot.location);
    if (geo) stops.push({ id: shoot.id, name: shoot.title, ...geo });
    else skipped += 1;
  }

  const depot = stops.length
    ? { lat: stops[0].lat, lng: stops[0].lng }
    : ANKARA_CENTER;
  const route = suggestRoute(stops, depot);

  return {
    ok: true,
    data: {
      stops: route.stops.map((s) => ({
        id: s.id,
        name: s.name,
        order: s.order,
        legKm: s.legKm,
        etaMinutes: s.etaMinutes,
      })),
      totalKm: route.totalKm,
      totalMinutes: route.totalMinutes,
      skipped,
    },
  };
}

// ---------- vehicles (manager/admin — mirrors RLS mgr_write_vehicles) ----------

const createVehicleSchema = z.object({
  name: z.string().min(1).max(100),
  plate: z.string().max(20).default(''),
  capacity: z.number().int().min(1).max(20).default(4),
});

export async function createVehicle(
  input: z.input<typeof createVehicleSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole('admin', 'manager');
  const parsed = createVehicleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('vehicles')
    .insert(parsed.data)
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  // No DB trigger on vehicles — log here (hard rule 2).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      action: 'vehicle.created',
      detail: { vehicle_id: data.id, name: parsed.data.name },
    });

  revalidatePath('/production');
  return { ok: true, data: { id: data.id } };
}

const updateVehicleSchema = z.object({
  vehicleId: z.uuid(),
  name: z.string().min(1).max(100).optional(),
  plate: z.string().max(20).optional(),
  capacity: z.number().int().min(1).max(20).optional(),
  active: z.boolean().optional(),
});

/** Edit/deactivate a vehicle (deactivate = { active: false }). */
export async function updateVehicle(
  input: z.input<typeof updateVehicleSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = updateVehicleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { vehicleId, ...fields } = parsed.data;

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from('vehicles')
    .update({
      ...(fields.name !== undefined && { name: fields.name }),
      ...(fields.plate !== undefined && { plate: fields.plate }),
      ...(fields.capacity !== undefined && { capacity: fields.capacity }),
      ...(fields.active !== undefined && { active: fields.active }),
    })
    .eq('id', vehicleId);
  if (error) return { ok: false, error: error.message };

  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      action: 'vehicle.updated',
      detail: { vehicle_id: vehicleId, ...fields },
    });

  revalidatePath('/production');
  return { ok: true };
}

// ---------- staff leaves (self or manager — mirrors RLS self_or_mgr_write_leaves) ----------

const createLeaveSchema = z
  .object({
    profileId: z.uuid(),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    note: z.string().max(500).default(''),
  })
  .refine((v) => v.endsOn >= v.startsOn);

export async function createLeave(
  input: z.input<typeof createLeaveSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  const parsed = createLeaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  if (
    parsed.data.profileId !== session.userId &&
    !['admin', 'manager'].includes(session.role)
  )
    return { ok: false, error: 'forbidden' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('staff_leaves')
    .insert({
      profile_id: parsed.data.profileId,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
      note: parsed.data.note,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      action: 'leave.created',
      detail: {
        leave_id: data.id,
        profile_id: parsed.data.profileId,
        starts_on: parsed.data.startsOn,
        ends_on: parsed.data.endsOn,
      },
    });

  revalidatePath('/production');
  return { ok: true, data: { id: data.id } };
}

const deleteLeaveSchema = z.object({ leaveId: z.uuid() });

export async function deleteLeave(
  input: z.input<typeof deleteLeaveSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = deleteLeaveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data: leave } = await supabase
    .from('staff_leaves')
    .select('id, profile_id, starts_on, ends_on')
    .eq('id', parsed.data.leaveId)
    .single();
  if (!leave) return { ok: false, error: 'notFound' };
  if (
    leave.profile_id !== session.userId &&
    !['admin', 'manager'].includes(session.role)
  )
    return { ok: false, error: 'forbidden' };

  const { error } = await supabase
    .from('staff_leaves')
    .delete()
    .eq('id', leave.id);
  if (error) return { ok: false, error: error.message };

  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      action: 'leave.deleted',
      detail: {
        leave_id: leave.id,
        profile_id: leave.profile_id,
        starts_on: leave.starts_on,
        ends_on: leave.ends_on,
      },
    });

  revalidatePath('/production');
  return { ok: true };
}
