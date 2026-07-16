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
  equipmentConflicts,
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

/**
 * Save-time KRİTİK ENGEL checks (v4 §4/§5) — these block the save even with
 * force:true: equipment reserved by another planned/confirmed shoot in an
 * overlapping window, the vehicle physically double-booked by an overlapping
 * shoot, or the vehicle inside one of its unavailability blocks.
 */
async function shootResourceConflict(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  opts: {
    startsAt: Date;
    endsAt: Date;
    equipmentIds: string[];
    vehicleId: string | null;
    excludeShootId?: string;
  },
): Promise<'equipment_conflict' | 'vehicle_conflict' | 'vehicle_blocked' | null> {
  if (opts.equipmentIds.length > 0) {
    let query = supabase
      .from('shoots')
      .select('id, starts_at, ends_at, equipment_ids')
      .in('status', ['planned', 'confirmed'])
      .lt('starts_at', opts.endsAt.toISOString())
      .gt('ends_at', opts.startsAt.toISOString())
      .overlaps('equipment_ids', opts.equipmentIds);
    if (opts.excludeShootId) query = query.neq('id', opts.excludeShootId);
    const { data: clashing } = await query;
    const conflicts = equipmentConflicts(
      { startsAt: opts.startsAt, endsAt: opts.endsAt },
      opts.equipmentIds,
      (clashing ?? []).map((s) => ({
        startsAt: new Date(s.starts_at),
        endsAt: new Date(s.ends_at),
        equipmentIds: s.equipment_ids,
      })),
    );
    if (conflicts.length > 0) return 'equipment_conflict';
  }
  if (opts.vehicleId) {
    // physically double-booked: another planned/confirmed shoot overlaps
    let vehicleQuery = supabase
      .from('shoots')
      .select('id')
      .in('status', ['planned', 'confirmed'])
      .eq('vehicle_id', opts.vehicleId)
      .lt('starts_at', opts.endsAt.toISOString())
      .gt('ends_at', opts.startsAt.toISOString())
      .limit(1);
    if (opts.excludeShootId)
      vehicleQuery = vehicleQuery.neq('id', opts.excludeShootId);
    const { data: vehicleClash } = await vehicleQuery;
    if (vehicleClash?.length) return 'vehicle_conflict';

    const { data: blocks } = await supabase
      .from('vehicle_blocks')
      .select('id')
      .eq('vehicle_id', opts.vehicleId)
      .lte('starts_on', istanbulDateString(opts.endsAt))
      .gte('ends_on', istanbulDateString(opts.startsAt))
      .limit(1);
    if (blocks?.length) return 'vehicle_blocked';
  }
  return null;
}

/**
 * UYARI check (v4 §5 conflict UX): crew members that have another
 * planned/confirmed shoot on the same Istanbul day. Not a hard block — the
 * UI offers "Uyarıya rağmen kaydet" which re-submits with force:true, and the
 * action then logs `shoot.force_saved` (hard rule 2).
 */
async function crewBusySameDay(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  opts: {
    startsAt: Date;
    endsAt: Date;
    crew: string[];
    excludeShootId?: string;
  },
): Promise<string[]> {
  if (opts.crew.length === 0) return [];
  const dayStart = istanbulToUtc(
    `${istanbulDateString(opts.startsAt)}T00:00:00`,
  );
  const dayEnd = new Date(
    istanbulToUtc(`${istanbulDateString(opts.endsAt)}T00:00:00`).getTime() +
      24 * 3600 * 1000,
  );

  let query = supabase
    .from('shoots')
    .select('id, crew')
    .in('status', ['planned', 'confirmed'])
    .lt('starts_at', dayEnd.toISOString())
    .gt('ends_at', dayStart.toISOString())
    .overlaps('crew', opts.crew);
  if (opts.excludeShootId) query = query.neq('id', opts.excludeShootId);
  const { data: sameDay } = await query;

  const busy = new Set<string>();
  for (const shoot of sameDay ?? []) {
    for (const id of shoot.crew) {
      if (opts.crew.includes(id)) busy.add(id);
    }
  }
  return [...busy];
}

const createShootSchema = z.object({
  clientId: z.uuid(),
  title: z.string().min(1).max(200),
  briefMd: z.string().max(20000).default(''),
  startsAt: z.iso.datetime({ offset: true }),
  /** Defaults to startsAt + 210 min (SHOOT_BLOCK_MINUTES). */
  endsAt: z.iso.datetime({ offset: true }).nullish(),
  crew: z.array(z.uuid()).max(20).default([]),
  vehicleId: z.uuid().nullish(),
  /** Reserved equipment (v4 §5) — conflict-checked like crew/vehicle. */
  equipmentIds: z.array(z.uuid()).max(30).default([]),
  /** Save despite the crew-busy UYARI ("Uyarıya rağmen kaydet"). Never
   * bypasses KRİTİK ENGEL conflicts. */
  force: z.boolean().default(false),
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

  const conflict = await shootResourceConflict(supabase, {
    startsAt,
    endsAt,
    equipmentIds: parsed.data.equipmentIds,
    vehicleId: parsed.data.vehicleId ?? null,
  });
  if (conflict) return { ok: false, error: conflict };

  const busyCrew = await crewBusySameDay(supabase, {
    startsAt,
    endsAt,
    crew: parsed.data.crew,
  });
  if (busyCrew.length > 0 && !parsed.data.force)
    return { ok: false, error: 'crew_busy' };

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
      equipment_ids: parsed.data.equipmentIds,
      location: client.location,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  // Saving over an acknowledged UYARI is itself an auditable decision
  // (hard rule 2) — who overrode which warning, and why it fired.
  if (busyCrew.length > 0 && parsed.data.force) {
    await createSupabaseAdmin()
      .from('activity_log')
      .insert({
        actor: session.userId,
        client_id: parsed.data.clientId,
        action: 'shoot.force_saved',
        detail: {
          shoot_id: data.id,
          warning: 'crew_busy',
          busy_crew: busyCrew,
          day: istanbulDateString(startsAt),
        },
      });
  }

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
  equipmentIds: z.array(z.uuid()).max(30).optional(),
  /** Save despite the crew-busy UYARI — see createShootSchema.force. */
  force: z.boolean().default(false),
});

export async function updateShoot(
  input: z.input<typeof updateShootSchema>,
): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = updateShootSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { shootId, force, ...fields } = parsed.data;

  const supabase = await createSupabaseServer();
  const { data: shoot } = await supabase
    .from('shoots')
    .select(
      'id, client_id, starts_at, ends_at, status, crew, vehicle_id, equipment_ids',
    )
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

  // Double-booking gate on the effective (post-update) values (v4 §4/§5).
  const effectiveStartsAt = startsAt ?? new Date(shoot.starts_at);
  const effectiveEndsAt = endsAt ?? new Date(shoot.ends_at);
  const conflict = await shootResourceConflict(supabase, {
    startsAt: effectiveStartsAt,
    endsAt: effectiveEndsAt,
    equipmentIds: fields.equipmentIds ?? shoot.equipment_ids,
    vehicleId:
      fields.vehicleId !== undefined ? fields.vehicleId : shoot.vehicle_id,
    excludeShootId: shootId,
  });
  if (conflict) return { ok: false, error: conflict };

  const busyCrew = await crewBusySameDay(supabase, {
    startsAt: effectiveStartsAt,
    endsAt: effectiveEndsAt,
    crew: fields.crew ?? shoot.crew,
    excludeShootId: shootId,
  });
  if (busyCrew.length > 0 && !force) return { ok: false, error: 'crew_busy' };

  const { error } = await supabase
    .from('shoots')
    .update({
      ...(fields.title !== undefined && { title: fields.title }),
      ...(fields.briefMd !== undefined && { brief_md: fields.briefMd }),
      ...(startsAt && { starts_at: startsAt.toISOString() }),
      ...(endsAt && { ends_at: endsAt.toISOString() }),
      ...(fields.crew !== undefined && { crew: fields.crew }),
      ...(fields.vehicleId !== undefined && { vehicle_id: fields.vehicleId }),
      ...(fields.equipmentIds !== undefined && {
        equipment_ids: fields.equipmentIds,
      }),
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

  // Acknowledged-warning save is logged separately (hard rule 2).
  if (busyCrew.length > 0 && force) {
    await createSupabaseAdmin()
      .from('activity_log')
      .insert({
        actor: session.userId,
        client_id: shoot.client_id,
        action: 'shoot.force_saved',
        detail: {
          shoot_id: shootId,
          warning: 'crew_busy',
          busy_crew: busyCrew,
          day: istanbulDateString(effectiveStartsAt),
        },
      });
  }

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
  /** Equipment the shoot will reserve — slots where it is double-booked by
   * an overlapping shoot are skipped (v4 §5). */
  equipmentIds: z.array(z.uuid()).max(30).optional(),
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
  const [
    availabilityRes,
    profilesRes,
    leavesRes,
    vehiclesRes,
    bookingsRes,
    vehicleBlocksRes,
  ] = await Promise.all([
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
      .select('starts_at, ends_at, crew, vehicle_id, equipment_ids')
      .in('status', ['planned', 'confirmed'])
      .gte('ends_at', now.toISOString()),
    // Blocked vehicles must not be suggested inside the window (v4 §4).
    supabase
      .from('vehicle_blocks')
      .select('vehicle_id, starts_on, ends_on')
      .gte('ends_on', istanbulDateString(now)),
  ]);

  const leavesByProfile = new Map<string, LeaveRange[]>();
  for (const leave of leavesRes.data ?? []) {
    const list = leavesByProfile.get(leave.profile_id) ?? [];
    list.push({ startsOn: leave.starts_on, endsOn: leave.ends_on });
    leavesByProfile.set(leave.profile_id, list);
  }

  const blocksByVehicle = new Map<string, LeaveRange[]>();
  for (const block of vehicleBlocksRes.data ?? []) {
    const list = blocksByVehicle.get(block.vehicle_id) ?? [];
    list.push({ startsOn: block.starts_on, endsOn: block.ends_on });
    blocksByVehicle.set(block.vehicle_id, list);
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
    blocks: blocksByVehicle.get(v.id) ?? [],
  }));
  const bookings: Booking[] = (bookingsRes.data ?? []).map((b) => ({
    startsAt: new Date(b.starts_at),
    endsAt: new Date(b.ends_at),
    crew: b.crew,
    vehicleId: b.vehicle_id,
    equipmentIds: b.equipment_ids,
  }));

  const slots = suggestShootSlots({
    availability,
    staff,
    vehicles,
    bookings,
    crewSize: parsed.data.crewSize,
    equipmentIds: parsed.data.equipmentIds,
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
  /** Regular driver (profiles.id) — v4 §4. */
  driver: z.uuid().nullish(),
  notes: z.string().max(2000).default(''),
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
    .insert({
      name: parsed.data.name,
      plate: parsed.data.plate,
      capacity: parsed.data.capacity,
      driver: parsed.data.driver ?? null,
      notes: parsed.data.notes,
    })
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
  driver: z.uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
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
      ...(fields.driver !== undefined && { driver: fields.driver }),
      ...(fields.notes !== undefined && { notes: fields.notes }),
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

// ---------- vehicle blocks (manager/admin — mirrors RLS mgr_write_vehicle_blocks) ----------

const createVehicleBlockSchema = z
  .object({
    vehicleId: z.uuid(),
    startsOn: z.iso.date(),
    endsOn: z.iso.date(),
    reason: z.string().max(500).default(''),
  })
  .refine((v) => v.endsOn >= v.startsOn);

/** Mark a vehicle unavailable (maintenance, rental return…) — v4 §4. The
 * 0010 insert trigger logs `vehicle.blocked` (hard rule 2). */
export async function createVehicleBlock(
  input: z.input<typeof createVehicleBlockSchema>,
): Promise<ActionResult<{ id: string }>> {
  const session = await requireRole('admin', 'manager');
  const parsed = createVehicleBlockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from('vehicle_blocks')
    .insert({
      vehicle_id: parsed.data.vehicleId,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
      reason: parsed.data.reason,
      created_by: session.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath('/production');
  return { ok: true, data: { id: data.id } };
}

const deleteVehicleBlockSchema = z.object({ blockId: z.uuid() });

export async function deleteVehicleBlock(
  input: z.input<typeof deleteVehicleBlockSchema>,
): Promise<ActionResult> {
  const session = await requireRole('admin', 'manager');
  const parsed = deleteVehicleBlockSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };

  const supabase = await createSupabaseServer();
  const { data: block } = await supabase
    .from('vehicle_blocks')
    .select('id, vehicle_id, starts_on, ends_on')
    .eq('id', parsed.data.blockId)
    .single();
  if (!block) return { ok: false, error: 'notFound' };

  const { error } = await supabase
    .from('vehicle_blocks')
    .delete()
    .eq('id', block.id);
  if (error) return { ok: false, error: error.message };

  // No delete trigger on vehicle_blocks — log here (hard rule 2).
  await createSupabaseAdmin()
    .from('activity_log')
    .insert({
      actor: session.userId,
      action: 'vehicle.block_deleted',
      detail: {
        block_id: block.id,
        vehicle_id: block.vehicle_id,
        starts_on: block.starts_on,
        ends_on: block.ends_on,
      },
    });

  revalidatePath('/production');
  return { ok: true };
}

// Equipment CRUD lives in lib/actions/equipment.ts (v4 §5).

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
