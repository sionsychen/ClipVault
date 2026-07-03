import { describe, it, expect } from 'vitest';
import { buildCardModel } from '../src/library/render.js';

describe('buildCardModel', () => {
  it('image clip falls back to content url when no thumbnail', () => {
    const m = buildCardModel({ id: 1, type: 'image', thumbnail: null, content: 'http://img', pageTitle: 't' });
    expect(m.image).toBe('http://img');
    expect(m.previewText).toBe('');
  });
  it('image clip prefers stored thumbnail', () => {
    const m = buildCardModel({ id: 1, type: 'image', thumbnail: 'data:...', content: 'http://img' });
    expect(m.image).toBe('data:...');
  });
  it('text clip truncates preview and has no image', () => {
    const long = 'x'.repeat(500);
    const m = buildCardModel({ id: 2, type: 'text', content: long });
    expect(m.image).toBeNull();
    expect(m.previewText.length).toBe(140);
  });
  it('defaults tags to empty array', () => {
    const m = buildCardModel({ id: 3, type: 'video', content: 'http://v' });
    expect(m.tags).toEqual([]);
  });
});
