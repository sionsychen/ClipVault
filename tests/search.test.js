import { describe, it, expect } from 'vitest';
import { filterClips } from '../src/core/search.js';

const clips = [
  { id: 1, project: 'X6', tags: ['参考', '街道'], pageTitle: '赛博朋克街道', note: '', content: 'neon city' },
  { id: 2, project: 'X6', tags: ['UI'], pageTitle: 'UI Kit', note: '按钮样式', content: 'buttons' },
  { id: 3, project: 'Kitty', tags: ['参考'], pageTitle: '猫咪', note: '', content: 'cat reference' },
];

describe('filterClips', () => {
  it('returns all when no filters', () => {
    expect(filterClips(clips, {})).toHaveLength(3);
  });
  it('filters by project', () => {
    expect(filterClips(clips, { project: 'X6' }).map((c) => c.id)).toEqual([1, 2]);
  });
  it('filters by tags with AND semantics', () => {
    expect(filterClips(clips, { tags: ['参考', '街道'] }).map((c) => c.id)).toEqual([1]);
  });
  it('full-text search matches title', () => {
    expect(filterClips(clips, { query: '赛博朋克' }).map((c) => c.id)).toEqual([1]);
  });
  it('full-text search matches note and content, case-insensitive', () => {
    expect(filterClips(clips, { query: 'BUTTON' }).map((c) => c.id)).toEqual([2]);
    expect(filterClips(clips, { query: '按钮' }).map((c) => c.id)).toEqual([2]);
  });
  it('stacks project + tag + query', () => {
    expect(filterClips(clips, { project: 'X6', tags: ['参考'], query: 'neon' }).map((c) => c.id)).toEqual([1]);
  });
});
