import { describe, expect, it } from 'vitest';

import {
  haversineKm,
  suggestRoute,
  suggestShootSlots,
  type Booking,
  type SlotInput,
  type StaffMember,
  type VehicleInfo,
} from './index';

// Monday 2026-07-06, 06:00 Istanbul (03:00 UTC — Turkey is UTC+3, no DST).
// Workday 09:00–19:00 Istanbul = 06:00Z–16:00Z; a 210-min block therefore
// fits starts from 06:00Z through 12:30Z.
const NOW = new Date('2026-07-06T03:00:00.000Z');
const MON_0900_IST = new Date('2026-07-06T06:00:00.000Z');
const MON_1900_IST = new Date('2026-07-06T16:00:00.000Z');
const TUE_0900_IST = new Date('2026-07-07T06:00:00.000Z');

const staff = (
  id: string,
  leaves: StaffMember['leaves'] = [],
): StaffMember => ({
  id,
  name: id.toUpperCase(),
  leaves,
});

const vehicle = (id: string, capacity: number): VehicleInfo => ({
  id,
  name: id.toUpperCase(),
  capacity,
});

function input(overrides: Partial<SlotInput> = {}): SlotInput {
  return {
    availability: [],
    staff: [staff('a'), staff('b')],
    vehicles: [],
    bookings: [],
    horizonDays: 1,
    now: NOW,
    ...overrides,
  };
}

describe('suggestShootSlots — Istanbul workday boundaries', () => {
  it('starts no earlier than 09:00 Istanbul and ends by 19:00', () => {
    const out = suggestShootSlots(input());
    expect(out.length).toBeGreaterThan(0);
    for (const slot of out) {
      expect(slot.startsAt.getTime()).toBeGreaterThanOrEqual(
        MON_0900_IST.getTime(),
      );
      expect(slot.endsAt.getTime()).toBeLessThanOrEqual(MON_1900_IST.getTime());
    }
    // earliest slot ranks first (sooner = higher score)
    expect(out[0].startsAt.toISOString()).toBe('2026-07-06T06:00:00.000Z');
  });

  it('fits the whole 210-min block before end of workday', () => {
    // Availability 15:00–19:00 Istanbul: only 15:00 and 15:30 starts fit.
    const out = suggestShootSlots(
      input({
        availability: [
          {
            startsAt: new Date('2026-07-06T12:00:00.000Z'),
            endsAt: new Date('2026-07-06T16:00:00.000Z'),
          },
        ],
      }),
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-07-06T12:00:00.000Z',
      '2026-07-06T12:30:00.000Z',
    ]);
  });

  it('yields nothing when the clipped window is shorter than the block', () => {
    // Availability 07:00–12:00 Istanbul clips to 09:00–12:00 = 3h < 3.5h.
    const out = suggestShootSlots(
      input({
        availability: [
          {
            startsAt: new Date('2026-07-06T04:00:00.000Z'),
            endsAt: new Date('2026-07-06T09:00:00.000Z'),
          },
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it('clips a window spanning midnight to per-day workday sub-windows', () => {
    // Mon 18:00 Istanbul → Tue 13:00 Istanbul: Monday leftover is 1h (too
    // short), Tuesday 09:00–13:00 fits two starts.
    const out = suggestShootSlots(
      input({
        availability: [
          {
            startsAt: new Date('2026-07-06T15:00:00.000Z'),
            endsAt: new Date('2026-07-07T10:00:00.000Z'),
          },
        ],
        horizonDays: 2,
      }),
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-07-07T06:00:00.000Z',
      '2026-07-07T06:30:00.000Z',
    ]);
  });

  it('ignores availability windows entirely in the past', () => {
    const out = suggestShootSlots(
      input({
        availability: [
          {
            startsAt: new Date('2026-06-29T06:00:00.000Z'),
            endsAt: new Date('2026-06-30T16:00:00.000Z'),
          },
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it('honors a custom blockMinutes', () => {
    const out = suggestShootSlots(
      input({
        blockMinutes: 60,
        availability: [
          {
            startsAt: new Date('2026-07-06T15:00:00.000Z'),
            endsAt: new Date('2026-07-06T16:00:00.000Z'),
          },
        ],
      }),
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual([
      '2026-07-06T15:00:00.000Z',
    ]);
  });

  it('caps the result list at 10', () => {
    const out = suggestShootSlots(input({ horizonDays: 10 }));
    expect(out).toHaveLength(10);
  });
});

describe('suggestShootSlots — leave exclusion', () => {
  it('skips days where leave shrinks the crew below crewSize', () => {
    const out = suggestShootSlots(
      input({
        staff: [
          staff('a', [{ startsOn: '2026-07-06', endsOn: '2026-07-06' }]),
          staff('b'),
        ],
        horizonDays: 2,
      }),
    );
    expect(out.length).toBeGreaterThan(0);
    for (const slot of out) {
      expect(slot.startsAt.getTime()).toBeGreaterThanOrEqual(
        TUE_0900_IST.getTime(),
      );
    }
    expect(out[0].startsAt.toISOString()).toBe('2026-07-07T06:00:00.000Z');
  });

  it('still suggests when enough staff remain despite a leave', () => {
    const out = suggestShootSlots(
      input({
        staff: [
          staff('a', [{ startsOn: '2026-07-06', endsOn: '2026-07-06' }]),
          staff('b'),
          staff('c'),
        ],
      }),
    );
    expect(out.length).toBeGreaterThan(0);
    // the member on leave is never picked
    for (const slot of out) expect(slot.crew).not.toContain('a');
  });
});

describe('suggestShootSlots — double-booking exclusion', () => {
  const allDayBooking = (
    crew: string[],
    vehicleId: string | null = null,
  ): Booking => ({
    startsAt: MON_0900_IST,
    endsAt: MON_1900_IST,
    crew,
    vehicleId,
  });

  it('excludes crew booked on an overlapping shoot', () => {
    const out = suggestShootSlots(
      input({ bookings: [allDayBooking(['a'])], horizonDays: 1 }),
    );
    expect(out).toEqual([]); // only b left, crewSize 2
  });

  it('treats a booking touching the slot edge as non-overlapping', () => {
    // Booking ends 09:30Z (12:30 Istanbul); the 09:30Z slot is the first
    // where both staff are free again.
    const out = suggestShootSlots(
      input({
        bookings: [
          {
            startsAt: MON_0900_IST,
            endsAt: new Date('2026-07-06T09:30:00.000Z'),
            crew: ['a'],
            vehicleId: null,
          },
        ],
      }),
    );
    expect(out[0].startsAt.toISOString()).toBe('2026-07-06T09:30:00.000Z');
  });

  it('excludes a vehicle booked on an overlapping shoot', () => {
    const out = suggestShootSlots(
      input({
        staff: [staff('a'), staff('b'), staff('c')],
        vehicles: [vehicle('v2', 1), vehicle('v1', 4)],
        bookings: [allDayBooking([], 'v1')],
      }),
    );
    // v1 is busy all day, v2 can't fit a crew of 2 → nothing on Monday
    expect(out).toEqual([]);
  });
});

describe('suggestShootSlots — vehicles and ranking', () => {
  it('picks the first vehicle that fits the crew (capacity check)', () => {
    const out = suggestShootSlots(
      input({ vehicles: [vehicle('small', 1), vehicle('van', 4)] }),
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].vehicleId).toBe('van');
    expect(out[0].reasons).toContain('araç: VAN');
  });

  it('suggests without a vehicle when none exist', () => {
    const out = suggestShootSlots(input());
    expect(out[0].vehicleId).toBeNull();
    expect(out[0].reasons).toContain('araç gerekmiyor');
  });

  it('picks crew in input order', () => {
    const out = suggestShootSlots(
      input({ staff: [staff('a'), staff('b'), staff('c')] }),
    );
    expect(out[0].crew).toEqual(['a', 'b']);
  });

  it('ranks more free staff above a marginally earlier slot', () => {
    // c is booked 06:00–08:00Z: slots overlapping that window have 2 free
    // staff, later slots have 3 — the +5/member bonus outweighs 2h of delay.
    const out = suggestShootSlots(
      input({
        staff: [staff('a'), staff('b'), staff('c')],
        bookings: [
          {
            startsAt: MON_0900_IST,
            endsAt: new Date('2026-07-06T08:00:00.000Z'),
            crew: ['c'],
            vehicleId: null,
          },
        ],
      }),
    );
    expect(out[0].startsAt.toISOString()).toBe('2026-07-06T08:00:00.000Z');
    expect(out[0].reasons).toContain('3 uygun ekip üyesi');
  });
});

// ---------- routing ----------

const KIZILAY = { lat: 39.9208, lng: 32.8541 };
const TAKSIM = { lat: 41.037, lng: 28.985 };

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm(KIZILAY, KIZILAY)).toBe(0);
  });

  it('is symmetric', () => {
    expect(haversineKm(KIZILAY, TAKSIM)).toBeCloseTo(
      haversineKm(TAKSIM, KIZILAY),
      10,
    );
  });

  it('measures one degree of latitude as ~111.2 km', () => {
    expect(haversineKm({ lat: 39, lng: 32 }, { lat: 40, lng: 32 })).toBeCloseTo(
      111.2,
      0,
    );
  });

  it('gives a sane Ankara–Istanbul distance (straight line ~350 km)', () => {
    const km = haversineKm(KIZILAY, TAKSIM);
    expect(km).toBeGreaterThan(340);
    expect(km).toBeLessThan(360);
  });
});

describe('suggestRoute', () => {
  const CANKAYA = {
    id: 'cankaya',
    name: 'Çankaya',
    lat: 39.9032,
    lng: 32.8618,
  };
  const KECIOREN = {
    id: 'kecioren',
    name: 'Keçiören',
    lat: 40.0212,
    lng: 32.8639,
  };
  const SINCAN = { id: 'sincan', name: 'Sincan', lat: 39.9741, lng: 32.5762 };

  it('returns an empty route for no stops', () => {
    expect(suggestRoute([], KIZILAY)).toEqual({
      stops: [],
      totalKm: 0,
      totalMinutes: 0,
    });
  });

  it('orders stops nearest-neighbor from the depot', () => {
    const route = suggestRoute([SINCAN, CANKAYA, KECIOREN], KIZILAY);
    expect(route.stops.map((s) => s.id)).toEqual([
      'cankaya',
      'kecioren',
      'sincan',
    ]);
    expect(route.stops.map((s) => s.order)).toEqual([1, 2, 3]);
  });

  it('accumulates ETA at 40 km/h with a plausible intra-Ankara total', () => {
    const route = suggestRoute([SINCAN, CANKAYA, KECIOREN], KIZILAY);
    expect(route.totalKm).toBeGreaterThan(35);
    expect(route.totalKm).toBeLessThan(45);
    // cumulative ETA is strictly increasing
    for (let i = 1; i < route.stops.length; i += 1) {
      expect(route.stops[i].etaMinutes).toBeGreaterThan(
        route.stops[i - 1].etaMinutes,
      );
    }
    // total equals the last stop's cumulative ETA
    expect(route.totalMinutes).toBe(route.stops.at(-1)!.etaMinutes);
    // ~40 km at 40 km/h ≈ an hour on the road
    expect(route.totalMinutes).toBeGreaterThan(50);
    expect(route.totalMinutes).toBeLessThan(75);
  });

  it('handles a single stop', () => {
    const route = suggestRoute([CANKAYA], KIZILAY);
    expect(route.stops).toHaveLength(1);
    expect(route.stops[0].order).toBe(1);
    expect(route.stops[0].legKm).toBeCloseTo(route.totalKm, 1);
  });
});
