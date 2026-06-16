import { describe, expect, it } from 'vitest';

import { type Dimensions, findOffenders, readPngDimensions } from '../assert-screenshot-dimensions';

/** Build a minimal valid PNG header: signature + IHDR length + "IHDR" + width/height. */
function pngHeader({ width, height }: Dimensions): Buffer {
  const buffer = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8); // IHDR data length
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe('readPngDimensions', () => {
  it('reads width/height from a valid PNG IHDR', () => {
    expect(readPngDimensions(pngHeader({ width: 1320, height: 2868 }))).toEqual({
      width: 1320,
      height: 2868,
    });
  });

  it('throws on a non-PNG buffer', () => {
    expect(() => readPngDimensions(Buffer.from('this is not a png at all'))).toThrow(/PNG/);
  });

  it('throws on a truncated buffer', () => {
    expect(() => readPngDimensions(Buffer.alloc(10))).toThrow();
  });
});

describe('findOffenders', () => {
  const slug = 'iphone-16-pro-max';

  it('accepts the iPhone 16 Pro Max native size', () => {
    const offenders = findOffenders(slug, [
      { name: `${slug}/00-home.png`, buffer: pngHeader({ width: 1320, height: 2868 }) },
    ]);
    expect(offenders).toEqual([]);
  });

  it('accepts the alternate 6.9" size (1290x2796)', () => {
    const offenders = findOffenders(slug, [
      { name: `${slug}/00-home.png`, buffer: pngHeader({ width: 1290, height: 2796 }) },
    ]);
    expect(offenders).toEqual([]);
  });

  it('flags a wrong size, reporting both file and dimensions', () => {
    const offenders = findOffenders(slug, [
      { name: `${slug}/bad.png`, buffer: pngHeader({ width: 1284, height: 2778 }) },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].file).toBe(`${slug}/bad.png`);
    expect(offenders[0].reason).toMatch(/1284x2778/);
  });

  it('fails closed for an unknown device slug', () => {
    const offenders = findOffenders('pixel-9-pro', [
      { name: 'pixel-9-pro/00-home.png', buffer: pngHeader({ width: 1320, height: 2868 }) },
    ]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0].reason).toMatch(/no accepted-size list/);
  });

  it('reports a corrupt PNG as an offender rather than throwing', () => {
    const offenders = findOffenders(slug, [{ name: `${slug}/corrupt.png`, buffer: Buffer.alloc(4) }]);
    expect(offenders).toHaveLength(1);
  });
});
