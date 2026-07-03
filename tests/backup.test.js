import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  addClip, getAllClips, deleteClip, getProjects, getTags,
  exportData, importData,
} from '../src/db/clip-store.js';
import { DB_NAME } from '../src/core/constants.js';

function resetDb() {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

beforeEach(resetDb);

const clipA = () => ({
  type: 'image', sourceUrl: 'https://site/a', pageTitle: 'A',
  content: 'https://site/a.jpg', project: 'X6', tags: ['ref'], createdAt: 1000,
});
const clipB = () => ({
  type: 'text', sourceUrl: 'https://site/b', pageTitle: 'B',
  content: 'hello world', project: 'Kitty', tags: ['note'], createdAt: 2000,
});

describe('exportData', () => {
  it('captures clips and projects with a version', async () => {
    await addClip(clipA());
    await addClip(clipB());
    const data = await exportData();
    expect(data.app).toBe('clipvault');
    expect(data.version).toBe(1);
    expect(data.clips).toHaveLength(2);
    expect(data.projects).toEqual(expect.arrayContaining(['X6', 'Kitty']));
  });
});

describe('importData round-trip', () => {
  it('restores clips after the db is wiped', async () => {
    await addClip(clipA());
    await addClip(clipB());
    const backup = await exportData();

    await resetDb();
    expect(await getAllClips()).toHaveLength(0);

    const r = await importData(backup);
    expect(r.added).toBe(2);
    expect(r.skipped).toBe(0);

    const all = await getAllClips();
    expect(all).toHaveLength(2);
    expect(all.map((c) => c.createdAt).sort()).toEqual([1000, 2000]);
    expect(await getProjects()).toEqual(expect.arrayContaining(['X6', 'Kitty']));
    // tag 计数由 addClip 重建
    expect(await getTags()).toEqual(expect.arrayContaining([
      { name: 'ref', count: 1 }, { name: 'note', count: 1 },
    ]));
  });

  it('skips duplicates on re-import (idempotent merge)', async () => {
    await addClip(clipA());
    const backup = await exportData();
    const r = await importData(backup); // 导回同一份
    expect(r.added).toBe(0);
    expect(r.skipped).toBe(1);
    expect(await getAllClips()).toHaveLength(1);
  });

  it('rejects a malformed payload', async () => {
    await expect(importData({ nope: true })).rejects.toThrow();
  });
});
