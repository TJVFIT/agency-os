/**
 * edit_photo spec → sharp pipeline compiler (UPGRADE_SPEC §11a) — pure,
 * unit-tested. Produces an ordered op list the handler replays onto a sharp
 * instance, plus the SVG text-overlay buffer. No sharp import here.
 */

import type { PhotoEditSpec } from '../../lib/ai/schemas';

export type PhotoOp =
  | { op: 'rotate'; deg: 90 | 180 | 270 }
  | { op: 'cover'; width: number; height: number }
  | { op: 'modulate'; brightness: number; saturation: number; hue: number }
  | { op: 'grayscale' }
  | { op: 'sharpen' }
  | { op: 'overlay'; svg: string }
  | { op: 'output'; format: 'jpeg' | 'png' };

const CROP_SIZES: Record<'square' | 'portrait' | 'story', [number, number]> = {
  square: [1080, 1080],
  portrait: [1080, 1350],
  story: [1080, 1920],
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Bold white caption with a dark stroke, sized/positioned for the canvas. */
export function buildOverlaySvg(
  text: string,
  width: number,
  height: number,
  position: PhotoEditSpec['overlay_position'],
): string {
  const fontSize = Math.round(width / 14);
  const y =
    position === 'top'
      ? Math.round(fontSize * 1.6)
      : position === 'center'
        ? Math.round(height / 2)
        : Math.round(height - fontSize * 1.1);
  return (
    `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">` +
    `<text x="50%" y="${y}" text-anchor="middle" ` +
    `font-family="Noto Sans, sans-serif" font-weight="700" ` +
    `font-size="${fontSize}" fill="#ffffff" stroke="#000000" ` +
    `stroke-width="${Math.max(2, Math.round(fontSize / 18))}" paint-order="stroke">` +
    `${escapeXml(text)}</text></svg>`
  );
}

/** Output canvas after rotate + crop, given the source dimensions. */
export function outputDimensions(
  spec: PhotoEditSpec,
  source: { width: number; height: number },
): { width: number; height: number } {
  if (spec.crop !== 'original') {
    const [width, height] = CROP_SIZES[spec.crop];
    return { width, height };
  }
  const swapped = spec.rotate === 90 || spec.rotate === 270;
  return swapped
    ? { width: source.height, height: source.width }
    : { width: source.width, height: source.height };
}

export function compilePhotoEdit(
  spec: PhotoEditSpec,
  source: { width: number; height: number },
): PhotoOp[] {
  const ops: PhotoOp[] = [];
  if (spec.rotate !== 0) ops.push({ op: 'rotate', deg: spec.rotate });
  if (spec.crop !== 'original') {
    const [width, height] = CROP_SIZES[spec.crop];
    ops.push({ op: 'cover', width, height });
  }
  if (spec.brightness !== 1 || spec.saturation !== 1 || spec.hue !== 0) {
    ops.push({
      op: 'modulate',
      brightness: spec.brightness,
      saturation: spec.saturation,
      hue: spec.hue,
    });
  }
  if (spec.grayscale) ops.push({ op: 'grayscale' });
  if (spec.sharpen) ops.push({ op: 'sharpen' });
  if (spec.overlay_text.trim()) {
    const { width, height } = outputDimensions(spec, source);
    ops.push({
      op: 'overlay',
      svg: buildOverlaySvg(
        spec.overlay_text.trim(),
        width,
        height,
        spec.overlay_position,
      ),
    });
  }
  ops.push({ op: 'output', format: spec.format });
  return ops;
}
