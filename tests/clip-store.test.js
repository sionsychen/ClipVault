import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  addClip, getAllClips, updateClip, deleteClip,
  getProjects, addProject, getTags, bumpTags,
} from '../src/db/clip-store.js';
import { DB_NAME } from '../src/core/constants.js';

function resetDb() {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

beforeEach(resetDb);

const sampleClip = () => ({
  type: 'image',
  sourceUrl: 'https://site/page',
  pageTitle: 'demo',
  content: 'https://site/img.jpg',
  project: 'X6',
  tags: ['参考'],
});

describe('clip-store clips', () => {
  it('adds a clip and reads it back', async () => {
    const r = await addClip(sampleClip());
    expect(r.status).toBe('added');
    const all = await getAllClips();
    expect(all).toHaveLength(1);
    expect(all[0].project).toBe('X6');
    expect(all[0].createdAt).toBeTypeOf('number');
  });

  it('dedups identical sourceUrl + content', async () => {
    await addClip(sampleClip());
    const r2 = await addClip(sampleClip());
    expect(r2.status).toBe('duplicate');
    expect(await getAllClips()).toHaveLength(1);
  });

  it('updates a clip', async () => {
    const { id } = await addClip(sampleClip());
    const updated = await updateClip(id, { note: 'hello', tags: ['参考', '街道'] });
    expect(updated.note).toBe('hello');
    expect(updated.tags).toContain('街道');
  });

  it('deletes a clip', async () => {
    const { id } = await addClip(sampleClip());
    await deleteClip(id);
    expect(await getAllClips()).toHaveLength(0);
  });
});

describe('clip-store projects', () => {
  it('adds and lists projects', async () => {
    await addProject('X6');
    await addProject('Kitty');
    expect(await getProjects()).toEqual(expect.arrayContaining(['X6', 'Kitty']));
  });

  it('updateClip with a new project registers it', async () => {
    const { id } = await addClip(sampleClip());
    await updateClip(id, { project: 'Moodboard' });
    expect(await getProjects()).toContain('Moodboard');
    const all = await getAllClips();
    expect(all[0].project).toBe('Moodboard');
  });
});

describe('clip-store tags', () => {
  it('bumps tag counts and sorts desc', async () => {
    await bumpTags(['a', 'b']);
    await bumpTags(['a']);
    const tags = await getTags();
    expect(tags[0]).toEqual({ name: 'a', count: 2 });
    expect(tags.find((t) => t.name === 'b').count).toBe(1);
  });

  it('addClip auto-bumps its tags', async () => {
    await addClip(sampleClip());
    const tags = await getTags();
    expect(tags.find((t) => t.name === '参考').count).toBe(1);
  });
});
