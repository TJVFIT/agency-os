/**
 * Date helpers — store UTC, display Europe/Istanbul (CLAUDE.md conventions).
 */

import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const APP_TZ = 'Europe/Istanbul';

/** ISO/date → human string in Istanbul time. */
export function fmtIstanbul(
  date: string | Date,
  pattern = 'd MMM yyyy HH:mm',
): string {
  return formatInTimeZone(date, APP_TZ, pattern);
}

export function fmtIstanbulDate(date: string | Date): string {
  return formatInTimeZone(date, APP_TZ, 'd.MM.yyyy');
}

export function fmtIstanbulTime(date: string | Date): string {
  return formatInTimeZone(date, APP_TZ, 'HH:mm');
}

/** Local Istanbul wall-clock values (e.g. from a datetime-local input) → UTC Date. */
export function istanbulToUtc(localDateTime: string): Date {
  return fromZonedTime(localDateTime, APP_TZ);
}

/** Monday 00:00 Istanbul of the week containing `date`, as a UTC Date. */
export function istanbulWeekStart(date: Date = new Date()): Date {
  const dayStr = formatInTimeZone(date, APP_TZ, 'yyyy-MM-dd');
  const isoDay = Number(formatInTimeZone(date, APP_TZ, 'i')); // 1 = Monday
  const d = new Date(`${dayStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - (isoDay - 1));
  // d is now the Monday date (wall-clock); convert that wall-clock midnight to UTC
  return fromZonedTime(`${d.toISOString().slice(0, 10)}T00:00:00`, APP_TZ);
}

/** yyyy-MM-dd (Istanbul) — for date columns like reports.week_start. */
export function istanbulDateString(date: Date = new Date()): string {
  return formatInTimeZone(date, APP_TZ, 'yyyy-MM-dd');
}
