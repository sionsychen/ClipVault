import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  addClip, getAllClips, updateClip, deleteClip,
  getProjects, addProject, getTags, bumpTags,
  removeTag, recountTags, saveFullImage, getFullImage,
  removeProject,
} from '../src/db/clip-store.js';
import { DB_NAME, DEFAULT_PROJECT } from '../src/core/constants.js';

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

  it('removeProject moves its clips to the default project and drops the record', async () => {
    const { id } = await addClip(sampleClip()); // project: 'X6'
    await addProject('X6');
    const n = await removeProject('X6');
    expect(n).toBe(1);
    expect(await getProjects()).not.toContain('X6');
    const all = await getAllClips();
    expect(all[0].id).toBe(id); // clip 未被删
    expect(all[0].project).toBe(DEFAULT_PROJECT);
  });

  it('removeProject only touches clips in that project', async () => {
    await addClip(sampleClip()); // X6
    await addClip({ ...sampleClip(), sourceUrl: 'https://other', content: 'https://other/i.jpg', project: 'Kitty' });
    const n = await removeProject('X6');
    expect(n).toBe(1);
    const all = await getAllClips();
    const kitty = all.find((c) => c.project === 'Kitty');
    expect(kitty).toBeTruthy(); // Kitty 不受影响
  });

  it('removeProject refuses to delete the default project (no-op)', async () => {
    await addClip({ ...sampleClip(), project: DEFAULT_PROJECT });
    const n = await removeProject(DEFAULT_PROJECT);
    expect(n).toBe(0);
    const all = await getAllClips();
    expect(all[0].project).toBe(DEFAULT_PROJECT);
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

  it('removeTag strips a tag from all clips and drops the tag record', async () => {
    await addClip({ ...sampleClip(), sourceUrl: 'https://s/1', content: 'c1', tags: ['keep', 'drop'] });
    await addClip({ ...sampleClip(), sourceUrl: 'https://s/2', content: 'c2', tags: ['drop'] });
    const affected = await removeTag('drop');
    expect(affected).toBe(2);
    const all = await getAllClips();
    expect(all.every((c) => !c.tags.includes('drop'))).toBe(true);
    expect((await getTags()).find((t) => t.name === 'drop')).toBeUndefined();
  });

  it('editing a clip to remove a tag lowers its count via recount', async () => {
    const { id } = await addClip({ ...sampleClip(), tags: ['a', 'b'] });
    await updateClip(id, { tags: ['a'] });
    const tags = await getTags();
    expect(tags.find((t) => t.name === 'a').count).toBe(1);
    expect(tags.find((t) => t.name === 'b')).toBeUndefined();
  });

  it('recountTags rebuilds counts from clip state', async () => {
    await addClip({ ...sampleClip(), sourceUrl: 'https://s/1', content: 'c1', tags: ['x'] });
    await addClip({ ...sampleClip(), sourceUrl: 'https://s/2', content: 'c2', tags: ['x', 'y'] });
    await recountTags();
    const tags = await getTags();
    expect(tags.find((t) => t.name === 'x').count).toBe(2);
    expect(tags.find((t) => t.name === 'y').count).toBe(1);
  });
});

describe('clip-store full images', () => {
  const blob = () => new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/png' });

  it('saves and reads back a full image, and flags the clip', async () => {
    const { id } = await addClip(sampleClip());
    await saveFullImage(id, blob());
    const got = await getFullImage(id);
    expect(got).toBeInstanceOf(Blob);
    expect(got.size).toBe(4);
    const clip = (await getAllClips()).find((c) => c.id === id);
    expect(clip.gotImage).toBe(true);
  });

  it('deleteClip also removes the stored image', async () => {
    const { id } = await addClip(sampleClip());
    await saveFullImage(id, blob());
    await deleteClip(id);
    expect(await getFullImage(id)).toBeNull();
  });
});
