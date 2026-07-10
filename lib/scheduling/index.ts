/**
 * Shoot scheduling + route suggestion (UPGRADE_SPEC §3) — pure, deterministic,
 * injectable clock, no I/O. Used by /production UI (server actions) and the
 * worker crons. Straight-line haversine heuristic — no paid Maps API ($0 rule).
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const SHOOT_BLOCK_MINUTES = 210; // 3.5 h — client requirement
export const WORKDAY_START_HOUR = 9;
export const WORKDAY_END_HOUR = 19;
export const CITY_SPEED_KMH = 40;
const TZ = 'Europe/Istanbul';
const STEP_MINUTES = 30;

export interface LeaveRange {
  startsOn: string; // yyyy-MM-dd inclusive
  endsOn: string; // yyyy-MM-dd inclusive
}

export interface StaffMember {
  id: string;
  name: string;
  leaves: LeaveRange[];
}

export interface VehicleInfo {
  id: string;
  name: string;
  capacity: number;
}

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

/** Existing commitments that block crew/vehicle double-booking. */
export interface Booking extends TimeRange {
  crew: string[];
  vehicleId: string | null;
}

export interface SlotInput {
  /** Client müsaitlik windows; empty = any workday time in horizon. */
  availability: TimeRange[];
  staff: StaffMember[];
  vehicles: VehicleInfo[];
  bookings: Booking[];
  /** Crew size to assemble (default 2). */
  crewSize?: number;
  blockMinutes?: number;
  /** Search horizon in days (default 10). */
  horizonDays?: number;
  now: Date;
}

export interface SlotSuggestion extends TimeRange {
  crew: string[]; // staff ids
  vehicleId: string | null;
  score: number; // higher = better (sooner + more free crew)
  reasons: string[];
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

function onLeave(member: StaffMember, at: Date): boolean {
  const day = formatInTimeZone(at, TZ, 'yyyy-MM-dd');
  return member.leaves.some((l) => day >= l.startsOn && day <= l.endsOn);
}

/** Clip a window to the Istanbul workday; yields per-day sub-windows. */
function* workdayWindows(range: TimeRange): Generator<TimeRange> {
  let cursor = new Date(range.startsAt);
  while (cursor < range.endsAt) {
    const day = formatInTimeZone(cursor, TZ, 'yyyy-MM-dd');
    const dayStart = fromZonedTime(
      `${day}T${String(WORKDAY_START_HOUR).padStart(2, '0')}:00:00`,
      TZ,
    );
    const dayEnd = fromZonedTime(
      `${day}T${String(WORKDAY_END_HOUR).padStart(2, '0')}:00:00`,
      TZ,
    );
    const s = new Date(Math.max(dayStart.getTime(), range.startsAt.getTime()));
    const e = new Date(Math.min(dayEnd.getTime(), range.endsAt.getTime()));
    if (s < e) yield { startsAt: s, endsAt: e };
    // next day 00:00 Istanbul
    const nextDay = fromZonedTime(`${day}T00:00:00`, TZ);
    nextDay.setUTCDate(nextDay.getUTCDate() + 2); // safe skip across DST
    const next = fromZonedTime(
      `${formatInTimeZone(nextDay, TZ, 'yyyy-MM-dd')}T00:00:00`,
      TZ,
    );
    cursor = new Date(
      Math.max(next.getTime() - 24 * 3600 * 1000, dayEnd.getTime()),
    );
  }
}

/**
 * Rank candidate 210-min blocks with a free crew + vehicle. Deterministic:
 * earliest slots first, staff/vehicles picked in input order.
 */
export function suggestShootSlots(input: SlotInput): SlotSuggestion[] {
  const block = (input.blockMinutes ?? SHOOT_BLOCK_MINUTES) * 60_000;
  const crewSize = input.crewSize ?? 2;
  const horizonEnd = new Date(
    input.now.getTime() + (input.horizonDays ?? 10) * 24 * 3600 * 1000,
  );

  const windows: TimeRange[] = input.availability.length
    ? input.availability
    : [{ startsAt: input.now, endsAt: horizonEnd }];

  const out: SlotSuggestion[] = [];

  for (const window of windows) {
    const clipped: TimeRange = {
      startsAt: new Date(
        Math.max(window.startsAt.getTime(), input.now.getTime()),
      ),
      endsAt: new Date(Math.min(window.endsAt.getTime(), horizonEnd.getTime())),
    };
    if (clipped.startsAt >= clipped.endsAt) continue;

    for (const day of workdayWindows(clipped)) {
      for (
        let t = day.startsAt.getTime();
        t + block <= day.endsAt.getTime();
        t += STEP_MINUTES * 60_000
      ) {
        const slot: TimeRange = {
          startsAt: new Date(t),
          endsAt: new Date(t + block),
        };

        const busyCrew = new Set(
          input.bookings
            .filter((b) => overlaps(b, slot))
            .flatMap((b) => b.crew),
        );
        const freeStaff = input.staff.filter(
          (m) => !busyCrew.has(m.id) && !onLeave(m, slot.startsAt),
        );
        if (freeStaff.length < crewSize) continue;

        const busyVehicles = new Set(
          input.bookings
            .filter((b) => overlaps(b, slot) && b.vehicleId)
            .map((b) => b.vehicleId as string),
        );
        const vehicle =
          input.vehicles.find((v) => !busyVehicles.has(v.id)) ?? null;
        if (input.vehicles.length > 0 && !vehicle) continue;

        const hoursFromNow =
          (slot.startsAt.getTime() - input.now.getTime()) / 3600_000;
        out.push({
          ...slot,
          crew: freeStaff.slice(0, crewSize).map((m) => m.id),
          vehicleId: vehicle?.id ?? null,
          score:
            Math.round((1000 - hoursFromNow + freeStaff.length * 5) * 10) / 10,
          reasons: [
            `${freeStaff.length} uygun ekip üyesi`,
            vehicle ? `araç: ${vehicle.name}` : 'araç gerekmiyor',
          ],
        });
        if (out.length >= 200) break;
      }
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, 10);
}

// ---------- routing ----------

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteStop extends GeoPoint {
  id: string;
  name: string;
}

export interface RoutedStop extends RouteStop {
  order: number;
  legKm: number;
  etaMinutes: number; // cumulative from depot
}

export interface RouteSuggestion {
  stops: RoutedStop[];
  totalKm: number;
  totalMinutes: number;
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Nearest-neighbor ordering from a depot; ETA at city speed. */
export function suggestRoute(
  stops: RouteStop[],
  depot: GeoPoint,
): RouteSuggestion {
  const remaining = [...stops];
  const ordered: RoutedStop[] = [];
  let here: GeoPoint = depot;
  let km = 0;

  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    remaining.forEach((s, i) => {
      const d = haversineKm(here, s);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    });
    const [next] = remaining.splice(bestIdx, 1);
    km += bestDist;
    ordered.push({
      ...next,
      order: ordered.length + 1,
      legKm: Math.round(bestDist * 10) / 10,
      etaMinutes: Math.round((km / CITY_SPEED_KMH) * 60),
    });
    here = next;
  }

  return {
    stops: ordered,
    totalKm: Math.round(km * 10) / 10,
    totalMinutes: Math.round((km / CITY_SPEED_KMH) * 60),
  };
}
