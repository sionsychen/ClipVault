import {
  DB_NAME, DB_VERSION, STORE_CLIPS, STORE_PROJECTS, STORE_TAGS, STORE_IMAGES,
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
      // v2: 原图字节单独一库,按 clipId 键。列表不碰它,只有灯箱按需取。
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: 'clipId' });
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
  // tags 编辑可增可减,重算保证计数与实际一致(bumpTags 只增不减)。
  if (patch.tags) await recountTags();
  // 改项目时登记(含库内移动/气泡新建的项目),让侧栏能列出它。
  if (updated && patch.project) await addProject(patch.project);
  return updated;
}

export async function deleteClip(id) {
  return withDb(async (db) => {
    const t = db.transaction([STORE_CLIPS, STORE_IMAGES], 'readwrite');
    await reqToPromise(t.objectStore(STORE_CLIPS).delete(id));
    await reqToPromise(t.objectStore(STORE_IMAGES).delete(id)); // 连带删原图,不留孤儿
    await txDone(t);
    return true;
  });
}

// 存原图字节(Blob),按 clipId 键。gotImage 标记回写到 clip 记录,
// 供列表判断"点开有大图可看"。
export async function saveFullImage(clipId, blob) {
  if (clipId == null || !blob) return false;
  return withDb(async (db) => {
    const t = db.transaction([STORE_IMAGES, STORE_CLIPS], 'readwrite');
    await reqToPromise(t.objectStore(STORE_IMAGES).put({ clipId, blob, mime: blob.type || '' }));
    const clipStore = t.objectStore(STORE_CLIPS);
    const clip = await reqToPromise(clipStore.get(clipId));
    if (clip && !clip.gotImage) {
      await reqToPromise(clipStore.put({ ...clip, gotImage: true }));
    }
    await txDone(t);
    return true;
  });
}

// 按需取原图 Blob;无则 null(灯箱回退到 content URL)。
export async function getFullImage(clipId) {
  return withDb(async (db) => {
    const rec = await reqToPromise(
      db.transaction([STORE_IMAGES], 'readonly').objectStore(STORE_IMAGES).get(clipId)
    );
    return rec?.blob || null;
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

// 全局删 tag:从所有 clip 的 tags 里剔除它,再删 tag 记录。返回受影响的 clip 数。
export async function removeTag(name) {
  return withDb(async (db) => {
    const t = db.transaction([STORE_CLIPS, STORE_TAGS], 'readwrite');
    const clipStore = t.objectStore(STORE_CLIPS);
    const clips = await reqToPromise(clipStore.getAll());
    let affected = 0;
    for (const c of clips) {
      if (c.tags?.includes(name)) {
        await reqToPromise(clipStore.put({ ...c, tags: c.tags.filter((x) => x !== name) }));
        affected++;
      }
    }
    await reqToPromise(t.objectStore(STORE_TAGS).delete(name));
    await txDone(t);
    return affected;
  });
}

// 从 clip 现状重算全部 tag 计数,把结果覆盖进 tags 库(删除已无引用的 tag)。
// bumpTags 只增不减,编辑移除 tag 后靠这个把计数与侧栏对齐。
export async function recountTags() {
  return withDb(async (db) => {
    const t = db.transaction([STORE_CLIPS, STORE_TAGS], 'readwrite');
    const clips = await reqToPromise(t.objectStore(STORE_CLIPS).getAll());
    const counts = new Map();
    for (const c of clips) {
      for (const tag of c.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    const tagStore = t.objectStore(STORE_TAGS);
    const existing = await reqToPromise(tagStore.getAll());
    for (const row of existing) {
      if (!counts.has(row.name)) await reqToPromise(tagStore.delete(row.name));
    }
    for (const [name, count] of counts) {
      await reqToPromise(tagStore.put({ name, count }));
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

export const EXPORT_VERSION = 2;

// 整库快照。原图 Blob 转 base64 dataURL 塞进各 clip 的 fullImage 字段
// (JSON 存不了 Blob)。tags 计数不导出——导入时重建。
export async function exportData() {
  const [clips, projects] = await Promise.all([getAllClips(), getProjects()]);
  const out = [];
  for (const c of clips) {
    const copy = { ...c };
    delete copy.gotImage; // 运行时派生标记,不进备份
    if (c.gotImage) {
      const blob = await getFullImage(c.id);
      if (blob) copy.fullImage = await blobToDataUrl(blob);
    }
    out.push(copy);
  }
  return {
    app: 'clipvault',
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    clips: out,
    projects,
  };
}

// 逐条 addClip 走 clipKey 去重,天然做增量 merge;createdAt 透传保序。
// 带 fullImage(dataURL)的还原原图字节。返回 { added, skipped }。
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
    if (r.status === 'added') {
      added++;
      if (c.fullImage) {
        const blob = dataUrlToBlob(c.fullImage);
        if (blob) await saveFullImage(r.id, blob);
      }
    } else {
      skipped++;
    }
  }
  for (const name of payload.projects || []) {
    if (name) await addProject(name);
  }
  return { added, skipped };
}

async function blobToDataUrl(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  const mime = blob.type || 'application/octet-stream';
  return `data:${mime};base64,${btoa(bin)}`;
}

function dataUrlToBlob(dataUrl) {
  const m = /^data:([^;,]*)(;base64)?,(.*)$/s.exec(dataUrl || '');
  if (!m) return null;
  const mime = m[1] || 'application/octet-stream';
  const isB64 = !!m[2];
  const data = isB64 ? atob(m[3]) : decodeURIComponent(m[3]);
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

