import {
  DB_NAME, DB_VERSION, STORE_CLIPS, STORE_PROJECTS, STORE_TAGS,
} from '../core/constants.js';
import { makeClipKey } from '../core/clip-key.js';

export function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CLIPS)) {
        const s = db.createObjectStore(STORE_CLIPS, { keyPath: 'id', autoIncrement: true });
        s.createIndex('clipKey', 'clipKey', { unique: false });
        s.createIndex('project', 'project', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        db.createObjectStore(STORE_PROJECTS, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(STORE_TAGS)) {
        db.createObjectStore(STORE_TAGS, { keyPath: 'name' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withDb(fn) {
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

function reqToPromise(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

function txDone(t) {
  return new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

function findByClipKey(db, clipKey) {
  return new Promise((res, rej) => {
    const idx = db.transaction([STORE_CLIPS], 'readonly').objectStore(STORE_CLIPS).index('clipKey');
    const req = idx.get(clipKey);
    req.onsuccess = () => res(req.result || null);
    req.onerror = () => rej(req.error);
  });
}

export async function addClip(clip) {
  const record = await withDb(async (db) => {
    const clipKey = makeClipKey(clip.sourceUrl, clip.content);
    const existing = await findByClipKey(db, clipKey);
    if (existing) return { result: { status: 'duplicate', id: existing.id }, tags: [] };

    const newRecord = {
      type: clip.type,
      sourceUrl: clip.sourceUrl,
      pageTitle: clip.pageTitle || '',
      thumbnail: clip.thumbnail || null,
      content: clip.content || '',
      project: clip.project,
      tags: clip.tags || [],
      note: clip.note || '',
      createdAt: clip.createdAt || Date.now(),
      clipKey,
    };
    const t = db.transaction([STORE_CLIPS], 'readwrite');
    const id = await reqToPromise(t.objectStore(STORE_CLIPS).add(newRecord));
    await txDone(t);
    return { result: { status: 'added', id }, tags: newRecord.tags };
  });
  await bumpTags(record.tags);
  return record.result;
}

export async function getAllClips() {
  return withDb((db) => reqToPromise(db.transaction([STORE_CLIPS], 'readonly').objectStore(STORE_CLIPS).getAll()));
}

export async function updateClip(id, patch) {
  const updated = await withDb(async (db) => {
    const t = db.transaction([STORE_CLIPS], 'readwrite');
    const store = t.objectStore(STORE_CLIPS);
    const current = await reqToPromise(store.get(id));
    if (!current) {
      await txDone(t);
      return null;
    }
    const next = { ...current, ...patch };
    if ('content' in patch || 'sourceUrl' in patch) {
      next.clipKey = makeClipKey(next.sourceUrl, next.content);
    }
    await reqToPromise(store.put(next));
    await txDone(t);
    return next;
  });
  if (patch.tags) await bumpTags(patch.tags);
  return updated;
}

export async function deleteClip(id) {
  return withDb(async (db) => {
    const t = db.transaction([STORE_CLIPS], 'readwrite');
    await reqToPromise(t.objectStore(STORE_CLIPS).delete(id));
    await txDone(t);
    return true;
  });
}

export async function getProjects() {
  return withDb(async (db) => {
    const rows = await reqToPromise(
      db.transaction([STORE_PROJECTS], 'readonly').objectStore(STORE_PROJECTS).getAll()
    );
    return rows.map((r) => r.name);
  });
}

export async function addProject(name) {
  return withDb(async (db) => {
    const t = db.transaction([STORE_PROJECTS], 'readwrite');
    await reqToPromise(t.objectStore(STORE_PROJECTS).put({ name }));
    await txDone(t);
    return true;
  });
}

export async function getTags() {
  return withDb(async (db) => {
    const rows = await reqToPromise(
      db.transaction([STORE_TAGS], 'readonly').objectStore(STORE_TAGS).getAll()
    );
    return rows.sort((a, b) => b.count - a.count);
  });
}

export async function bumpTags(tagNames) {
  if (!tagNames || !tagNames.length) return;
  return withDb(async (db) => {
    const t = db.transaction([STORE_TAGS], 'readwrite');
    const store = t.objectStore(STORE_TAGS);
    for (const name of tagNames) {
      const cur = await reqToPromise(store.get(name));
      await reqToPromise(store.put({ name, count: (cur?.count || 0) + 1 }));
    }
    await txDone(t);
  });
}

// 运行时用量估算(库页面用);无 navigator.storage 时返回 0。
export async function estimateUsage() {
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    const { usage, quota } = await navigator.storage.estimate();
    return { usage: usage || 0, quota: quota || 0 };
  }
  return { usage: 0, quota: 0 };
}
