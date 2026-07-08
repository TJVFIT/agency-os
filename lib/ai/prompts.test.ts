import { describe, expect, it } from 'vitest';

import {
  CAPTION_SYSTEM,
  PLANNER_SYSTEM,
  REPLY_SYSTEM,
  REPORT_SYSTEM,
  TRANSLATE_SYSTEM,
  renderPrompt,
} from './prompts';

describe('renderPrompt', () => {
  it('fills every {slot}', () => {
    const out = renderPrompt('Platform: {platform}. Brief: {brief}.', {
      platform: 'instagram',
      brief: 'yeni menü',
    });
    expect(out).toBe('Platform: instagram. Brief: yeni menü.');
  });

  it('renders missing params as empty (never leaks a literal {slot})', () => {
    const out = renderPrompt('A {x} B {y} C', { x: 'X' });
    expect(out).toBe('A X B  C');
    expect(out).not.toContain('{');
  });
});

describe('prompt templates match SPEC §6.3 verbatim (key invariants)', () => {
  it('CAPTION requires 3 variants and a char cap and forbids inline hashtags', () => {
    expect(CAPTION_SYSTEM).toContain('native Turkish');
    expect(CAPTION_SYSTEM).toContain('"variants"');
    expect(CAPTION_SYSTEM).toContain('Caption ≤ {max_chars} chars');
    expect(CAPTION_SYSTEM).toContain('No hashtags\ninside caption text');
  });

  it('TRANSLATE is transcreation, obeys glossary, keeps prices/emoji', () => {
    expect(TRANSLATE_SYSTEM).toContain('transcreation specialist');
    expect(TRANSLATE_SYSTEM).toContain('Do NOT translate literally');
    expect(TRANSLATE_SYSTEM).toContain(
      'GLOSSARY (obey exactly): {glossary_json}',
    );
    expect(TRANSLATE_SYSTEM).toContain('"translation":string,"notes":string');
  });

  it('REPLY sets escalation rules and no refund promises', () => {
    expect(REPLY_SYSTEM).toContain('never make\npromises about refunds');
    expect(REPLY_SYSTEM).toContain('"escalate":boolean');
    expect(REPLY_SYSTEM).toContain('legal threats');
  });

  it('PLANNER returns 5 ideas with concrete briefs', () => {
    expect(PLANNER_SYSTEM).toContain('content strategist');
    expect(PLANNER_SYSTEM).toContain('"ideas"');
    expect(PLANNER_SYSTEM).toContain('suggested_day');
  });

  it('REPORT is Turkish, ≤250 words, no invented numbers', () => {
    expect(REPORT_SYSTEM).toContain('weekly client report in Turkish');
    expect(REPORT_SYSTEM).toContain('no invented numbers');
    expect(REPORT_SYSTEM).toContain('≤ 250 words');
  });
});
