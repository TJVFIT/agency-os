/**
 * Automation modes (UPGRADE_SPEC §9, client req 39–40).
 * Effective mode = min(master, domain) on the suggest < semi < full order —
 * flipping master to `suggest` is the kill switch: the whole system goes
 * manual/suggestion-only. Approval remains human in every mode (hard rule 1).
 */

// NOTE: 'compliance' is intentionally NOT a domain. The pre-publish compliance
// gate is always-on (never auto-publish non-compliant content — hard rule 1),
// so a suggest/semi/full toggle for it would be a no-op. The v2 audit flagged
// the old 'compliance' control as dead; it was removed here. The seeded
// automation_settings 'compliance' row (migration 0006) is now inert.
export const AUTOMATION_DOMAINS = [
  'planner',
  'publish',
  'post_shoot',
  'reports',
] as const;
export type AutomationDomain = (typeof AUTOMATION_DOMAINS)[number];

export type AutomationMode = 'suggest' | 'semi' | 'full';

const ORDER: Record<AutomationMode, number> = { suggest: 0, semi: 1, full: 2 };

export function minMode(a: AutomationMode, b: AutomationMode): AutomationMode {
  return ORDER[a] <= ORDER[b] ? a : b;
}

/**
 * Resolve the effective mode for a domain from raw settings rows
 * (missing keys default to 'semi').
 */
export function effectiveMode(
  settings: ReadonlyArray<{ key: string; mode: AutomationMode }>,
  domain: AutomationDomain,
): AutomationMode {
  const get = (key: string): AutomationMode =>
    settings.find((s) => s.key === key)?.mode ?? 'semi';
  return minMode(get('master'), get(domain));
}

/** May the worker act on its own in this domain (vs. writing a suggestion)? */
export function mayAutoAct(
  settings: ReadonlyArray<{ key: string; mode: AutomationMode }>,
  domain: AutomationDomain,
): boolean {
  return effectiveMode(settings, domain) !== 'suggest';
}
