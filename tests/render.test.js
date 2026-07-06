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
  it('video clip is flagged isVideo and uses thumbnail as image', () => {
    const m = buildCardModel({ id: 4, type: 'video', thumbnail: 'https://img.youtube.com/vi/x/hqdefault.jpg', content: 'https://youtu.be/x' });
    expect(m.isVideo).toBe(true);
    expect(m.image).toBe('https://img.youtube.com/vi/x/hqdefault.jpg');
    expect(m.previewText).toBe('');
  });
  it('tweet clip shows url as preview and no image', () => {
    const m = buildCardModel({ id: 5, type: 'tweet', content: 'https://x.com/u/status/1' });
    expect(m.isVideo).toBe(false);
    expect(m.image).toBeNull();
    expect(m.previewText).toBe('https://x.com/u/status/1');
  });

  it('image clip without stored full image is flagged linkOnly', () => {
    const m = buildCardModel({ id: 6, type: 'image', content: 'http://cdn/x.jpg', thumbnail: 'data:...' });
    expect(m.linkOnly).toBe(true);
  });
  it('image clip with stored full image is not linkOnly', () => {
    const m = buildCardModel({ id: 7, type: 'image', content: 'http://cdn/x.jpg', thumbnail: 'data:...', gotImage: true });
    expect(m.linkOnly).toBe(false);
  });
  it('non-image clips are never linkOnly', () => {
    expect(buildCardModel({ id: 8, type: 'text', content: 'hi' }).linkOnly).toBe(false);
    expect(buildCardModel({ id: 9, type: 'video', content: 'http://v' }).linkOnly).toBe(false);
  });
});
