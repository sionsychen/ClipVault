import { describe, it, expect } from 'vitest';
import { djb2, makeClipKey } from '../src/core/clip-key.js';

describe('djb2', () => {
  it('is deterministic', () => {
    expect(djb2('hello')).toBe(djb2('hello'));
  });
  it('differs for different input', () => {
    expect(djb2('a')).not.toBe(djb2('b'));
  });
  it('handles empty string', () => {
    expect(typeof djb2('')).toBe('string');
  });
});

describe('makeClipKey', () => {
  it('same url+content => same key', () => {
    expect(makeClipKey('http://x/a', 'foo')).toBe(makeClipKey('http://x/a', 'foo'));
  });
  it('different content => different key', () => {
    expect(makeClipKey('http://x/a', 'foo')).not.toBe(makeClipKey('http://x/a', 'bar'));
  });
  it('different url => different key', () => {
    expect(makeClipKey('http://x/a', 'foo')).not.toBe(makeClipKey('http://x/b', 'foo'));
  });
  it('tolerates null/undefined', () => {
    expect(typeof makeClipKey(undefined, undefined)).toBe('string');
  });
});
