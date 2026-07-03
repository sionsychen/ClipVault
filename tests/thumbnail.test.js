import { describe, it, expect } from 'vitest';
import { computeThumbDimensions } from '../src/core/thumbnail.js';

describe('computeThumbDimensions', () => {
  it('does not upscale small images', () => {
    expect(computeThumbDimensions(100, 80, 320)).toEqual({ width: 100, height: 80 });
  });
  it('scales landscape to maxDim on width', () => {
    expect(computeThumbDimensions(640, 320, 320)).toEqual({ width: 320, height: 160 });
  });
  it('scales portrait to maxDim on height', () => {
    expect(computeThumbDimensions(320, 640, 320)).toEqual({ width: 160, height: 320 });
  });
  it('returns zero size for missing dimensions', () => {
    expect(computeThumbDimensions(0, 0, 320)).toEqual({ width: 0, height: 0 });
  });
});
