import { describe, expect, it } from 'vitest';

import {
  AUTOMATION_DOMAINS,
  effectiveMode,
  mayAutoAct,
  minMode,
  type AutomationMode,
} from './automation';

type Row = { key: string; mode: AutomationMode };

const rows = (obj: Record<string, AutomationMode>): Row[] =>
  Object.entries(obj).map(([key, mode]) => ({ key, mode }));

describe('minMode', () => {
  it('orders suggest < semi < full', () => {
    expect(minMode('suggest', 'semi')).toBe('suggest');
    expect(minMode('semi', 'suggest')).toBe('suggest');
    expect(minMode('suggest', 'full')).toBe('suggest');
    expect(minMode('full', 'suggest')).toBe('suggest');
    expect(minMode('semi', 'full')).toBe('semi');
    expect(minMode('full', 'semi')).toBe('semi');
  });

  it('is idempotent on equal inputs', () => {
    for (const m of ['suggest', 'semi', 'full'] as const) {
      expect(minMode(m, m)).toBe(m);
    }
  });
});

describe('effectiveMode — min(master, domain)', () => {
  it('defaults everything to semi when settings are empty', () => {
    for (const domain of AUTOMATION_DOMAINS) {
      expect(effectiveMode([], domain)).toBe('semi');
    }
  });

  it('defaults a missing domain key to semi (capped by master)', () => {
    expect(effectiveMode(rows({ master: 'full' }), 'publish')).toBe('semi');
    expect(effectiveMode(rows({ master: 'suggest' }), 'publish')).toBe(
      'suggest',
    );
  });

  it('defaults a missing master to semi (caps a full domain)', () => {
    expect(effectiveMode(rows({ publish: 'full' }), 'publish')).toBe('semi');
  });

  it('master suggest is the kill switch for every domain', () => {
    const settings = rows({
      master: 'suggest',
      planner: 'full',
      publish: 'full',
      post_shoot: 'semi',
      compliance: 'full',
      reports: 'semi',
    });
    for (const domain of AUTOMATION_DOMAINS) {
      expect(effectiveMode(settings, domain)).toBe('suggest');
    }
  });

  it('domain mode can lower but never raise the master', () => {
    expect(
      effectiveMode(rows({ master: 'full', publish: 'suggest' }), 'publish'),
    ).toBe('suggest');
    expect(
      effectiveMode(rows({ master: 'semi', publish: 'full' }), 'publish'),
    ).toBe('semi');
    expect(
      effectiveMode(rows({ master: 'full', publish: 'full' }), 'publish'),
    ).toBe('full');
  });

  it('resolves each domain independently', () => {
    const settings = rows({
      master: 'full',
      planner: 'suggest',
      reports: 'full',
    });
    expect(effectiveMode(settings, 'planner')).toBe('suggest');
    expect(effectiveMode(settings, 'reports')).toBe('full');
    expect(effectiveMode(settings, 'publish')).toBe('semi'); // missing → semi
  });
});

describe('mayAutoAct', () => {
  it('denies only the suggest effective mode', () => {
    expect(mayAutoAct(rows({ master: 'suggest' }), 'publish')).toBe(false);
    expect(
      mayAutoAct(rows({ master: 'full', publish: 'suggest' }), 'publish'),
    ).toBe(false);
    expect(mayAutoAct(rows({ master: 'semi' }), 'publish')).toBe(true);
    expect(
      mayAutoAct(rows({ master: 'full', publish: 'full' }), 'publish'),
    ).toBe(true);
    expect(mayAutoAct([], 'publish')).toBe(true); // default semi acts
  });

  it('covers every declared domain', () => {
    const killSwitch = rows({ master: 'suggest' });
    for (const domain of AUTOMATION_DOMAINS) {
      expect(mayAutoAct(killSwitch, domain)).toBe(false);
      expect(mayAutoAct([], domain)).toBe(true);
    }
  });
});
