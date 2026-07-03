import { describe, it, expect } from 'vitest';
import { detectMediaType, youtubeId, isTweetUrl } from '../src/core/media-type.js';

describe('youtubeId', () => {
  it('extracts id from watch url', () => {
    expect(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('extracts id from youtu.be short url', () => {
    expect(youtubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('extracts id from /shorts/ url', () => {
    expect(youtubeId('https://www.youtube.com/shorts/abc123XYZ_-')).toBe('abc123XYZ_-');
  });
  it('extracts id from /embed/ url', () => {
    expect(youtubeId('https://youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });
  it('returns empty for non-youtube url', () => {
    expect(youtubeId('https://example.com/watch?v=x')).toBe('');
  });
  it('returns empty for invalid url', () => {
    expect(youtubeId('not a url')).toBe('');
  });
});

describe('isTweetUrl', () => {
  it('matches x.com status', () => {
    expect(isTweetUrl('https://x.com/user/status/1234567890')).toBe(true);
  });
  it('matches twitter.com status', () => {
    expect(isTweetUrl('https://twitter.com/foo/status/999')).toBe(true);
  });
  it('rejects x.com profile', () => {
    expect(isTweetUrl('https://x.com/user')).toBe(false);
  });
  it('rejects non-twitter host', () => {
    expect(isTweetUrl('https://example.com/user/status/1')).toBe(false);
  });
});

describe('detectMediaType', () => {
  it('returns VIDEO with youtube thumbnail', () => {
    const r = detectMediaType('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(r.type).toBe('video');
    expect(r.videoId).toBe('dQw4w9WgXcQ');
    expect(r.thumbnail).toBe('https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });
  it('returns TWEET with no thumbnail', () => {
    const r = detectMediaType('https://x.com/user/status/1234567890');
    expect(r.type).toBe('tweet');
    expect(r.thumbnail).toBeNull();
  });
  it('returns null for a plain link', () => {
    expect(detectMediaType('https://example.com/article')).toBeNull();
  });
});
