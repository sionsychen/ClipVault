import { describe, it, expect } from 'vitest';
import { CLIP_TYPES, DB_NAME } from '../src/core/constants.js';

describe('scaffold', () => {
  it('exposes constants', () => {
    expect(DB_NAME).toBe('clipvault');
    expect(CLIP_TYPES.IMAGE).toBe('image');
  });
});
