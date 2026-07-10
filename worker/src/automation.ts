/**
 * Worker-side automation gate (UPGRADE_SPEC §9). Thin I/O wrapper around the
 * pure lib/automation.ts engine: loads automation_settings rows through the
 * service-role client with a short in-memory cache (crons fire in bursts —
 * no reason to hit the DB per card), and answers "may the worker act on its
 * own in this domain, or must it write a suggestion instead?".
 */

import {
  mayAutoAct as mayAutoActPure,
  type AutomationDomain,
  type AutomationMode,
} from '../../lib/automation';
import { db } from './supabase';
import { log } from './log';

const CACHE_MS = 60_000;

interface SettingRow {
  key: string;
  mode: AutomationMode;
}

let cache: { rows: SettingRow[]; loadedAt: number } | undefined;

/** Load automation_settings with a 60s cache. On DB error, fall back to the
 * last good snapshot (or empty = everything defaults to 'semi'). */
export async function loadAutomationSettings(): Promise<SettingRow[]> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_MS) return cache.rows;

  const { data, error } = await db()
    .from('automation_settings')
    .select('key, mode');
  if (error) {
    log.warn({ err: error.message }, 'automation settings load failed');
    return cache?.rows ?? [];
  }
  cache = { rows: (data ?? []) as SettingRow[], loadedAt: now };
  return cache.rows;
}

/** True when effective mode (min of master + domain) allows autonomous action. */
export async function mayAutoAct(domain: AutomationDomain): Promise<boolean> {
  return mayAutoActPure(await loadAutomationSettings(), domain);
}

/** Test/ops hook: drop the cache so the next call re-reads settings. */
export function invalidateAutomationCache(): void {
  cache = undefined;
}
