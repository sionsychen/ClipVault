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
    return { result: { status: 'added', id }, tags: newRecord.tags, project: newRecord.project };
  });
  await bumpTags(record.tags);
  // 登记项目,让"含 clip 的项目"始终出现在项目列表里,与调用方无关。
  if (record.project) await addProject(record.project);
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
  // 改项目时登记(含库内移动/气泡新建的项目),让侧栏能列出它。
  if (updated && patch.project) await addProject(patch.project);
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

export const EXPORT_VERSION = 1;

// 整库快照。tags 计数不导出——导入时由 addClip→bumpTags 自然重建,
// 避免快照 count 与实际 clip 数对不上。
export async function exportData() {
  const [clips, projects] = await Promise.all([getAllClips(), getProjects()]);
  return {
    app: 'clipvault',
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    clips,
    projects,
  };
}

// 逐条 addClip 走 clipKey 去重,天然做增量 merge;createdAt 透传保序。
// 返回 { added, skipped } 供 UI 反馈。
export async function importData(payload) {
  if (!payload || !Array.isArray(payload.clips)) {
    throw new Error('Invalid backup file');
  }
  let added = 0;
  let skipped = 0;
  for (const c of payload.clips) {
    const r = await addClip({
      type: c.type,
      sourceUrl: c.sourceUrl,
      pageTitle: c.pageTitle,
      thumbnail: c.thumbnail,
      content: c.content,
      project: c.project,
      tags: c.tags,
      note: c.note,
      createdAt: c.createdAt,
    });
    if (r.status === 'added') added++;
    else skipped++;
  }
  for (const name of payload.projects || []) {
    if (name) await addProject(name);
  }
  return { added, skipped };
}

