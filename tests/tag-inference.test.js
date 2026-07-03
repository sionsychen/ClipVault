import { describe, it, expect } from 'vitest';
import { domainOf, inferTags } from '../src/core/tag-inference.js';

describe('domainOf', () => {
  it('extracts host without www', () => {
    expect(domainOf('https://www.artstation.com/foo')).toBe('artstation.com');
  });
  it('returns empty string for invalid url', () => {
    expect(domainOf('not a url')).toBe('');
  });
});

describe('inferTags', () => {
  it('maps artstation domain to reference', () => {
    expect(inferTags('https://www.artstation.com/x', '')).toContain('reference');
  });
  it('maps title keyword UI to UI tag', () => {
    expect(inferTags('https://example.com', 'A UI Kit for games')).toContain('UI');
  });
  it('combines domain + title tags, deduped', () => {
    const tags = inferTags('https://dribbble.com/x', 'shader study');
    expect(tags).toContain('design');
    expect(tags).toContain('shader');
    expect(new Set(tags).size).toBe(tags.length);
  });
  it('returns empty array for unknown domain + plain title', () => {
    expect(inferTags('https://random-blog.example', 'hello world')).toEqual([]);
  });
});
