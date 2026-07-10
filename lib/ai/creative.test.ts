import { describe, expect, it } from 'vitest';

import {
  buildIdeaRefinePrompt,
  buildPosterImagePrompt,
  buildScenarioPrompt,
} from './jobs';
import { IDEA_REFINE_SYSTEM, POSTER_PROMPT, SCENARIO_SYSTEM } from './prompts';
import { ideaRefineResultSchema, scenarioResultSchema } from './schemas';

describe('creative prompt templates (UPGRADE_SPEC §4 invariants)', () => {
  it('IDEA_REFINE pins the JSON contract and the type enum', () => {
    expect(IDEA_REFINE_SYSTEM).toContain('Return ONLY JSON');
    expect(IDEA_REFINE_SYSTEM).toContain(
      '"suggested_type":"post"|"reel"|"story"',
    );
    expect(IDEA_REFINE_SYSTEM).toContain('do NOT\ninvent offers');
  });

  it('SCENARIO pins the JSON contract incl. needs_shoot + shot_list', () => {
    expect(SCENARIO_SYSTEM).toContain('Return ONLY JSON');
    expect(SCENARIO_SYSTEM).toContain('"shot_list":string[]');
    expect(SCENARIO_SYSTEM).toContain('"needs_shoot":boolean');
    expect(SCENARIO_SYSTEM).toContain('"suggested_platforms":string[]');
  });

  it('POSTER is a plain image prompt (square, Turkish text rule)', () => {
    expect(POSTER_PROMPT).toContain('square (1:1)');
    expect(POSTER_PROMPT).toContain('correct Turkish');
    expect(POSTER_PROMPT).not.toContain('Return ONLY JSON');
  });
});

describe('ideaRefineResultSchema', () => {
  const valid = {
    title: 'Kahvaltı kampanyası',
    summary: 'Hafta sonu serpme kahvaltı menüsünü öne çıkaran bir tanıtım.',
    goal: 'Hafta sonu rezervasyonlarını artırmak',
    suggested_type: 'reel',
  };

  it('accepts a valid result', () => {
    expect(ideaRefineResultSchema.parse(valid)).toEqual(valid);
  });

  it('rejects an unknown suggested_type', () => {
    expect(
      ideaRefineResultSchema.safeParse({ ...valid, suggested_type: 'video' })
        .success,
    ).toBe(false);
  });

  it('rejects a missing goal', () => {
    const rest: Partial<typeof valid> = { ...valid };
    delete rest.goal;
    expect(ideaRefineResultSchema.safeParse(rest).success).toBe(false);
  });
});

describe('scenarioResultSchema', () => {
  const valid = {
    scenario: 'Açılış: mekân dış çekim. Ardından şefin tabağı hazırlaması.',
    shot_list: ['Dış cephe geniş açı', 'Tabak yakın çekim'],
    copy_brief: 'Sıcak, davetkâr ton; CTA: rezervasyon linki.',
    needs_shoot: true,
    suggested_platforms: ['instagram', 'tiktok'],
  };

  it('accepts a valid result', () => {
    expect(scenarioResultSchema.parse(valid)).toEqual(valid);
  });

  it('rejects a non-boolean needs_shoot', () => {
    expect(
      scenarioResultSchema.safeParse({ ...valid, needs_shoot: 'yes' }).success,
    ).toBe(false);
  });

  it('rejects a shot_list that is not string[]', () => {
    expect(
      scenarioResultSchema.safeParse({ ...valid, shot_list: [1, 2] }).success,
    ).toBe(false);
  });
});

describe('buildIdeaRefinePrompt', () => {
  const brand = '{"tone":"samimi"}';
  const built = buildIdeaRefinePrompt(brand, {
    title: 'Yeni tatlı menüsü',
    body: 'San Sebastian cheesecake geldi, duyuralım.',
  });

  it('fills brand + idea slots and leaks no placeholders', () => {
    expect(built.system).toContain(brand);
    expect(built.system).toContain('Yeni tatlı menüsü');
    expect(built.system).toContain('San Sebastian cheesecake geldi');
    expect(built.system).not.toMatch(
      /\{(brand_profile_json|idea_title|idea_body)\}/,
    );
  });

  it('uses the shared nudge, its schema and a drafting chain', () => {
    expect(built.user).toBe('Return the JSON now.');
    expect(built.schema).toBe(ideaRefineResultSchema);
    expect(built.chainKind).toBe('plan');
  });
});

describe('buildScenarioPrompt', () => {
  const brand = '{"tone":"enerjik"}';
  const built = buildScenarioPrompt(brand, {
    brief: 'Ramazan menüsü tanıtımı',
    type: 'reel',
  });

  it('fills brand + type + brief slots and leaks no placeholders', () => {
    expect(built.system).toContain(brand);
    expect(built.system).toContain('CONTENT TYPE: reel');
    expect(built.system).toContain('Ramazan menüsü tanıtımı');
    expect(built.system).not.toMatch(/\{(brand_profile_json|type|brief)\}/);
  });

  it('uses the shared nudge, its schema and a drafting chain', () => {
    expect(built.user).toBe('Return the JSON now.');
    expect(built.schema).toBe(scenarioResultSchema);
    expect(built.chainKind).toBe('plan');
  });
});

describe('buildPosterImagePrompt', () => {
  it('renders a plain string with brand + brief, no leaked slots', () => {
    const out = buildPosterImagePrompt(
      '{"colors":["#aa0000"]}',
      'Yılbaşı afişi',
    );
    expect(typeof out).toBe('string');
    expect(out).toContain('{"colors":["#aa0000"]}');
    expect(out).toContain('Yılbaşı afişi');
    expect(out).not.toMatch(/\{(brand_profile_json|brief)\}/);
  });

  it('renders a missing brief as empty instead of a literal slot', () => {
    const out = buildPosterImagePrompt('{}', '');
    expect(out).toContain('POSTER BRIEF: \n');
    expect(out).not.toMatch(/\{brief\}/);
  });
});
