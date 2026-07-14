import { describe, expect, it } from 'vitest';

import { photoEditSpecSchema, type PhotoEditSpec } from '../../lib/ai/schemas';
import {
  buildOverlaySvg,
  compilePhotoEdit,
  outputDimensions,
} from './edit-photo';

const SOURCE = { width: 4000, height: 3000 };

function spec(partial: Partial<PhotoEditSpec> = {}): PhotoEditSpec {
  return photoEditSpecSchema.parse(partial);
}

describe('outputDimensions', () => {
  it('uses crop presets when cropping', () => {
    expect(outputDimensions(spec({ crop: 'story' }), SOURCE)).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  it('swaps source dims for 90/270 rotations of originals', () => {
    expect(outputDimensions(spec({ rotate: 90 }), SOURCE)).toEqual({
      width: 3000,
      height: 4000,
    });
    expect(outputDimensions(spec({ rotate: 180 }), SOURCE)).toEqual(SOURCE);
  });
});

describe('compilePhotoEdit', () => {
  it('no-op spec compiles to just the output stage', () => {
    expect(compilePhotoEdit(spec(), SOURCE)).toEqual([
      { op: 'output', format: 'jpeg' },
    ]);
  });

  it('orders rotate → crop → modulate → grayscale → sharpen → overlay → output', () => {
    const ops = compilePhotoEdit(
      spec({
        crop: 'square',
        rotate: 90,
        brightness: 1.2,
        grayscale: true,
        sharpen: true,
        overlay_text: 'Kampanya',
        format: 'png',
      }),
      SOURCE,
    );
    expect(ops.map((o) => o.op)).toEqual([
      'rotate',
      'cover',
      'modulate',
      'grayscale',
      'sharpen',
      'overlay',
      'output',
    ]);
    expect(ops[1]).toEqual({ op: 'cover', width: 1080, height: 1080 });
    expect(ops[ops.length - 1]).toEqual({ op: 'output', format: 'png' });
  });

  it('skips modulate when all adjustments are neutral', () => {
    const ops = compilePhotoEdit(spec({ sharpen: true }), SOURCE);
    expect(ops.map((o) => o.op)).toEqual(['sharpen', 'output']);
  });
});

describe('buildOverlaySvg', () => {
  it('escapes XML and sizes the canvas', () => {
    const svg = buildOverlaySvg('<Çay & Kahve>', 1080, 1350, 'bottom');
    expect(svg).toContain('width="1080" height="1350"');
    expect(svg).toContain('&lt;Çay &amp; Kahve&gt;');
    expect(svg).not.toContain('<Çay');
  });

  it('positions by anchor', () => {
    const top = buildOverlaySvg('x', 1000, 1000, 'top');
    const center = buildOverlaySvg('x', 1000, 1000, 'center');
    expect(top).toContain('y="114"'); // 1.6 × fontSize(71)
    expect(center).toContain('y="500"');
  });
});
