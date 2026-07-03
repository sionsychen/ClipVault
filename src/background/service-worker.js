import { MSG, CLIP_TYPES, DEFAULT_PROJECT, LAST_PROJECT_KEY } from '../core/constants.js';
import { addClip, updateClip, addProject } from '../db/clip-store.js';
import { inferTags } from '../core/tag-inference.js';

const MENU = {
  IMAGE: 'clipvault-image',
  SELECTION: 'clipvault-selection',
  LINK: 'clipvault-link',
  PAGE: 'clipvault-page',
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU.IMAGE, title: '剪藏这张图片', contexts: ['image'] });
    chrome.contextMenus.create({ id: MENU.SELECTION, title: '剪藏选中文本', contexts: ['selection'] });
    chrome.contextMenus.create({ id: MENU.LINK, title: '剪藏这个链接', contexts: ['link'] });
    chrome.contextMenus.create({ id: MENU.PAGE, title: '剪藏整个页面', contexts: ['page'] });
  });
});

// 点击工具栏图标打开库
chrome.action.onClicked.addListener(() => openLibrary());

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab?.id) return;
  chrome.tabs.sendMessage(tab.id, {
    type: MSG.CAPTURE_TRIGGER,
    menuId: info.menuItemId,
    srcUrl: info.srcUrl || '',
    linkUrl: info.linkUrl || '',
    selectionText: info.selectionText || '',
    pageUrl: info.pageUrl || tab.url || '',
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === MSG.CAPTURE) {
    handleCapture(msg.clip).then(sendResponse);
    return true; // async
  }
  if (msg?.type === MSG.SAVE_EDITS) {
    updateClip(msg.id, msg.patch).then((r) => sendResponse({ ok: !!r })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg?.type === 'clipvault:openLibrary') {
    openLibrary();
    sendResponse({ ok: true });
  }
  return false;
});

async function handleCapture(clip) {
  try {
    const project = clip.project || (await lastProject()) || DEFAULT_PROJECT;
    const inferred = inferTags(clip.sourceUrl, clip.pageTitle);
    const tags = [...new Set([...(clip.tags || []), ...inferred])];
    const record = {
      type: clip.type || CLIP_TYPES.TEXT,
      sourceUrl: clip.sourceUrl || '',
      pageTitle: clip.pageTitle || '',
      thumbnail: clip.thumbnail || null,
      content: clip.content || '',
      project,
      tags,
      note: clip.note || '',
    };
    const result = await addClip(record);
    if (project) await addProject(project);
    await setLastProject(project);
    return { ok: true, ...result, project, tags };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

function openLibrary() {
  const url = chrome.runtime.getURL('library.html');
  chrome.tabs.query({}, (tabs) => {
    const existing = tabs.find((t) => t.url === url);
    if (existing) chrome.tabs.update(existing.id, { active: true });
    else chrome.tabs.create({ url });
  });
}

function lastProject() {
  return new Promise((res) => {
    chrome.storage.local.get(LAST_PROJECT_KEY, (o) => res(o[LAST_PROJECT_KEY]));
  });
}

function setLastProject(name) {
  return new Promise((res) => {
    chrome.storage.local.set({ [LAST_PROJECT_KEY]: name }, res);
  });
}
